import { z } from 'zod'
import type { ComfyService } from './resources'
const DetailSchema = z.object({
  message: z.string().optional(),
  type: z.string().optional(),
  details: z.string().optional(),
  extra_info: z.object({ input_name: z.string().optional() }).optional()
})
const ErrorSchema = z.object({
  error: z.union([z.string(), DetailSchema]).optional(),
  node_errors: z
    .record(
      z.string(),
      z.object({ class_type: z.string().default('unknown'), errors: z.array(DetailSchema).default([]) })
    )
    .default({})
})
export async function comfyErrorDetail(response: Response, service: ComfyService) {
  let raw = ''
  const reader = response.body?.getReader()
  if (reader) {
    try {
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (bytes < 65536) {
        const part = await reader.read()
        if (part.done) {
          break
        }
        const piece = part.value.subarray(0, 65536 - bytes)
        chunks.push(piece)
        bytes += piece.length
      }
      raw = Buffer.concat(chunks).toString('utf8')
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const error = ErrorSchema.safeParse(parsed)
  const parts: string[] = []
  if (error.success) {
    if (typeof error.data.error === 'string') {
      parts.push(error.data.error)
    } else if (error.data.error) {
      parts.push(error.data.error.message || error.data.error.type || '', error.data.error.details || '')
    }
    for (const [id, node] of Object.entries(error.data.node_errors)) {
      for (const item of node.errors) {
        let prefix = '节点 ' + id + ' (' + node.class_type + ')'
        if (item.extra_info?.input_name) {
          prefix += ' 输入 ' + item.extra_info.input_name
        }
        parts.push(
          prefix + ': ' + (item.message || item.type || 'validation failed') + ' ' + (item.details || '')
        )
      }
    }
  }
  let detail = parts.filter(Boolean).join('；') || raw.trim() || 'ComfyUI 未返回错误详情'
  for (const value of Object.values(service.headers)) {
    if (value) {
      detail = detail.replaceAll(value, '[credential]')
      const token = value.replace(/^(?:Bearer|Basic)\s+/iu, '')
      if (token) {
        detail = detail.replaceAll(token, '[credential]')
      }
    }
  }
  const url = new URL(service.url)
  for (const secret of [url.username, url.password]) {
    if (secret) {
      detail = detail.replaceAll(secret, '[credential]')
    }
  }
  return ('ComfyUI 拒绝工作流 (' + response.status + '): ' + detail).slice(0, 1800)
}
