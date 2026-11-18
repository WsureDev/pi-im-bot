import type { ResourcesConfig } from '../resources/schema'
import { resourceDefinitions } from './registry'
import { resourceCapability } from './protocol'
import { resourceCommandCapability } from './commands/schema'

export function independentCapabilities(config: ResourcesConfig, enabledOnly = false) {
  const definitions = resourceDefinitions(config)
  return [
    ...config.providers.flatMap((instance) => {
      if (enabledOnly && !instance.enabled) {
        return []
      }
      const provider = definitions.providers.find((item) => {
        return item.id === instance.provider
      })
      return (provider?.mappings ?? []).map((mapping) => {
        return {
          id: resourceCapability(instance.id, mapping.protocol, mapping.method),
          name: instance.name + ' / ' + mapping.method,
          kind: 'action' as const
        }
      })
    }),
    ...config.resourceCommands
      .filter((command) => {
        return !enabledOnly || command.enabled
      })
      .map((command) => {
        return {
          id: resourceCommandCapability(command.id),
          name: '/' + command.name + '：' + command.description,
          kind: 'command' as const
        }
      })
  ]
}
