import { z } from 'zod'
import type { PluginInstance, PluginPackage } from '../plugins/config'
import type { ResourcesConfig } from '../resources/schema'
import { ConfigValuesSchema, type ConfigDefinition, type ConfigValues } from '../plugins/configuration/schema'
import { fillConfigDefaults, validateConfig } from '../plugins/configuration/values'
import { resourceDefinitions } from './registry'
import { validateResourceConnection } from './native/registry'

function parts(path: string) {
  const keys = path.split('.')
  if (
    keys.some((key) => {
      return !key || ['__proto__', 'prototype', 'constructor'].includes(key)
    })
  ) {
    throw new Error('配置投影路径无效')
  }
  return keys
}
export function readConfigPath(value: ConfigValues, path: string): unknown {
  let current: unknown = value
  for (const key of parts(path)) {
    const parsed = ConfigValuesSchema.safeParse(current)
    if (!parsed.success || !Object.hasOwn(parsed.data, key)) {
      return undefined
    }
    current = parsed.data[key]
  }
  return current
}
export function writeConfigPath(value: ConfigValues, path: string, input: unknown) {
  const keys = parts(path)
  let current = value
  for (const key of keys.slice(0, -1)) {
    const child = ConfigValuesSchema.parse(current[key] ?? {})
    current[key] = child
    current = child
  }
  current[keys[keys.length - 1]] = z.json().parse(input)
}
function removeConfigPath(value: ConfigValues, path: string) {
  const keys = parts(path)
  let current = value
  for (const key of keys.slice(0, -1)) {
    const child = ConfigValuesSchema.safeParse(current[key])
    if (!child.success) {
      return
    }
    current[key] = child.data
    current = child.data
  }
  delete current[keys[keys.length - 1]]
}
export function resourceWorkerValues(bundle: PluginPackage, values: ConfigValues) {
  const result = structuredClone(values)
  for (const dependency of bundle.manifest.resources) {
    for (const field of Object.keys(dependency.configurationProjection?.fields ?? {})) {
      removeConfigPath(result, field)
    }
  }
  return result
}
export function resourceWorkerDefinition(bundle: PluginPackage, original = bundle.configuration) {
  if (!original) {
    return undefined
  }
  const definition = structuredClone(original)
  for (const dependency of bundle.manifest.resources) {
    for (const path of Object.keys(dependency.configurationProjection?.fields ?? {})) {
      const keys = parts(path)
      let fields: ConfigDefinition | undefined = definition
      for (const key of keys.slice(0, -1)) {
        fields = fields?.[key]?.items
      }
      if (fields) {
        delete fields[keys[keys.length - 1]]
      }
    }
  }
  return definition
}
export function projectedResourceValues(
  config: ResourcesConfig,
  instance: PluginInstance,
  bundle: PluginPackage
) {
  const result = fillConfigDefaults(bundle.configuration ?? {}, instance.settings)
  for (const dependency of bundle.manifest.resources) {
    const projection = dependency.configurationProjection
    if (!projection) {
      continue
    }
    const resource = config.providers.find((entry) => {
      return entry.id === instance.resources[dependency.alias]
    })
    if (!resource || resource.provider !== projection.provider) {
      continue
    }
    for (const [field, from] of Object.entries(projection.fields)) {
      const value = readConfigPath(resource.configuration, from)
      if (value !== undefined) {
        writeConfigPath(result, field, value)
      }
    }
  }
  return result
}
export function saveProjectedResources(
  config: ResourcesConfig,
  instance: PluginInstance,
  bundle: PluginPackage,
  values: ConfigValues,
  previous?: { bindings: Record<string, string>; values: ConfigValues }
) {
  const definitions = resourceDefinitions(config)
  for (const dependency of bundle.manifest.resources) {
    const projection = dependency.configurationProjection
    if (!projection) {
      continue
    }
    const provider = definitions.providers.find((entry) => {
      return entry.id === projection.provider
    })
    if (!provider) {
      throw new Error('插件配置所需的 Provider 未登记')
    }
    let resource = config.providers.find((entry) => {
      return entry.id === instance.resources[dependency.alias]
    })
    if (!resource) {
      const id = ('connection-' + crypto.randomUUID()).slice(0, 47)
      resource = {
        id,
        name: instance.name + ' / ' + dependency.alias,
        provider: provider.id,
        enabled: true,
        configuration: fillConfigDefaults(provider.configuration, {})
      }
      config.providers.push(resource)
      instance.resources[dependency.alias] = id
    }
    if (resource.provider !== projection.provider) {
      throw new Error('当前资源实现不支持此插件的原生配置投影')
    }
    for (const [field, to] of Object.entries(projection.fields)) {
      const value = readConfigPath(values, field)
      if (
        previous &&
        previous.bindings[dependency.alias] &&
        previous.bindings[dependency.alias] !== resource.id &&
        JSON.stringify(value) === JSON.stringify(readConfigPath(previous.values, field))
      ) {
        continue
      }
      if (value !== undefined) {
        writeConfigPath(resource.configuration, to, value)
      }
    }
    for (const option of dependency.options) {
      if (option.refreshField) {
        const target = projection.fields[option.refreshField]
        if (target) {
          writeConfigPath(resource.configuration, target, false)
        } else {
          writeConfigPath(values, option.refreshField, false)
        }
      }
    }
    validateConfig(provider.configuration, resource.configuration)
    validateResourceConnection(provider, resource)
  }
  instance.settings = resourceWorkerValues(bundle, values)
}
