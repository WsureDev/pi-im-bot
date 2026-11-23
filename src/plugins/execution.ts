import type { PluginInvocation } from './invocation'
import type { PluginRegistry } from './registry'
import type { OrderedHook } from './hooks/order'
import type { PluginAction, PluginOperationOutcome } from './rpc/protocol'

/** Capabilities offered to Agent tools and prompt hooks, without worker administration. */
export interface PluginExecution {
  available(): boolean
  execute(
    invocation: PluginInvocation,
    capability: string,
    input: unknown,
    callId: string,
    signal: AbortSignal,
    phase?: PluginAction['phase']
  ): Promise<PluginOperationOutcome>
  hook(
    invocation: PluginInvocation,
    registry: PluginRegistry,
    handler: OrderedHook,
    input: unknown,
    callId: string,
    signal: AbortSignal
  ): Promise<unknown>
}
