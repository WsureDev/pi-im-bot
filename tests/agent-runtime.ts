import { afterEach } from 'bun:test'
import { MemoryStorage } from '@earendil-works/pi-durable'
import { DurableAgentRuntime } from '../src/agent/durable/runtime'
import type { AgentRuntime } from '../src/agent/runtime'

const runtimes = new Map<string, Promise<DurableAgentRuntime>>()

/** Run the real production engine; retain shared conversations between test turns. */
export async function runAgent(
  ...args: Parameters<AgentRuntime['run']> extends [string, ...infer Rest] ? Rest : never
) {
  const [config, room, input, signal, services, callbacks] = args
  let opening = runtimes.get(config.dataDir)
  if (!opening) {
    opening = new DurableAgentRuntime().open(new MemoryStorage())
    runtimes.set(config.dataDir, opening)
  }
  const runtime = await opening
  return runtime.run(crypto.randomUUID(), config, room, input, signal, services, callbacks)
}

afterEach(async () => {
  const pending = [...runtimes.values()]
  runtimes.clear()
  await Promise.all(
    pending.map(async (opening) => {
      await (await opening).close()
    })
  )
})
