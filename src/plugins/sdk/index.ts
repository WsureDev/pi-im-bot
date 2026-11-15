export {
  WorkflowSchema as ComfyWorkflowResourceSchema,
  GraphSchema as ComfyGraphSchema,
  resourceRisks,
  type Workflow as ComfyWorkflowResource
} from '../../services/comfy/resources'
export { ComfyInputSchema, ComfyItemSchema } from '../../services/comfy/protocol'
import type { PluginInvocationView, PluginOperationOutcome, PluginResult } from '../rpc/protocol'
export { gsvi, readMedia } from './services'
export { gsviCatalogue, gsviCataloguePage, gsviCatalogueMatch } from './services'
export { pythonCasefold, pythonCompare, pythonDecimal, pythonStrip } from '../../services/gsvi/unicode'
export { GsviInputSchema, GsviResultSchema } from '../../services/gsvi/schema'
export { MediaChunkSchema } from '../media-rpc'
export { RuntimeStatusSchema, type RuntimeStatus } from '../../runtime/status/schema'

export interface PluginContext {
  dataDir: string
  invocation: Readonly<PluginInvocationView>
  signal: AbortSignal
  host(method: string, params?: Record<string, unknown>): Promise<unknown>
}
export interface PluginImplementation {
  operations?: Record<
    string,
    (
      input: unknown,
      context: PluginContext
    ) => PluginResult | PluginOperationOutcome | Promise<PluginResult | PluginOperationOutcome>
  >
  hooks?: Record<string, (input: unknown, context: PluginContext) => unknown | Promise<unknown>>
  parsers?: Record<string, (input: { text: string }, context: PluginContext) => object | Promise<object>>
}

export function definePlugin(plugin: PluginImplementation) {
  return plugin
}
export function textResult(text: string, artifactIds: string[] = [], suppressText = false): PluginResult {
  if (suppressText) {
    return { text, artifactIds, suppressText: true }
  }
  return { text, artifactIds }
}
export function artifactResult(artifactIds: string[]): PluginResult {
  return textResult('', artifactIds, true)
}
export function pendingResult(handle: unknown, pollAfterMs = 1000) {
  return { status: 'pending' as const, handle, pollAfterMs }
}
export async function sendMessages(
  context: PluginContext,
  messages: Array<{ text: string; artifactIds?: string[] }>
) {
  context.signal.throwIfAborted()
  return context.host('delivery.send', { messages })
}
export function replaceText(context: PluginContext, text: string) {
  return {
    baseRevision: context.invocation.inputRevision,
    patch: [{ op: 'set', path: '/text', value: text }]
  }
}
