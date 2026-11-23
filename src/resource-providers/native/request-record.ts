import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { revision } from '../../settings/resolve'
import { UncertainHostResult } from '../../plugins/rpc/uncertain'
import type { ResourceInstance } from '../protocol'
import type { ResourceNativeContext } from './contracts'

const RecordSchema = z.object({
  fingerprint: z.string(),
  state: z.enum(['pending', 'complete', 'failed']),
  value: z.unknown().optional()
})
const active = new Map<string, Promise<void>>()
export async function recordedResourceRequest<Schema extends z.ZodType>(
  instance: ResourceInstance,
  context: ResourceNativeContext,
  fingerprint: string,
  schema: Schema,
  invoke: () => Promise<z.output<Schema>>
): Promise<z.output<Schema>> {
  const directory = join(context.dataDir, 'resource-requests', instance.id)
  const path = join(
    directory,
    revision([context.owner.scope, context.owner.caller, context.requestId]) + '.json'
  )
  while (active.has(path)) {
    await active.get(path)
  }
  const completed = Promise.withResolvers<void>()
  active.set(path, completed.promise)
  async function save(value: z.input<typeof RecordSchema>) {
    await mkdir(directory, { recursive: true })
    const temporary = path + '.' + crypto.randomUUID() + '.tmp'
    try {
      await Bun.write(temporary, JSON.stringify(value), { mode: 0o600 })
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }
  try {
    context.authorize()
    if (await Bun.file(path).exists()) {
      const existing = RecordSchema.parse(await Bun.file(path).json())
      if (existing.fingerprint !== fingerprint) {
        throw new Error('请求键已经绑定不同参数')
      }
      if (existing.state === 'complete') {
        return schema.parse(existing.value)
      }
      if (existing.state === 'pending') {
        throw new UncertainHostResult('原资源请求结果未确认，不重复请求')
      }
      throw new Error('原资源请求已失败，不重复请求')
    }
    await save({ fingerprint, state: 'pending' })
    let committed = false
    try {
      context.authorize()
      const value = schema.parse(await invoke())
      await save({ fingerprint, state: 'complete', value })
      committed = true
      context.authorize()
      return value
    } catch (error) {
      if (!committed && !(error instanceof UncertainHostResult)) {
        await save({ fingerprint, state: 'failed' })
      }
      throw error
    }
  } finally {
    active.delete(path)
    completed.resolve()
  }
}
