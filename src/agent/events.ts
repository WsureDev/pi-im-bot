import type { Trace } from '../domain/run'
import type { ProviderAttempt } from '../providers/responses'

export interface AgentCallbacks {
  trace(trace: Omit<Trace, 'id' | 'at' | 'runId' | 'roomId'>): void
  preview(text: string): void
  provider(event: ProviderAttempt): void
  tool(): void
}
