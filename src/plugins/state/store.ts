import { defineDocFamily, type Tx } from '@earendil-works/pi-durable'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { z } from 'zod'
import { revision } from '../../settings/resolve'
import type { AgentRuntime } from '../../agent/runtime'
const EntrySchema = z.object({ version: z.number().int().nonnegative(), value: z.json() })
const NamespaceSchema = z.object({ entries: z.record(z.string(), EntrySchema) })
const PluginState = defineDocFamily<z.infer<typeof NamespaceSchema>, null>({
  kind: 'bot.plugin-state',
  version: 1,
  scope: 'session',
  family: true,
  initial: () => ({ entries: {} }),
  checkpointWhen: () => true
})
export const StateKeySchema = z
  .object({
    area: z.enum(['scope', 'instance', 'operation']),
    key: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/u),
    volatile: z.boolean().optional()
  })
  .strict()
export const StateCompareSchema = StateKeySchema.extend({
  version: z.number().int().nonnegative(),
  value: z.json(),
  resourceReceipt: z
    .object({ alias: z.string(), method: z.string(), item: z.number().int().nonnegative() })
    .strict()
    .optional(),
  comfyReceipt: z
    .object({ alias: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/u), item: z.number().int().min(0).max(15) })
    .strict()
    .optional()
}).strict()
export class PluginStateStore {
  private readonly memory = new Map<
    string,
    { epoch: string; entries: Map<string, z.infer<typeof EntrySchema>> }
  >()
  constructor(private readonly runtime: AgentRuntime) {}
  private namespace(instance: string, room: string, area: 'scope' | 'instance' | 'operation') {
    if (area === 'instance') {
      return revision([instance, area])
    }
    return revision([instance, area, room])
  }
  private volatile(instance: string, room: string, area: 'scope' | 'instance' | 'operation', epoch: string) {
    const key = this.namespace(instance, room, area)
    let state = this.memory.get(key)
    if (!state || state.epoch !== epoch) {
      state = { epoch, entries: new Map() }
      this.memory.set(key, state)
    }
    return state.entries
  }
  async read(instance: string, room: string, input: z.infer<typeof StateKeySchema>, epoch = 'process') {
    if (input.volatile) {
      return structuredClone(
        this.volatile(instance, room, input.area, epoch).get(input.key) ?? { version: 0, value: null }
      )
    }
    const stored = await this.runtime.native.snapshot(
      PluginState,
      this.namespace(instance, room, input.area),
      BACKGROUND_CONTEXT
    )
    const entry = stored?.entries[input.key]
    if (!entry) {
      return { version: 0, value: null }
    }
    return EntrySchema.parse(entry)
  }
  async compare(
    instance: string,
    room: string,
    input: z.infer<typeof StateCompareSchema>,
    authorize: () => void,
    record?: (tx: Tx) => Promise<boolean>,
    epoch = 'process'
  ) {
    if (Buffer.byteLength(JSON.stringify(input.value)) > 32768) {
      throw new Error('状态值超过32KiB额度')
    }
    if (input.volatile) {
      if (record) {
        throw new Error('永久回执不能登记到临时状态')
      }
      authorize()
      const entries = this.volatile(instance, room, input.area, epoch)
      const version = entries.get(input.key)?.version ?? 0
      if (version !== input.version) {
        return { applied: false, version }
      }
      entries.set(input.key, { version: version + 1, value: structuredClone(input.value) })
      return { applied: true, version: version + 1 }
    }
    return this.runtime.native.commit(async (tx) => {
      authorize()
      const doc = await tx.doc(PluginState, this.namespace(instance, room, input.area), null)
      const current = doc.entries[input.key]
      let version = 0
      if (current) {
        version = current.version
      }
      if (version !== input.version) {
        return { applied: false, version }
      }
      if (record && !(await record(tx))) {
        return { applied: true, version, duplicate: true }
      }
      const entries = {
        ...NamespaceSchema.parse(doc).entries,
        [input.key]: { version: version + 1, value: input.value }
      }
      if (Object.keys(entries).length > 64 || Buffer.byteLength(JSON.stringify(entries)) > 131072) {
        throw new Error('状态命名空间超过64键/128KiB额度')
      }
      doc.entries = entries
      return { applied: true, version: version + 1 }
    }, BACKGROUND_CONTEXT)
  }
}
