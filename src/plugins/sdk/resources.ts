import type { PluginContext } from './index'
import { ResourceOutputSchema } from '../../resource-providers/protocol'
import type { ConfigValues } from '../configuration/schema'
import { resourceCapability } from '../../resource-providers/protocol'

export function resource(context: PluginContext, alias: string) {
  return {
    capability(method: string) {
      const binding = context.invocation.resources[alias]
      if (!binding || !binding.methods.includes(method)) {
        return undefined
      }
      return resourceCapability(binding.id, binding.protocol, method)
    },
    async call(
      method: string,
      parameters: ConfigValues = {},
      options: { publishFiles?: boolean; key?: string; timeoutMs?: number } = {}
    ) {
      context.signal.throwIfAborted()
      const input: {
        method: string
        parameters: ConfigValues
        publishFiles: boolean
        key?: string
        timeoutMs?: number
      } = { method, parameters, publishFiles: options.publishFiles ?? false }
      if (options.key !== undefined) {
        input.key = options.key
      }
      if (options.timeoutMs !== undefined) {
        input.timeoutMs = options.timeoutMs
      }
      return ResourceOutputSchema.parse(await context.host('resource:' + alias, input))
    }
  }
}
