import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import type { HttpServices } from '../http/app'
import { revision } from '../settings/resolve'
import { resourceDefinitions } from './registry'
import { ProviderDefinitionSchema, ResourceInstanceSchema, ResourceProtocolSchema } from './protocol'
import {
  IndependentRegistrySchema,
  IndependentConfigSchema,
  CreateResourceSchema,
  SaveIndependentConfigSchema,
  InvokeIndependentSchema
} from './api-schema'
import { publicConfig, applyConfigSecrets } from '../plugins/configuration/secrets'
import { fillConfigDefaults, validateConfig, validateConfigReadonly } from '../plugins/configuration/values'
import { ReadConfigSecretsSchema, configurationSecretValues } from '../plugins/configuration/secret-editor'
import { ResourceCommandSchema } from './commands/schema'
import { validateResourceCommands } from './commands/catalog'
import { callResource } from './service'
import { resourceConnection } from './adapters/connection'
import { SettingsEditError } from '../settings/editor'

const RevisionSchema = z.object({ revision: z.string() }).strict()
const ToggleSchema = RevisionSchema.extend({ enabled: z.boolean() })
const CommandsSchema = RevisionSchema.extend({ commands: z.array(ResourceCommandSchema).max(200) })
const DefinitionsSchema = RevisionSchema.extend({
  protocols: z.array(ResourceProtocolSchema).max(100),
  providers: z.array(ProviderDefinitionSchema).max(100)
})

