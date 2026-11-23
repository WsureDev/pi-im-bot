import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Message } from '@earendil-works/pi-ai'
import type { ChatMessage } from '../domain/message'
import type { projectHistory } from '../messages/projection'
import type { JobToolServices } from '../jobs/tools'
import type { MediaToolServices } from '../media/tool'
import type { PluginExecution } from '../plugins/execution'
import type { ScheduleToolServices } from './schedule-tools'

export interface HostToolServices {
  configuredDelivery?(pluginId: string, target: string, text: string, key: string): Promise<void>
  identity?(): Promise<string | undefined>
  mediaSources?: Set<string>
  plugins?: PluginExecution
  recall?(messageId: string, delayMs: number): Promise<{ taskId: number }>
  history(limit: number): ReturnType<typeof projectHistory>
  send(
    text: string,
    callId?: string,
    artifactIds?: string[],
    beforePart?: () => void,
    lifetime?: { signal: AbortSignal; deadlineAt?: number }
  ): Promise<ChatMessage>
  present?(
    text: string,
    callId: string,
    artifactIds: string[]
  ): Promise<{
    delivered: boolean
    messageId?: string
    jobId?: string
    admissionUnknown?: boolean
    outboundId?: string
  }>
  assertActive?(): void
  authorize(capability: string, surface?: 'tool'): void
  schedules?: ScheduleToolServices
  jobs?: JobToolServices
  media?: MediaToolServices
  projectModelHistory?<T extends AgentMessage>(messages: readonly T[]): Promise<T[]>
  projectContext?(messages: readonly Message[]): Promise<Message[]>
}
