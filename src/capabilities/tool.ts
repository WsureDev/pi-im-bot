import type { AgentTool, AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core'

/** A framework-owned tool executor without access to CLI sessions or host extensions. */
export type BotTool = Omit<AgentTool<object, unknown>, 'execute' | 'replay'> & {
  replay?: 'safe' | 'unsafe'
  exposure?: 'direct' | 'deferred'
  namespace?: { name: string; description?: string }
  promptSnippet?: string
  promptGuidelines?: string[]
  execute(
    callId: string,
    args: unknown,
    signal: AbortSignal | undefined,
    update: AgentToolUpdateCallback<unknown> | undefined
  ): Promise<AgentToolResult<unknown>>
}
