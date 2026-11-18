import { z } from 'zod'
import type { ResourceMapping, ResourceInstance } from './protocol'
import { ResourceOutputSchema } from './protocol'
import { resourceConnection, boundedBody } from './adapters/connection'
import type { ArtifactStore } from '../artifacts/store'

function collect(value: unknown, parts: string[]): unknown[] {
  if (!parts.length) {
    return [value]
  }
  const object = z.record(z.string(), z.unknown()).safeParse(value)
  const array = z.array(z.unknown()).safeParse(value)
  if (parts[0] === '*') {
    let values: unknown[] = []
    if (array.success) {
      values = array.data
    } else if (object.success) {
      values = Object.values(object.data)
    }
    return values.flatMap((entry) => {
      return collect(entry, parts.slice(1))
    })
  }
  if (object.success && Object.hasOwn(object.data, parts[0])) {
    return collect(object.data[parts[0]], parts.slice(1))
  }
  return []
}
export function resourceFiles(instance: ResourceInstance, mapping: ResourceMapping, value: unknown) {
  const definition = mapping.files
  if (!definition) {
    return []
  }
  const base = new URL(resourceConnection(instance).endpoint.replace(/\/?$/u, '/'))
  const values = collect(value, definition.itemsPath.split('/').slice(1))
  return values.slice(0, 64).map((raw) => {
    const item = z.record(z.string(), z.unknown()).parse(raw)
    let url: URL
    if (definition.urlField) {
      url = new URL(z.string().parse(item[definition.urlField]))
    } else {
      url = new URL((definition.path ?? '/view').replace(/^\//u, ''), base)
      for (const [key, field] of Object.entries(definition.query)) {
        if (item[field] !== undefined) {
          url.searchParams.set(key, z.string().parse(item[field]))
        }
      }
    }
    if (url.origin !== base.origin || url.username || url.password) {
      throw new Error('资源文件引用超出配置服务的同源范围')
    }
    let name = url.pathname.split('/').pop() || 'resource-image'
    if (typeof item.filename === 'string') {
      name = item.filename
    }
    return { url: url.toString(), name }
  })
}
export async function materializeResourceFiles(
  instance: ResourceInstance,
  output: z.infer<typeof ResourceOutputSchema>,
  artifacts: ArtifactStore,
  signal: AbortSignal,
  authorize: () => void
) {
  const config = resourceConnection(instance)
  const origin = new URL(config.endpoint).origin
  const ids: string[] = []
  for (const file of output.files.slice(0, 8)) {
    authorize()
    const url = new URL(file.url)
    if (url.origin !== origin || url.username || url.password) {
      throw new Error('文件引用不属于此资源')
    }
    const headers = new Headers(config.headers)
    headers.set('x-pi-plugin-request', 'resource')
    const response = await fetch(url, { headers, signal, redirect: 'manual' })
    const mime = (response.headers.get('Content-Type') ?? '').split(';')[0]
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
      await response.body?.cancel()
      throw new Error('资源图片不可读取或类型不支持')
    }
    const bytes = await boundedBody(response, artifacts.maximumFileBytes)
    authorize()
    const saved = await artifacts.save(file.name, mime, 'resource:' + instance.id, bytes)
    ids.push(saved.id)
  }
  return ids
}
