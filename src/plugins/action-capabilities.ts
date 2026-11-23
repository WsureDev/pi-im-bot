import type { PluginOperationEntry } from './registry'
import { resourceCapability } from '../resource-providers/protocol'

export function pluginActionCapabilities(entry: PluginOperationEntry) {
  return entry.operation.actions.map((action) => {
    if (action.startsWith('resource:')) {
      const parts = action.slice(9).split('/')
      if (parts.length === 2) {
        const dependency = entry.bundle.manifest.resources.find((item) => {
          return item.alias === parts[0] && item.methods.includes(parts[1])
        })
        const id = entry.instance.resources[parts[0]]
        if (!dependency || !id) {
          throw new Error('操作所需资源未绑定或方法未声明')
        }
        return resourceCapability(id, dependency.protocol, parts[1])
      }
    }
    return action
  })
}
