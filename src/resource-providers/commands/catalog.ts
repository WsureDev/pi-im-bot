import type { ResourcesConfig } from '../../resources/schema'
import type { ResourceLibrary } from '../../resources/library'
import { resolveResource } from '../registry'
import type { ResourceCommand } from './schema'
import { commandParameters } from './parameters'

const reserved = new Set(['help', 'status', 'new', 'stop', 'skills', 'skill', 'jobs', 'job'])
export function validateResourceCommands(config: ResourcesConfig, library: ResourceLibrary) {
  const names = new Set(reserved)
  for (const instance of config.plugins) {
    for (const command of library.pluginPackage(instance.id)?.manifest.commands ?? []) {
      for (const name of command.names) {
        names.add(name.toLowerCase())
      }
    }
  }
  const ids = new Set<string>()
  for (const command of config.resourceCommands) {
    if (names.has(command.name.toLowerCase()) || ids.has(command.id)) {
      throw new Error('指令名称与 Core、插件或其他映射冲突')
    }
    names.add(command.name.toLowerCase())
    ids.add(command.id)
    commandParameters({ ...command, arguments: 'text', textType: 'string' }, '')
    if (!command.enabled) {
      continue
    }
    if (command.target.kind === 'resource') {
      resolveResource(config, command.target.resourceId, command.target.protocol, command.target.method)
    } else {
      const target = command.target
      if (
        !library.manifest(target.serverId)?.tools.some((tool) => {
          return tool.name === target.tool
        })
      ) {
        throw new Error('MCP 工具尚未登记，请先刷新 MCP 目录')
      }
    }
  }
}
export function findResourceCommand(
  config: ResourcesConfig,
  text: string
): { command: ResourceCommand; text: string } | undefined {
  const matched = /^\/([^\s]+)(?:\s+([\s\S]*))?$/u.exec(text.trim())
  if (!matched) {
    return undefined
  }
  const command = config.resourceCommands.find((item) => {
    return item.enabled && item.name.toLowerCase() === matched[1].toLowerCase()
  })
  if (command) {
    return { command, text: matched[2] ?? '' }
  }
  return undefined
}
