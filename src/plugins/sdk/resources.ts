import type { PluginContext } from './index'
import { ResourceOutputSchema } from '../../resource-providers/protocol'
import type { ConfigValues } from '../configuration/schema'

export function resource(context: PluginContext, alias: string) {
  return {
    async call(method: string, parameters: ConfigValues = {}, options: { publishFiles?: boolean } = {}) {
      context.signal.throwIfAborted()
      return ResourceOutputSchema.parse(
        await context.host('resource:' + alias, {
          method,
          parameters,
          publishFiles: options.publishFiles ?? false
        })
      )
    }
  }
}
