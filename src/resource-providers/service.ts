import { compile } from '@earendil-works/pi-schema'
import { ResourceCallSchema, resourceCapability, type ResourceCall } from './protocol'
import { resolveResource, type ResourceDefinitions } from './registry'
import { resourceConnection } from './adapters/connection'
import { invokeResourceHttp } from './adapters/http'
import { invokeResourceMcp } from './adapters/mcp'
import { resourceFiles } from './files'
import { UncertainHostResult } from '../plugins/rpc/uncertain'
import { mapResourceInput, selectValue } from './adapters/mapping'
import { z } from 'zod'
import { nativeResourceAdapter } from './native/registry'
import type { ResourceNativeContext } from './native/contracts'
import { deadlineScope } from '../runtime/deadline'

export interface ResourceExecution {
  requestId: string
  signal: AbortSignal
  authorize(capability: string): void
  readOnly?: boolean
  host?: Omit<ResourceNativeContext, 'signal' | 'requestId' | 'authorize'>
}
export async function callResource(
  current: () => ResourceDefinitions,
  raw: ResourceCall,
  context: ResourceExecution
) {
  const call = ResourceCallSchema.parse(raw)
  const selected = resolveResource(current(), call.resourceId, call.protocol, call.method)
  const capability = resourceCapability(call.resourceId, call.protocol, call.method)
  function check() {
    context.signal.throwIfAborted()
    context.authorize(capability)
    if (
      resolveResource(current(), call.resourceId, call.protocol, call.method).revision !== selected.revision
    ) {
      throw new Error('资源定义或配置已变化，本次调用失效')
    }
  }
  check()
  if (context.readOnly && selected.method.effect !== 'read') {
    throw new Error('此调用只允许只读资源方法')
  }
  if (!compile(selected.method.inputSchema).check(call.parameters)) {
    throw new Error('参数与资源协议不匹配')
  }
  const parameters = mapResourceInput(selected.mapping, call.parameters)
  let timeoutMs = 30000
  if (selected.mapping.transport.kind === 'registered') {
    timeoutMs = z
      .number()
      .int()
      .positive()
      .parse(
        selected.instance.configuration[selected.provider.timeoutField] ??
          selected.provider.configuration[selected.provider.timeoutField]?.default ??
          30000
      )
  } else {
    timeoutMs = resourceConnection(selected.instance).timeoutMs
  }
  const deadline = deadlineScope(context.signal, Date.now() + timeoutMs)
  const signal = deadline.signal
  let value
  const artifactIds: string[] = []
  let received = false
  try {
    if (selected.mapping.transport.kind === 'http') {
      value = await invokeResourceHttp(
        selected.instance,
        selected.mapping,
        parameters,
        context.requestId,
        signal,
        selected.method.effect === 'read'
      )
    } else if (selected.mapping.transport.kind === 'mcp') {
      value = await invokeResourceMcp(
        selected.instance,
        selected.mapping,
        parameters,
        signal,
        selected.method.effect === 'read'
      )
    } else {
      if (!context.host) {
        throw new Error('此资源方法需要受管运行上下文')
      }
      const adapter = nativeResourceAdapter(selected.mapping.transport.adapter)
      adapter.validate(selected.instance)
      const result = await adapter.invoke(selected.instance, call.method, parameters, {
        ...context.host,
        signal,
        requestId: context.requestId,
        authorize: check,
        readOnly: context.readOnly || selected.method.effect === 'read'
      })
      value = z.json().parse(JSON.parse(JSON.stringify(result.value)))
      artifactIds.push(...result.artifactIds)
    }
    received = true
    if (selected.mapping.outputPath) {
      value = z.json().parse(selectValue(value, selected.mapping.outputPath))
    }
    if (!compile(selected.method.outputSchema).check(value)) {
      throw new Error('返回结果与资源协议不匹配')
    }
  } catch (error) {
    if (error instanceof UncertainHostResult || (received && selected.method.effect === 'write')) {
      throw new UncertainHostResult(
        '资源写操作结果未确认，请查询原任务；未自动重试。调用 ID：' + context.requestId
      )
    }
    throw new Error('资源调用失败或返回不符合协议，请检查连接、参数和后端状态')
  } finally {
    deadline.close()
  }
  check()
  return {
    requestId: context.requestId,
    value,
    files: resourceFiles(selected.instance, selected.mapping, value),
    artifactIds
  }
}
