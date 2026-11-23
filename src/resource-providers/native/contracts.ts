import type { ArtifactStore } from '../../artifacts/store'
import type { AgentRuntime } from '../../agent/runtime'
import type { JobRepository } from '../../jobs/repository'
import type { ConfigValues } from '../../plugins/configuration/schema'
import type { ResourceInstance } from '../protocol'
import type { Tx } from '@earendil-works/pi-durable'
import type { ResourceModels } from './model'

export interface ResourceOwner {
  scope: string
  caller: string
  job?: string
  jobRevision?: number
  phase: 'execute' | 'poll' | 'cancel' | 'recover' | 'reconcile'
}
export interface ResourceNativeContext {
  dataDir: string
  artifacts: ArtifactStore
  owner: ResourceOwner
  durable?: { runtime: AgentRuntime; jobs: JobRepository; optionsChanged?(resourceId: string): void }
  optionsChanged?(resourceId: string): void
  models?: ResourceModels
  signal: AbortSignal
  requestId: string
  readOnly?: boolean
  authorize(): void
}
export interface NativeResourceAdapter {
  id: string
  validate(instance: ResourceInstance): void
  invoke(
    instance: ResourceInstance,
    method: string,
    parameters: ConfigValues,
    context: ResourceNativeContext
  ): Promise<{ value: unknown; artifactIds: string[] }>
  record?(instance: ResourceInstance, item: number, context: ResourceNativeContext, tx: Tx): Promise<boolean>
}
