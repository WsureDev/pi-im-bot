import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import type { HttpServices } from '../http/app'
import { SettingsEditError } from '../settings/editor'
import { PluginConfigValidationError } from '../plugins/configuration/values'
import { ReadConfigSecretsSchema } from '../plugins/configuration/secret-editor'
import { ControlScopes } from './scopes'
import { capabilityRows, defaultAccess } from './capabilities'
import { ControlSnapshotSchema, SaveAccessSchema, SaveLiveFlowSchema } from './contracts'
import { liveFlow, saveLiveFlow } from './flow'
import { ControlError } from './error'
import { ResourceProviderCatalog } from '../resource-providers/catalog'
import { InvokeResourceSchema, SaveResourceConfigSchema } from '../resource-providers/contracts'
import { invokeResource } from '../resource-providers/dispatch'
import { localIdentity } from '../permissions/identity'
import { pluginOperationId } from '../plugins/identity'
import { completedPluginResult } from '../plugins/result'
import { triggerRoles } from '../permissions/capability-policy'
import { PluginInvocationError } from '../plugins/rpc/peer'

const ScopeQuerySchema = z.object({ scope: z.string().default('global') })
const ToggleSchema = z.object({ revision: z.string(), enabled: z.boolean() }).strict()
const DiscoverSchema = z.object({ revision: z.string(), roomId: z.string() }).strict()

