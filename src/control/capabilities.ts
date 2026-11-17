import type { Configuration } from '../config/load'
import { builtinCapabilities } from '../permissions/catalog'
import { pluginOperationId, pluginCommandId, pluginToolName } from '../plugins/identity'
import { mcpCapabilityId, mcpToolName } from '../resources/mcp/identity'
import { CapabilityAccessSchema } from '../permissions/capability-policy'
import type { CapabilityRow } from './contracts'

export function capabilityRows(config: Configuration): CapabilityRow[] {
  const rows: CapabilityRow[] = builtinCapabilities.map((capability) => {
    let commands: string[] = []
    let commandIds: string[] = []
    let tool: string | undefined
    if (capability.kind === 'command') {
      commands = ['/' + capability.id.slice(8)]
      commandIds = [capability.id]
    }
    if (capability.kind === 'tool') {
      tool = capability.id
    }
    return {
      ...capability,
      title: capability.name,
      pluginId: 'core',
      description: '',
      commands,
      commandIds,
      tool
    }
  })
  for (const instance of config.resources.config.plugins) {
    const bundle = config.resources.pluginPackage(instance.id)
    if (!bundle) {
      continue
    }
    for (const operation of bundle.manifest.operations) {
      const commands = bundle.manifest.commands.filter((command) => {
        return command.operation === operation.id
      })
      let tool: string | undefined
      if (
        operation.tool &&
        (!bundle.manifest.resourceProvider || bundle.manifest.resourceProvider.tools.includes(operation.id))
      ) {
        tool = pluginToolName(instance.id, operation.id)
      }
      rows.push({
        id: pluginOperationId(instance.id, operation.id),
        pluginId: instance.id,
        title: operation.title,
        description: operation.description,
        tool,
        kind: 'tool',
        commands: commands.flatMap((command) => {
          return command.names.map((name) => {
            return '/' + name
          })
        }),
        commandIds: commands.map((command) => {
          return pluginCommandId(instance.id, command.id)
        })
      })
    }
  }
  for (const server of config.resources.config.mcp) {
    for (const tool of config.resources.manifest(server.id)?.tools ?? []) {
      rows.push({
        id: mcpCapabilityId(server.id, tool.name),
        pluginId: 'mcp:' + server.id,
        title: tool.name,
        description: tool.description ?? '',
        tool: mcpToolName(server.id, tool.name),
        kind: 'tool',
        commands: [],
        commandIds: []
      })
    }
  }
  return rows
}
export function defaultAccess() {
  return CapabilityAccessSchema.parse({
    enabled: true,
    toolEnabled: true,
    commandEnabled: true,
    group: { enabled: true, roles: ['everyone'] },
    direct: { enabled: true, roles: ['everyone'] }
  })
}
