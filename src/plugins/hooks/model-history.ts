import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { z } from 'zod'
import type { PluginExecution } from '../execution'
import type { PluginInvocation } from '../invocation'
import { collectPluginPoint } from './dispatch'
import { historyProjectionNode, assistantHistoryNode } from './points'
import { transformPluginPoint } from './transform'
import { pluginHookId, pluginToolName, pluginOperationId } from '../identity'
const JobCallSchema = z
  .object({
    kind: z.literal('tool').optional(),
    capability: z.string(),
    arguments: z.record(z.string(), z.unknown())
  })
  .passthrough()
const HiddenArguments = {
  modelProjection: 'arguments withheld by this scope prompt-history policy; immutable audit retained'
}
export async function projectPluginHistory<T extends AgentMessage>(
  service: PluginExecution | undefined,
  invocation: PluginInvocation,
  messages: readonly T[],
  signal: AbortSignal
): Promise<T[]> {
  if (!service?.available()) {
    return [...messages]
  }
  const registry = invocation.config.resources.pluginRegistry(invocation.input.context.effective.settings)
  const entries = registry
    .plan(historyProjectionNode.id, {
      channel: invocation.room.address.channel,
      origin: invocation.input.source
    })
    .filter((entry) => {
      return invocation.input.context.authority.capabilities.includes(
        pluginHookId(entry.instanceId, entry.hook.id)
      )
    })
  const textEntries = registry
    .plan(assistantHistoryNode.id, {
      channel: invocation.room.address.channel,
      origin: invocation.input.source
    })
    .filter((entry) => {
      return invocation.input.context.authority.capabilities.includes(
        pluginHookId(entry.instanceId, entry.hook.id)
      )
    })
  if (!entries.length && !textEntries.length) {
    return [...messages]
  }
  const choices = await collectPluginPoint(
    entries,
    {},
    historyProjectionNode.output,
    {
      signal,
      report() {},
      invoke(entry, value, _revision, signal) {
        return service.hook(
          invocation,
          registry,
          entry,
          value,
          'model-projection:' + invocation.input.receivedAt,
          signal
        )
      }
    },
    invocation.config.bot.plugins.maxHookConcurrency
  )
  const names = new Set<string>()
  const capabilities = new Set<string>()
  for (const choice of choices) {
    const instance = choice.handler.split('/')[0]
    const binding = registry.bindings.get(instance)
    for (const operation of choice.output.hideArguments) {
      if (
        binding?.bundle.manifest.operations.some((entry) => {
          return entry.id === operation
        })
      ) {
        names.add(pluginToolName(instance, operation))
        capabilities.add(pluginOperationId(instance, operation))
      }
    }
  }
  if (!names.size && !textEntries.length) {
    return [...messages]
  }
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== 'assistant') {
        return message
      }
      let changed = false
      const content = await Promise.all(
        message.content.map(async (part) => {
          if (part.type === 'text' && textEntries.length) {
            const projected = await transformPluginPoint({
              registry,
              point: assistantHistoryNode.id,
              selector: { channel: invocation.room.address.channel, origin: invocation.input.source },
              value: { text: part.text },
              schema: assistantHistoryNode.input,
              handlers: textEntries,
              signal,
              invoke(entry, value, _revision, childSignal) {
                return service.hook(
                  invocation,
                  registry,
                  entry,
                  value,
                  'history-text:' + message.timestamp,
                  childSignal
                )
              }
            })
            changed ||= projected.text !== part.text
            return { ...part, text: projected.text }
          }
          if (part.type !== 'toolCall') {
            return part
          }
          if (names.has(part.name)) {
            changed = true
            return { ...part, arguments: { ...HiddenArguments } }
          }
          if (part.name === 'start_job') {
            const spec = JobCallSchema.safeParse(part.arguments)
            if (spec.success && capabilities.has(spec.data.capability)) {
              changed = true
              return { ...part, arguments: { ...part.arguments, arguments: { ...HiddenArguments } } }
            }
          }
          return part
        })
      )
      if (!changed) {
        return message
      }
      return Object.assign({}, message, { content })
    })
  )
}
