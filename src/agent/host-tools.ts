import type { BotTool } from '../capabilities/tool'
import { z } from 'zod'
import { obj, int, str, opt, arr } from '@earendil-works/pi-schema'
import { createJobTools } from '../jobs/tools'
import { createScheduleTools } from './schedule-tools'
import { chatSendTool } from './chat-send'
import type { HostToolServices } from './services'

const HistoryInputSchema = z.object({ limit: z.number().int().min(1).max(100) })
const SendInputSchema = z
  .object({ text: z.string().max(20000), artifactIds: z.array(z.uuid()).max(8).default([]) })
  .refine((value) => {
    return value.text.length > 0 || value.artifactIds.length > 0
  }, '消息和产物不能同时为空')

export function createHostTools(services: HostToolServices): BotTool[] {
  const tools: BotTool[] = [
    {
      name: 'chat_history',
      label: '会话历史',
      description:
        'Read recent messages from the current IM conversation. Use when earlier chat context is needed.',
      parameters: obj({ limit: int({ minimum: 1, maximum: 100 }) }),
      async execute(_id, input) {
        const { limit } = HistoryInputSchema.parse(input)
        const messages = services.history(limit)
        return {
          content: [{ type: 'text', text: JSON.stringify(messages) }],
          details: { count: messages.length }
        }
      }
    },
    chatSendTool(services)
  ]
  if (services.present) {
    tools.push({
      name: 'chat_present',
      label: '受管呈现消息',
      description:
        'Accept an explicit Agent notification for managed presentation. Returns delivered:true only after platform ACK, or delivered:false with an accepted render jobId. Do not resend accepted messages. Final replies are delivered automatically.',
      parameters: obj({ text: str(), artifactIds: opt(arr(str(), { maxItems: 8 })) }),
      async execute(id, input, signal) {
        signal?.throwIfAborted()
        const { text, artifactIds } = SendInputSchema.parse(input)
        const result = await services.present!(text, id, artifactIds)
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
      }
    })
  }
  if (services.schedules) {
    tools.push(...createScheduleTools(services.schedules))
  }
  if (services.jobs) {
    tools.push(...createJobTools(services.jobs))
  }
  return tools
}
