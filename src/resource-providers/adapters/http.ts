import { z } from 'zod'
import type { ConfigValues } from '../../plugins/configuration/schema'
import type { ResourceMapping, ResourceInstance } from '../protocol'
import { resourceConnection, boundedBody } from './connection'
import { UncertainHostResult } from '../../plugins/rpc/uncertain'

export async function invokeResourceHttp(
  instance: ResourceInstance,
  mapping: ResourceMapping,
  input: ConfigValues,
  requestId: string,
  signal: AbortSignal,
  readOnly: boolean
) {
  const transport = mapping.transport
  if (transport.kind !== 'http') {
    throw new Error('HTTP 适配定义不匹配')
  }
  const config = resourceConnection(instance)
  const base = new URL(config.endpoint.replace(/\/?$/u, '/'))
  const path = transport.path.replace(/\{([a-zA-Z0-9_]+)\}/gu, (_match, field: string) => {
    const value = z.union([z.string().min(1), z.number()]).parse(input[field])
    if (['.', '..'].includes(String(value))) {
      throw new Error('路径参数无效')
    }
    return encodeURIComponent(String(value))
  })
  const url = new URL(path.slice(1), base)
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error('资源请求超出已配置的路径')
  }
  for (const [name, field] of Object.entries(transport.query)) {
    if (input[field] !== undefined) {
      url.searchParams.set(name, String(z.union([z.string(), z.number(), z.boolean()]).parse(input[field])))
    }
  }
  const headers = new Headers(config.headers)
  headers.set('x-pi-plugin-request', 'resource')
  headers.set('Content-Type', 'application/json')
  if (transport.idempotencyHeader) {
    headers.set(transport.idempotencyHeader, requestId)
  }
  let body: string | undefined
  if (transport.method !== 'GET') {
    body = JSON.stringify(input)
  }
  let response: Response
  try {
    response = await fetch(url, { method: transport.method, headers, body, signal, redirect: 'manual' })
  } catch {
    if (!readOnly) {
      throw new UncertainHostResult('资源请求提交后连接中断')
    }
    throw new Error('无法读取资源响应')
  }
  if (!response.ok) {
    await response.body?.cancel()
    if (!readOnly && response.status >= 500) {
      throw new UncertainHostResult('上游执行结果未确认')
    }
    throw new Error('资源 HTTP 请求返回 ' + response.status)
  }
  try {
    const bytes = await boundedBody(response)
    return z.json().parse(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    if (!readOnly) {
      throw new UncertainHostResult('资源执行响应不完整')
    }
    throw new Error('资源响应不是完整 JSON')
  }
}
