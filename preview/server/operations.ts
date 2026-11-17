import Ajv2020 from 'ajv/dist/2020'
import type { ConfigValues } from '../../src/plugins/configuration/schema'
import type {
  Operation,
  OperationReference,
  InvokeOperation,
  InvocationResult
} from '../contracts/operations'
import { InvocationResultSchema } from '../contracts/operations'
import { provider, requireResource, resourceAvailable } from './registry'
import { requireRevision, type DemoState } from './state'
import { DemoError } from './errors'

const validator = new Ajv2020({ allErrors: true, strict: true, addUsedSchema: false })

export function validateOperation(operation: Operation) {
  const input = validator.compile(operation.inputSchema)
  validator.compile(operation.outputSchema)
  if (!input(operation.example)) {
    throw new DemoError('操作示例不符合输入 Schema')
  }
}

export function resolveOperation(state: DemoState, reference: OperationReference) {
  const resource = requireResource(state, reference.resourceId)
  if (!resourceAvailable(state, resource.id)) {
    throw new DemoError('资源或提供者当前不可用', 409)
  }
  const module = provider(resource.providerId)
  const operation = module.declaration.operations.find((entry) => {
    return entry.id === reference.operationId && resource.operationIds.includes(entry.id)
  })
  if (!operation) {
    throw new DemoError('资源未暴露该操作', 404)
  }
  return { resource, module, operation }
}

export class OperationRunner {
  async invoke(
    state: DemoState,
    input: InvokeOperation,
    disconnected?: AbortSignal
  ): Promise<InvocationResult> {
    requireRevision(state.revision, input.revision)
    const { resource, module, operation } = resolveOperation(state, input)
    requireRevision(operation.version, input.operationVersion)
    const checkInput = validator.compile(operation.inputSchema)
    if (!checkInput(input.parameters)) {
      throw new DemoError('输入不符合操作 Schema：' + validator.errorsText(checkInput.errors))
    }
    const instance = state.providers.find((entry) => {
      return entry.id === resource.providerId
    })!
    const requestId = crypto.randomUUID()
    const start = performance.now()
    const controller = new AbortController()
    const disconnectedAbort = () => {
      controller.abort()
    }
    disconnected?.addEventListener('abort', disconnectedAbort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | undefined
    try {
      const interrupted = new Promise<never>((_, reject) => {
        abortListener = () => {
          reject(new DemoError('CANCELLED'))
        }
        controller.signal.addEventListener('abort', abortListener, { once: true })
        timer = setTimeout(() => {
          reject(new DemoError('TIMEOUT'))
          controller.abort()
        }, operation.timeoutMs)
        if (disconnected?.aborted) {
          controller.abort()
        }
      })
      const output: ConfigValues = await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) {
            throw new DemoError('CANCELLED')
          }
          return module.invoke(
            {
              operationId: operation.id,
              externalId: resource.externalId,
              parameters: Object.freeze(structuredClone(input.parameters)),
              configuration: Object.freeze(structuredClone(instance.configuration)),
              resourceConfiguration: Object.freeze(structuredClone(resource.configuration)),
              requestId
            },
            controller.signal
          )
        }),
        interrupted
      ])
      const checkOutput = validator.compile(operation.outputSchema)
      if (!checkOutput(output)) {
        throw new DemoError('INVALID_OUTPUT')
      }
      return InvocationResultSchema.parse({
        requestId,
        ...input,
        demonstration: true,
        status: 'succeeded',
        output,
        elapsedMs: performance.now() - start
      })
    } catch (error) {
      let code = 'PROVIDER_ERROR'
      let message = '提供者操作失败。'
      let status: InvocationResult['status'] = 'failed'
      if (error instanceof DemoError && error.message === 'INVALID_OUTPUT') {
        code = 'INVALID_OUTPUT'
        message = '提供者响应不符合输出 Schema，未返回原始响应。'
      }
      if (error instanceof DemoError && error.message === 'TIMEOUT') {
        code = 'TIMEOUT'
        message = '调用超时，未确认完成；不会自动重试。'
      }
      if (error instanceof DemoError && error.message === 'CANCELLED') {
        code = 'CANCELLED'
        message = '调用已取消；上游副作用需另外确认。'
        status = 'cancelled'
      }
      return {
        requestId,
        resourceId: input.resourceId,
        operationId: input.operationId,
        demonstration: true,
        status,
        error: { code, message },
        elapsedMs: performance.now() - start
      }
    } finally {
      clearTimeout(timer)
      if (abortListener) {
        controller.signal.removeEventListener('abort', abortListener)
      }
      disconnected?.removeEventListener('abort', disconnectedAbort)
    }
  }
}
