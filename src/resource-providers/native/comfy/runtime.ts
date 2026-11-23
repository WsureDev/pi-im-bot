import { ComfyBroker, type ComfyOwner } from '../../../services/comfy/broker'
import type { ResourceNativeContext } from '../contracts'
import type { ResourceInstance } from '../../protocol'
import type { AgentRuntime } from '../../../agent/runtime'

const brokers = new WeakMap<AgentRuntime, ComfyBroker>()
export function comfyResourceRuntime(context: ResourceNativeContext) {
  if (!context.durable) {
    throw new Error('Comfy 资源需要受管持久运行时')
  }
  let broker = brokers.get(context.durable.runtime)
  if (!broker) {
    broker = new ComfyBroker(context.durable.runtime, context.durable.jobs)
    brokers.set(context.durable.runtime, broker)
  }
  return broker
}
export function comfyResourceOwner(
  instance: ResourceInstance,
  context: ResourceNativeContext,
  ticket?: string
): ComfyOwner {
  if (context.owner.job && context.owner.jobRevision) {
    return {
      instance: 'resource:' + instance.id,
      room: context.owner.scope,
      job: context.owner.job,
      revision: context.owner.jobRevision
    }
  }
  return {
    instance: 'resource:' + instance.id,
    room: context.owner.scope,
    job: 'resource:' + (ticket ?? context.requestId),
    revision: 1,
    managedJob: false
  }
}
