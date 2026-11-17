import type { ResourceProviderCatalog } from './catalog'
import type { z } from 'zod'
import type { InvokeResourceSchema } from './contracts'
import { ResourceResultSchema } from './contracts'
import { localIdentity } from '../permissions/identity'
import { providedResource, providedResourceRevision } from './context'
import { ControlError } from '../control/error'
import { completedPluginResult } from '../plugins/result'
import type { PluginInvocation } from '../plugins/invocation'
import { projectHistory } from '../messages/projection'

export async function invokeResource(
  catalog: ResourceProviderCatalog,
  input: z.infer<typeof InvokeResourceSchema>,
  signal: AbortSignal
) {
  const resolved = await catalog.resolve(input.resourceId, input.operationId)
  if (resolved.view.revision !== input.revision || resolved.operation.version !== input.operationVersion) {
    throw new ControlError('操作或资源版本已变化，请刷新后重试', 409)
  }
  const { host } = catalog
  const service = host.coordinator.plugins
  if (!service?.available()) {
    throw new ControlError('插件执行环境未启用', 409)
  }
  const invocation = host.coordinator.jobInvocation(
    input.roomId,
    localIdentity('web', 'operator', 'operator', '本地操作员'),
    resolved.operation.title
  )
  const requestId = crypto.randomUUID()
  let resourceId: string | undefined
  if (!resolved.resource.base) {
    resourceId = resolved.resource.id
  }
  if (resolved.operation.execution === 'background') {
    const job = await host.jobs.start(
      invocation,
      resolved.operation.title,
      { kind: 'tool', capability: resolved.capability, arguments: input.parameters, resourceId },
      'resource:' + requestId
    )
    return ResourceResultSchema.parse({ requestId, status: 'accepted', jobId: job.id, artifactIds: [] })
  }
  if (resourceId) {
    const stored = providedResource(invocation.config, resourceId)
    invocation.input = {
      ...invocation.input,
      context: { ...invocation.input.context, resourceId, resourceRevision: providedResourceRevision(stored) }
    }
  }
  const services: PluginInvocation['services'] = {
    media: host.coordinator.pluginMedia(invocation.room),
    authorize(capability) {
      signal.throwIfAborted()
      host.coordinator.authorizeContext(
        input.roomId,
        invocation.room.mode,
        invocation.input.context,
        capability
      )
    },
    history(limit) {
      return projectHistory(
        host.coordinator.store.listMessages(input.roomId, limit),
        invocation.input.context.effective.settings
      )
    },
    send(text, callId, artifactIds, beforePart) {
      services.authorize('chat_send')
      return host.coordinator.delivery.send(
        invocation.room,
        text,
        undefined,
        'assistant',
        'resource:' + requestId + ':' + (callId ?? 'send'),
        {
          artifactIds,
          authorize: services.authorize,
          beforePart,
          presentation: host.coordinator.presentation(
            invocation.config,
            invocation.room,
            invocation.input,
            'resource:' + requestId,
            'tool-direct',
            signal
          )
        }
      )
    }
  }
  const output = await service.scoped(input.roomId, resolved.resource.providerId, signal, (scoped) => {
    return service.execute(
      { ...invocation, origin: 'admin', services },
      resolved.capability,
      input.parameters,
      requestId,
      scoped
    )
  })
  const result = completedPluginResult(output)
  return ResourceResultSchema.parse({
    requestId,
    status: 'done',
    output: result.value,
    text: result.text,
    artifactIds: result.artifactIds
  })
}