export function independentResourcesApp(host: HttpServices) {
  const app = new Hono()
  async function snapshot() {
    const state = await host.resourceEditor.readResourceProviders()
    const config = host.configuration().resources
    const definitions = resourceDefinitions(state.config)
    return IndependentRegistrySchema.parse({
      revision: state.revision,
      protocols: definitions.protocols,
      definitions: definitions.providers,
      instances: state.config.providers.map((instance) => {
        return {
          id: instance.id,
          name: instance.name,
          provider: instance.provider,
          enabled: instance.enabled,
          consumers: state.config.plugins
            .filter((plugin) => {
              return Object.values(plugin.resources).includes(instance.id)
            })
            .map((plugin) => {
              return plugin.name
            })
        }
      }),
      commands: state.config.resourceCommands,
      mcp: config.config.mcp.flatMap((server) => {
        return (config.manifest(server.id)?.tools ?? []).map((tool) => {
          return {
            serverId: server.id,
            name: server.name,
            tool: tool.name,
            description: tool.description ?? ''
          }
        })
      })
    })
  }
  async function configView(id: string) {
    const state = await host.resourceEditor.readResourceProviders()
    const definitions = resourceDefinitions(state.config)
    const instance = state.config.providers.find((entry) => {
      return entry.id === id
    })
    const provider = definitions.providers.find((entry) => {
      return entry.id === instance?.provider
    })
    if (!instance || !provider) {
      throw new Error('资源实例或 Provider 定义不存在')
    }
    return {
      instance,
      provider,
      view: IndependentConfigSchema.parse({
        id,
        title: instance.name,
        provider: provider.id,
        revision: state.revision,
        release: revision(provider),
        target: { level: 'instance' },
        targets: [],
        definition: provider.configuration,
        inherited: {},
        issues: [],
        bindings: [],
        ...publicConfig(provider.configuration, instance.configuration),
        choices: { select_mcp: [], select_provider: [], select_model_group: [], select_persona: [] }
      })
    }
  }
  async function assertRevision(expected: string) {
    if ((await host.resourceEditor.read()).revision !== expected) {
      throw new SettingsEditError('资源配置已变化，请刷新后重试', 409)
    }
  }
  function changed() {
    host.coordinator.events.emit({ type: 'config' })
  }
  app.get('/', async (c) => {
    return c.json(await snapshot())
  })
  app.post('/instances', sValidator('json', CreateResourceSchema), async (c) => {
    const input = c.req.valid('json')
    await host.resourceEditor.updateResourceProviders(input.revision, (config) => {
      const provider = resourceDefinitions(config).providers.find((entry) => {
        return entry.id === input.provider
      })
      if (
        !provider ||
        config.providers.some((entry) => {
          return entry.id === input.id
        })
      ) {
        throw new Error('Provider 不存在或资源 ID 重复')
      }
      config.providers.push(
        ResourceInstanceSchema.parse({
          id: input.id,
          name: input.name,
          provider: input.provider,
          configuration: fillConfigDefaults(provider.configuration, {})
        })
      )
    })
    changed()
    return c.json(await snapshot())
  })
  app.put('/instances/:id/enabled', sValidator('json', ToggleSchema), async (c) => {
    const input = c.req.valid('json')
    await host.resourceEditor.updateResourceProviders(input.revision, (config) => {
      const instance = config.providers.find((entry) => {
        return entry.id === c.req.param('id')
      })
      if (!instance) {
        throw new Error('资源不存在')
      }
      if (input.enabled) {
        resourceConnection(instance)
      }
      instance.enabled = input.enabled
    })
    changed()
    return c.json(await snapshot())
  })
  app.delete('/instances/:id', sValidator('json', RevisionSchema), async (c) => {
    const id = c.req.param('id')
    await host.resourceEditor.updateResourceProviders(c.req.valid('json').revision, (config) => {
      if (
        config.plugins.some((entry) => {
          return Object.values(entry.resources).includes(id)
        }) ||
        config.resourceCommands.some((entry) => {
          return entry.target.kind === 'resource' && entry.target.resourceId === id
        })
      ) {
        throw new Error('资源仍被插件或指令引用，请先解除绑定')
      }
      config.providers = config.providers.filter((entry) => {
        return entry.id !== id
      })
    })
    changed()
    return c.json(await snapshot())
  })
  app.get('/instances/:id/configuration', async (c) => {
    return c.json((await configView(c.req.param('id'))).view)
  })
  app.post('/instances/:id/configuration/secrets', sValidator('json', ReadConfigSecretsSchema), async (c) => {
    const input = c.req.valid('json')
    const state = await configView(c.req.param('id'))
    await assertRevision(input.revision)
    if (input.release !== state.view.release || input.target.level !== 'instance') {
      throw new Error('配置对象或版本不匹配')
    }
    return c.json(configurationSecretValues(state.provider.configuration, state.instance.configuration))
  })
  app.put('/instances/:id/configuration', sValidator('json', SaveIndependentConfigSchema), async (c) => {
    const input = c.req.valid('json')
    const state = await configView(c.req.param('id'))
    if (input.release !== state.view.release || input.target.level !== 'instance') {
      throw new Error('配置对象或版本不匹配')
    }
    await host.resourceEditor.updateResourceProviders(input.revision, (config) => {
      const instance = config.providers.find((entry) => {
        return entry.id === state.instance.id
      })!
      const definition = state.provider.configuration
      const values = fillConfigDefaults(
        definition,
        applyConfigSecrets(definition, input.values, instance.configuration, input.secrets)
      )
      validateConfig(definition, values)
      validateConfigReadonly(definition, instance.configuration, values)
      resourceConnection({ ...instance, configuration: values })
      instance.configuration = values
    })
    changed()
    return c.json((await configView(c.req.param('id'))).view)
  })
  app.post('/invoke', sValidator('json', InvokeIndependentSchema), async (c) => {
    const { revision: expected, ...call } = c.req.valid('json')
    await assertRevision(expected)
    return c.json(
      await callResource(
        () => {
          return host.configuration().resources.config
        },
        call,
        { requestId: crypto.randomUUID(), signal: c.req.raw.signal, authorize() {} }
      )
    )
  })
  app.put('/commands', sValidator('json', CommandsSchema), async (c) => {
    const input = c.req.valid('json')
    await host.resourceEditor.updateResourceProviders(input.revision, (config) => {
      config.resourceCommands = input.commands
      validateResourceCommands(config, host.configuration().resources)
    })
    changed()
    return c.json(await snapshot())
  })
  app.put('/definitions', sValidator('json', DefinitionsSchema), async (c) => {
    const input = c.req.valid('json')
    await host.resourceEditor.updateResourceProviders(input.revision, (config) => {
      config.resourceProtocols = input.protocols
      config.providerDefinitions = input.providers
      const definitions = resourceDefinitions(config)
      for (const instance of config.providers) {
        const provider = definitions.providers.find((entry) => {
          return entry.id === instance.provider
        })
        if (!provider) {
          throw new Error('仍有实例引用被移除的 Provider')
        }
        validateConfig(provider.configuration, instance.configuration)
      }
      validateResourceCommands(config, host.configuration().resources)
    })
    changed()
    return c.json(await snapshot())
  })
  return app
}
