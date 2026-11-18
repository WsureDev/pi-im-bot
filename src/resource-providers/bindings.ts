import type { PluginPackage } from '../plugins/config'
import type { ResourceDefinitions } from './registry'
import { resolveResource } from './registry'

export function compatibleResource(
  bundle: PluginPackage,
  alias: string,
  config: ResourceDefinitions,
  id: string
) {
  const dependency = bundle.manifest.resources.find((item) => {
    return item.alias === alias
  })
  if (!dependency) {
    return false
  }
  try {
    for (const method of dependency.methods) {
      resolveResource(config, id, dependency.protocol, method)
    }
    return true
  } catch {
    return false
  }
}
