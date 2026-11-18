import { z } from 'zod'
import type { ResourceInstance } from '../protocol'

export const ResourceConnectionSchema = z.object({
  endpoint: z.url().refine((text) => {
    const url = new URL(text)
    return (
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
    )
  }, '连接须为不含内嵌凭据或查询参数的 HTTP(S) 地址'),
  headers: z
    .string()
    .default('{}')
    .transform((value, context) => {
      try {
        return z.record(z.string(), z.string()).parse(JSON.parse(value || '{}'))
      } catch {
        context.addIssue({ code: 'custom', message: 'Headers 必须是 JSON 字符串字典' })
        return z.NEVER
      }
    }),
  timeoutMs: z.number().int().min(1000).max(300000).default(30000)
})
export function resourceConnection(instance: ResourceInstance) {
  return ResourceConnectionSchema.parse(instance.configuration)
}

export async function boundedBody(response: Response, maximum = 8 * 1024 * 1024) {
  if (!response.body) {
    return new Uint8Array()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }
      length += next.value.length
      if (length > maximum) {
        throw new Error('资源响应超过传输预算')
      }
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}
