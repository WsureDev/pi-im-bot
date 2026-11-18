import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import type { HttpServices } from '../http/app'
import { SettingsEditError } from '../settings/editor'
import { PluginConfigValidationError } from '../plugins/configuration/values'
import { ControlScopes } from './scopes'
import { capabilityRows, defaultAccess } from './capabilities'
import { ControlSnapshotSchema, SaveAccessSchema, SaveLiveFlowSchema } from './contracts'
import { liveFlow, saveLiveFlow } from './flow'
import { ControlError } from './error'
import { triggerRoles } from '../permissions/capability-policy'
import { PluginInvocationError } from '../plugins/rpc/peer'

const ScopeQuerySchema = z.object({ scope: z.string().default('global') })

export function controlApp(host: HttpServices) {
  const app = new Hono()
  const scopes = new ControlScopes(host)
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
