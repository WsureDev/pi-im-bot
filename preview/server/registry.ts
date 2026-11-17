import { z } from 'zod'
import {
  fillConfigDefaults,
  validateConfig,
  validateConfigReadonly
} from '../../src/plugins/configuration/values'
import { publicConfig, applyConfigSecrets } from '../../src/plugins/configuration/secrets'
import type { SavePluginConfigSchema } from '../../src/plugins/configuration/contracts'
import { providerModules } from '../providers/catalog'
import {
  ResourceDescriptorSchema,
  ResourceConfigurationSchema,
  RegistryViewSchema
} from '../contracts/resources'
import type { DemoState } from './state'
import { requireRevision } from './state'
import { DemoError } from './errors'
import {
  configurationSecretValues,
  type ReadConfigSecretsSchema
} from '../../src/plugins/configuration/secret-editor'

export function provider(id: string) {
  const module = providerModules.find((item) => {
    return item.declaration.id === id
  })
  if (!module) {
    throw new DemoError('Provider 未安装', 404)
  }
  return module
}
export function providerActive(state: DemoState, providerId: string) {
  const owner = provider(providerId).declaration.pluginId
  return Boolean(
    state.plugins.find((plugin) => {
      return plugin.id === owner
    })?.active
  )
}
export function requireResource(state: DemoState, id: string) {
  const resource = state.resources.find((item) => {
    return item.id === id
  })
  if (!resource) {
    throw new DemoError('资源不存在', 404)
  }
  return resource
}
export function resourceAvailable(state: DemoState, id: string) {
  const resource = state.resources.find((item) => {
    return item.id === id
  })
  return Boolean(
    resource && resource.enabled && resource.state === 'ready' && providerActive(state, resource.providerId)
  )
}

// The registry uses only the declaration and the versioned provider interface.
// These authored modules return local fixtures. Production uses isolated RPC.
export async function discover(state: DemoState, providerId: string) {
  const module = provider(providerId)
  const declaration = module.declaration
  if (!providerActive(state, providerId)) {
    throw new DemoError('请先注册此 Provider 插件', 409)
  }
  const instance = state.providers.find((item) => {
    return item.id === providerId
  })!
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new DemoError('Provider 发现超时'))
      }, declaration.discovery.timeoutMs)
    })
    const descriptors = z
      .array(ResourceDescriptorSchema)
      .max(declaration.discovery.maximumItems)
      .parse(
        await Promise.race([
          module.discover(Object.freeze(structuredClone(instance.configuration)), controller.signal),
          timeout
        ])
      )
    for (const descriptor of descriptors) {
      for (const id of descriptor.operationIds) {
        if (
          !declaration.operations.some((operation) => {
            return operation.id === id
          })
        ) {
          throw new DemoError('资源引用了未声明的操作')
        }
      }
    }
    const externalIds = new Set(
      descriptors.map((item) => {
        return item.externalId
      })
    )
    if (externalIds.size !== descriptors.length) {
      throw new DemoError('发现响应包含重复的外部 ID')
    }
    for (const resource of state.resources) {
      if (resource.providerId === providerId) {
        resource.state = 'stale'
      }
    }
    for (const descriptor of descriptors) {
      const id = declaration.id + '.' + descriptor.externalId
      const existing = state.resources.find((item) => {
        return item.id === id
      })
      if (existing) {
        Object.assign(existing, descriptor, { state: 'ready', discoveredAt: Date.now() })
      } else {
        state.resources.push({
          ...descriptor,
          id,
          providerId,
          ownerPluginId: declaration.pluginId,
          enabled: true,
          discoveredAt: Date.now(),
          state: 'ready',
          configuration: fillConfigDefaults(declaration.resourceSchema, {})
        })
      }
    }
    instance.lastDiscoveryAt = Date.now()
    instance.discoveryRevision += 1
  } finally {
    clearTimeout(timer)
  }
}

export function registryView(state: DemoState) {
  return RegistryViewSchema.parse({
    revision: state.revision,
    providers: providerModules.map(({ declaration }) => {
      const instance = state.providers.find((item) => {
        return item.id === declaration.id
      })!
      return {
        ...declaration,
        active: providerActive(state, declaration.id),
        resources: state.resources.filter((resource) => {
          return resource.providerId === declaration.id && resource.state === 'ready'
        }).length,
        discoveryRevision: instance.discoveryRevision,
        lastDiscoveryAt: instance.lastDiscoveryAt
      }
    }),
    resources: state.resources.map(({ configuration, ...resource }) => {
      const declaration = provider(resource.providerId).declaration
      return {
        ...resource,
        available: resourceAvailable(state, resource.id),
        providerTitle: declaration.title,
        operations: declaration.operations.filter((operation) => {
          return resource.operationIds.includes(operation.id)
        })
      }
    })
  })
}

function configurationSubject(state: DemoState, kind: 'provider' | 'resource', id: string) {
  if (kind === 'provider') {
    const module = provider(id)
    const item = state.providers.find((item) => {
      return item.id === id
    })!
    return {
      item,
      definition: module.declaration.configurationSchema,
      declaration: module.declaration,
      title: module.declaration.title
    }
  }
  const item = requireResource(state, id)
  const declaration = provider(item.providerId).declaration
  return { item, definition: declaration.resourceSchema, declaration, title: item.name }
}
export function configurationView(state: DemoState, kind: 'provider' | 'resource', id: string) {
  const { item, definition, declaration, title } = configurationSubject(state, kind, id)
  return ResourceConfigurationSchema.parse({
    subject: kind,
    subjectId: id,
    title,
    ownerPluginId: declaration.pluginId,
    revision: String(state.revision),
    release: declaration.version,
    target: { level: 'instance' },
    targets: [],
    definition,
    ...publicConfig(definition, item.configuration),
    inherited: {},
    issues: [],
    bindings: [],
    choices: { select_mcp: [], select_provider: [], select_model_group: [], select_persona: [] }
  })
}
export function configurationSecrets(
  state: DemoState,
  kind: 'provider' | 'resource',
  id: string,
  input: z.infer<typeof ReadConfigSecretsSchema>
) {
  const { item, definition, declaration } = configurationSubject(state, kind, id)
  requireRevision(String(state.revision), input.revision)
  requireRevision(declaration.version, input.release)
  if (input.target.level !== 'instance') {
    throw new DemoError('资源配置只支持实例范围')
  }
  return configurationSecretValues(definition, item.configuration)
}
export function saveConfiguration(
  state: DemoState,
  kind: 'provider' | 'resource',
  id: string,
  input: z.infer<typeof SavePluginConfigSchema>
) {
  requireRevision(String(state.revision), input.revision)
  const { item, definition, declaration } = configurationSubject(state, kind, id)
  requireRevision(declaration.version, input.release)
  if (input.target.level !== 'instance' || input.services || input.connectors || input.dependencies) {
    throw new DemoError('资源配置只接受当前实例的声明字段')
  }
  const next = fillConfigDefaults(
    definition,
    applyConfigSecrets(definition, input.values, item.configuration, input.secrets)
  )
  validateConfig(definition, next)
  validateConfigReadonly(definition, item.configuration, next)
  item.configuration = next
}
