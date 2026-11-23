import type { Harness, ConversationId, createRegistry } from '@earendil-works/pi-durable'
import type { Configuration } from '../config/load'
import type { Room } from '../domain/message'
import type { PreparedRunInput } from '../domain/run'
import type { AgentCallbacks } from './events'
import type { HostToolServices } from './services'

/** Execution and task capabilities consumed by the host, independent of its adapter class. */
export interface AgentRuntime {
  readonly native: Harness
  readonly registry: ReturnType<typeof createRegistry>
  prepare(
    id: string,
    config: Configuration,
    room: Room,
    input: PreparedRunInput,
    signal: AbortSignal,
    services: HostToolServices,
    callbacks: AgentCallbacks,
    spent?: number
  ): void
  run(
    id: string,
    config: Configuration,
    room: Room,
    input: PreparedRunInput,
    signal: AbortSignal,
    services: HostToolServices,
    callbacks: AgentCallbacks
  ): Promise<string>
  ensureConversation(config: Configuration, room: Room, input: PreparedRunInput): Promise<ConversationId>
  abandon(id: string): Promise<void>
  close(): Promise<void>
}
