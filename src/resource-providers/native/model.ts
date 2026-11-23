import { z } from 'zod'
import { normalizeContext, type Message } from '@earendil-works/pi-ai'
import type { ProviderCatalog } from '../../providers/catalog'
import { createResponsesStream } from '../../providers/responses'
import type { NativeResourceAdapter } from './contracts'
import { revision } from '../../settings/resolve'
import { recordedResourceRequest } from './request-record'

export const ResourceCompletionSchema = z
  .object({
    prompt: z.string(),
    system: z.string().default(''),
    contexts: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }).strict())
      .default([])
  })
  .strict()
export type ResourceCompletion = z.infer<typeof ResourceCompletionSchema>
export interface ResourceModels {
  complete(
    group: string,
    input: ResourceCompletion,
    signal: AbortSignal
  ): Promise<{ text: string; provider: string; model: string }>
}
export function resourceModels(
  current: () => ProviderCatalog,
  defaultGroup: string,
  persona: string
): ResourceModels {
  return {
    async complete(group, input, signal) {
      const catalog = current()
      const captured = revision(catalog.config)
      const selected = group || defaultGroup
      const model = catalog.forGroup(selected)[0]?.model
      if (!model) {
        throw new Error('资源引用的模型组不可用')
      }
      const stream = createResponsesStream(catalog, selected, { preview() {}, attempt() {} })
      const texts: Message[] = input.contexts.map((entry) => {
        if (entry.role === 'user') {
          return { role: 'user', content: entry.content, timestamp: Date.now() }
        }
        return {
          role: 'assistant',
          content: [{ type: 'text', text: entry.content }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          stopReason: 'stop',
          timestamp: Date.now(),
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
          }
        }
      })
      const context = normalizeContext({
        systemPrompt: [persona, input.system].filter(Boolean).join('\n\n'),
        messages: [...texts, { role: 'user', content: input.prompt, timestamp: Date.now() }]
      })
      const result = await stream(model, context, { signal }).result()
      signal.throwIfAborted()
      if (revision(current().config) !== captured) {
        throw new Error('模型连接在请求期间已变化')
      }
      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        throw new Error('受管模型请求未完成')
      }
      return {
        text: result.content
          .flatMap((part) => {
            if (part.type === 'text') {
              return [part.text]
            }
            return []
          })
          .join(''),
        provider: result.provider,
        model: result.model
      }
    }
  }
}
export const frameworkModelAdapter: NativeResourceAdapter = {
  id: 'framework-model',
  validate(instance) {
    z.object({ group: z.string().default(''), timeoutMs: z.number().int().positive().default(300000) }).parse(
      instance.configuration
    )
  },
  async invoke(instance, method, parameters, context) {
    if (context.readOnly || method !== 'complete' || !context.models) {
      throw new Error('此上下文不能调用模型资源')
    }
    const group = z.string().parse(instance.configuration.group ?? '')
    context.authorize()
    const input = ResourceCompletionSchema.parse(parameters)
    const models = context.models
    const value = await recordedResourceRequest(
      instance,
      context,
      revision({ group, input }),
      z.object({ text: z.string(), provider: z.string(), model: z.string() }),
      () => {
        return models.complete(group, input, context.signal)
      }
    )
    context.authorize()
    return { value, artifactIds: [] }
  }
}
