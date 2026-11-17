import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { DemoPluginSchema, PresetSchema } from '../contracts/presets'
import { ProviderInstanceSchema, ResourceRecordSchema } from '../contracts/resources'
import { DemoError } from './errors'

export const DemoStateSchema = z.object({
  version: z.literal(2),
  revision: z.number().int(),
  defaultPresetId: z.string(),
  presets: z.array(PresetSchema),
  plugins: z.array(DemoPluginSchema),
  providers: z.array(ProviderInstanceSchema),
  resources: z.array(ResourceRecordSchema),
  handlerInvocations: z.number().int()
})
export type DemoState = z.infer<typeof DemoStateSchema>

async function writePrivateState(path: string, state: DemoState) {
  const temporary = path + '.pending-' + crypto.randomUUID()
  try {
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export class DemoStore {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(
    readonly path: string,
    private state: DemoState
  ) {}

  static async open(path: string, seed: () => Promise<DemoState>) {
    let state: DemoState
    if (await Bun.file(path).exists()) {
      state = DemoStateSchema.parse(await Bun.file(path).json())
      await chmod(path, 0o600)
    } else {
      state = await seed()
      await mkdir(dirname(path), { recursive: true })
      await writePrivateState(path, state)
    }
    return new DemoStore(path, state)
  }

  read() {
    return structuredClone(this.state)
  }

  async change<T>(operation: (next: DemoState) => T | Promise<T>) {
    const work = this.tail.then(async () => {
      const next = structuredClone(this.state)
      const result = await operation(next)
      next.revision += 1
      DemoStateSchema.parse(next)
      await writePrivateState(this.path, next)
      this.state = next
      return result
    })
    this.tail = work.catch(() => {})
    return work
  }
}

export function requireRevision(actual: number | string, expected: number | string) {
  if (actual !== expected) {
    throw new DemoError('配置已被另一操作更新；草稿已保留，请刷新后重试。', 409)
  }
}
export function requirePreset(state: DemoState, id: string) {
  const preset = state.presets.find((item) => {
    return item.id === id
  })
  if (!preset) {
    throw new DemoError('预设不存在', 404)
  }
  return preset
}
