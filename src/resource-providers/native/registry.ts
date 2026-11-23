import type { ProviderDefinition, ResourceInstance } from '../protocol'
import { resourceConnection } from '../adapters/connection'
import { gsviNativeAdapter } from './gsvi'
import { comfyNativeAdapter } from './comfy'
import { frameworkModelAdapter } from './model'

const adapters = [gsviNativeAdapter, comfyNativeAdapter, frameworkModelAdapter]
export function nativeResourceAdapter(id: string) {
  const adapter = adapters.find((entry) => {
    return entry.id === id
  })
  if (!adapter) {
    throw new Error('未登记此资源适配器')
  }
  return adapter
}
export function validateResourceConnection(provider: ProviderDefinition, instance: ResourceInstance) {
  const ids = new Set<string>()
  for (const mapping of provider.mappings) {
    if (mapping.transport.kind === 'registered') {
      ids.add(mapping.transport.adapter)
    } else {
      resourceConnection(instance)
    }
  }
  for (const id of ids) {
    nativeResourceAdapter(id).validate(instance)
  }
}
