import type { PluginContext } from './index'
import { ResourceHttpResponseSchema, type ResourceHttpRequest } from '../../resource-providers/http'
export async function resourceHttp(context: PluginContext, input: ResourceHttpRequest) {
  context.signal.throwIfAborted()
  return ResourceHttpResponseSchema.parse(await context.host('resource.http', input))
}