export function controlApp(host: HttpServices) {
  const app = new Hono()
  const scopes = new ControlScopes(host)
  const catalog = new ResourceProviderCatalog(host)
  app.onError((error, c) => {
    if (error instanceof PluginInvocationError && error.failure.code === 'unknown') {
      return c.json({ error: '操作结果尚未确认，请核对原任务或上游状态；不要自动重试。' }, 409)
    }
    if (error instanceof ControlError || error instanceof SettingsEditError) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof PluginConfigValidationError) {
      return c.json({ error: error.message, issues: error.issues }, 400)
    }
    if (error instanceof z.ZodError) {
      return c.json({ error: '输入不符合接口规范' }, 400)
    }
    return c.json({ error: '操作失败，请核对配置、执行环境和当前权限；请求不会自动重试。' }, 400)
  })
  app.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  app.get('/snapshot', sValidator('query', ScopeQuerySchema), async (c) => {
    const scopeId = c.req.valid('query').scope
    const scope = await scopes.read(scopeId)
    const config = host.configuration()
    const capabilities = capabilityRows(config)
    const policies = Object.fromEntries(
      capabilities.map((item) => {
        return [item.id, scope.settings.permissions.capabilityPolicies?.[item.id] ?? defaultAccess()]
      })
    )
    return c.json(
      ControlSnapshotSchema.parse({
        revision: scope.revision,
        scopeId,
        scopes: scopes.list(),
        plugins: config.resources.config.plugins.map((item) => {
          return { id: item.id, name: item.name, enabled: item.enabled }
        }),
        capabilities,
        policies,
        administrators: scope.settings.permissions.botAdministrators ?? []
      })
    )
  })
  app.put('/scopes/:id/policies', sValidator('json', SaveAccessSchema), async (c) => {
    const input = c.req.valid('json')
    const scope = await scopes.read(c.req.param('id'))
    const permissions = structuredClone(scope.settings.permissions)
    permissions.capabilityPolicies ??= {}
    const rows = capabilityRows(host.configuration())
    for (const [id, policy] of Object.entries(input.policies)) {
      const row = rows.find((entry) => {
        return entry.id === id
      })
      if (!row) {
        throw new ControlError('只能配置已注册能力')
      }
      permissions.capabilityPolicies[id] = policy
      for (const command of row.commandIds) {
        permissions.capabilityPolicies[command] = policy
      }
    }
    if (input.administrators) {
      if (c.req.param('id') !== 'global') {
        throw new ControlError('Bot 管理员名单只能在全局修改', 403)
      }
      permissions.botAdministrators = input.administrators
    }
    if (c.req.param('id') !== 'global') {
      delete permissions.botAdministrators
    }
    await scopes.save(c.req.param('id'), input.revision, { permissions })
    return c.json({ ok: true })
  })
  for (const path of ['/scopes/:id/flow', '/scopes/:id/plugins/:pluginId/flow']) {
    app.get(path, async (c) => {
      return c.json(await liveFlow(scopes, c.req.param('id')!, c.req.param('pluginId')))
    })
    app.put(path, sValidator('json', SaveLiveFlowSchema), async (c) => {
      await saveLiveFlow(scopes, c.req.param('id')!, c.req.valid('json'), c.req.param('pluginId'))
      return c.json(await liveFlow(scopes, c.req.param('id')!, c.req.param('pluginId')))
    })
  }
  app.get('/registry', async (c) => {
    return c.json(await catalog.read())
  })
  app.put('/providers/:id/registration', sValidator('json', ToggleSchema), async (c) => {
    const input = c.req.valid('json')
    if ((await catalog.read()).revision !== input.revision) {
      throw new ControlError('提供者目录已变化', 409)
    }
    catalog.provider(c.req.param('id'))
    const plugins = await host.pluginEditor.read()
    await host.pluginEditor.manage(plugins.revision, c.req.param('id'), { enabled: input.enabled })
    host.coordinator.events.emit({ type: 'config' })
    return c.json(await catalog.read())
  })
  app.post('/providers/:id/discovery', sValidator('json', DiscoverSchema), async (c) => {
    const input = c.req.valid('json')
    const { instance, bundle } = catalog.provider(c.req.param('id'))
    if ((await catalog.read()).revision !== input.revision) {
      throw new ControlError('提供者目录已变化', 409)
    }
    const operation = bundle.manifest.resourceProvider?.discover
    if (!operation) {
      return c.json(await catalog.read())
    }
    const service = host.coordinator.plugins
    if (!instance.enabled || !service?.available()) {
      throw new ControlError('提供者或执行环境未启用', 409)
    }
    const invocation = host.coordinator.jobInvocation(
      input.roomId,
      localIdentity('web', 'operator', 'operator', '本地操作员'),
      '发现资源'
    )
    const output = await service.scoped(input.roomId, instance.id, c.req.raw.signal, (signal) => {
      return service.execute(
        {
          ...invocation,
          origin: 'admin',
          readOnly: true,
          services: {
            authorize: invocation.authorize,
            history() {
              return []
            },
            async send() {
              throw new Error('发现操作不能发送消息')
            }
          }
        },
        pluginOperationId(instance.id, operation),
        {},
        crypto.randomUUID(),
        signal
      )
    })
    await catalog.acceptDiscovery(instance.id, input.revision, completedPluginResult(output).value)
    host.coordinator.events.emit({ type: 'config' })
    return c.json(await catalog.read())
  })
  for (const subject of ['provider', 'resource'] as const) {
    app.get('/' + subject + 's/:id/configuration', async (c) => {
      return c.json(await catalog.configuration(subject, c.req.param('id')!))
    })
    app.post(
      '/' + subject + 's/:id/configuration/secrets',
      sValidator('json', ReadConfigSecretsSchema),
      async (c) => {
        return c.json(await catalog.secrets(subject, c.req.param('id')!, c.req.valid('json')))
      }
    )
    app.put(
      '/' + subject + 's/:id/configuration',
      sValidator('json', SaveResourceConfigSchema),
      async (c) => {
        const result = await catalog.save(subject, c.req.param('id')!, c.req.valid('json'))
        host.coordinator.events.emit({ type: 'config' })
        return c.json(result)
      }
    )
  }
  app.put('/resources/:id/enabled', sValidator('json', ToggleSchema), async (c) => {
    const input = c.req.valid('json')
    const view = await catalog.read()
    if (view.revision !== input.revision) {
      throw new ControlError('资源目录已变化', 409)
    }
    const selected = view.resources.find((entry) => {
      return entry.id === c.req.param('id')
    })
    if (!selected || selected.base) {
      throw new ControlError('插件实例资源请使用提供者启停')
    }
    const resources = await host.resourceEditor.read()
    await host.resourceEditor.updateProvided(resources.revision, (records) => {
      records.find((entry) => {
        return entry.id === selected.id
      })!.enabled = input.enabled
      return records
    })
    host.coordinator.events.emit({ type: 'config' })
    return c.json(await catalog.read())
  })
  app.post('/operations/invoke', sValidator('json', InvokeResourceSchema), async (c) => {
    return c.json(await invokeResource(catalog, c.req.valid('json'), c.req.raw.signal))
  })
  app.get('/contexts', (c) => {
    const entries = host.coordinator.store
      .listRuns()
      .filter((run) => {
        return Boolean(run.context)
      })
      .slice(0, 50)
      .map((run) => {
        const context = run.context!
        return {
          runId: run.id,
          roomId: run.roomId,
          status: run.status,
          source: run.source,
          mode: run.mode,
          at: run.createdAt,
          policyRevision: context.authority.policyRevision,
          actors: context.authority.identities.map((identity) => {
            return { ...identity, roles: triggerRoles(context.effective.settings, identity) }
          }),
          capabilities: context.authority.capabilities,
          resourceId: context.resourceId
        }
      })
    return c.json({ entries })
  })
  return app
}
