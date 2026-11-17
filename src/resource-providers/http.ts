import { z } from 'zod'
import type { ConfigValues } from '../plugins/configuration/schema'
import type { ProviderMetadataSchema } from './definition'
import { UncertainHostResult } from '../plugins/rpc/uncertain'
import { pluginOriginHeader } from '../http/plugin-origin'

export const ResourceHttpRequestSchema = z
  .object({
    path: z.string().max(2000),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    query: z.record(z.string(), z.string()).default({}),
    headers: z.record(z.string(), z.string()).default({}),
    body: z.json().optional(),
    response: z.enum(['auto', 'base64']).default('auto')
  })
  .strict()
export const ResourceHttpResponseSchema = z.object({
  status: z.number(),
  body: z.json(),
  contentType: z.string()
})
export type ResourceHttpRequest = z.input<typeof ResourceHttpRequestSchema>
export function resourceUrl(baseValue: string, path: string) {
  let base: URL
  try {
    base = new URL(baseValue)
  } catch {
    throw new Error('资源 HTTP 基址格式无效')
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('资源 HTTP 基址无效')
  }
  const prefix = base.pathname.replace(/\/?$/u, '/')
  base.pathname = prefix
  let target: URL
  try {
    target = new URL(path, base)
  } catch {
    throw new Error('资源 HTTP 路径无效')
  }
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(prefix) ||
    target.username ||
    target.password
  ) {
    throw new Error('资源 HTTP 路径超出配置的基址')
  }
  return target
}
export async function resourceHttpRequest(
  metadata: NonNullable<z.infer<typeof ProviderMetadataSchema>['http']>,
  configuration: ConfigValues,
  input: z.infer<typeof ResourceHttpRequestSchema>,
  signal: AbortSignal
) {
  const target = resourceUrl(z.string().parse(configuration[metadata.baseUrlField]), input.path)
  for (const [key, value] of Object.entries(input.query)) {
    target.searchParams.set(key, value)
  }
  let configuredHeaders: Record<string, string> = {}
  if (metadata.headersField) {
    configuredHeaders = z.record(z.string(), z.string()).parse(configuration[metadata.headersField] ?? {})
  }
  let headers: Headers
  try {
    headers = new Headers({ ...configuredHeaders, ...input.headers })
  } catch {
    throw new Error('资源 HTTP Header 无效')
  }
  for (const name of ['host', 'connection', 'proxy-authorization', 'content-length', 'transfer-encoding']) {
    headers.delete(name)
  }
  headers.set(pluginOriginHeader, '1')
  let body: string | undefined
  if (input.body !== undefined) {
    body = JSON.stringify(input.body)
    headers.set('content-type', 'application/json')
  }
  try {
    const response = await fetch(target, { method: input.method, headers, body, signal, redirect: 'manual' })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      if (reader) {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) {
            break
          }
          length += chunk.value.length
          if (length > 128 * 1024) {
            throw new Error('资源 HTTP 响应超出 128 KiB，使用产物或分页接口处理较大结果')
          }
          chunks.push(chunk.value)
        }
      }
    } finally {
      await reader?.cancel().catch(() => {})
    }
    const bytes = Buffer.concat(chunks)
    const text = bytes.toString('utf8')
    const contentType = response.headers.get('content-type') ?? ''
    let value: z.infer<ReturnType<typeof z.json>> = text
    if (input.response === 'base64') {
      value = bytes.toString('base64')
    } else if (contentType.includes('json') && text) {
      value = z.json().parse(JSON.parse(text))
    }
    return ResourceHttpResponseSchema.parse({ status: response.status, body: value, contentType })
  } catch {
    throw new UncertainHostResult('资源 HTTP 请求未取得可验证的完整响应；上游结果未确认，不会自动重试。')
  }
}
