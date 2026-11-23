import { expect, test } from 'bun:test'
import { z } from 'zod'
import { pluginFixture } from './plugin-fixture'
import { jobHarness } from './job-harness'
import { PluginTimers } from '../src/plugins/timers'
import { PluginService } from '../src/plugins/service'
import { ResourceLibrary } from '../src/resources/library'
import { ResourcesConfigSchema } from '../src/resources/schema'
import { responsesReply } from './responses-fixture'

test('declared instance maintenance runs without an agent or chat message and closes with its host', async () => {
  const env = await pluginFixture()
  const binding = await env.register(
    'timer-fixture',
    `export default { operations: { async sample(input, ctx) {
    const entry = await ctx.host('state.read', { area: 'instance', key: 'tick' })
    await ctx.host('state.compare', { area: 'instance', key: 'tick', version: entry.version, value: { count: (entry.value?.count ?? 0) + 1, origin: ctx.invocation.origin } })
    return { text: '', artifactIds: [], suppressText: true }
  } } }`,
    {
      operations: [
        {
          id: 'sample',
          title: 'Sample',
          description: 'Sample',
          tool: false,
          data: 'none',
          inputSchema: { type: 'object' },
          grants: ['state.read', 'state.write']
        }
      ],
      timers: [{ id: 'tick', operation: 'sample', intervalSeconds: 300, enabledSetting: 'enabled' }]
    }
  )
  binding.instance.grants = ['state.read', 'state.write']
  binding.instance.settings = { enabled: true }
  const library = new ResourceLibrary(
    ResourcesConfigSchema.parse({ plugins: [binding.instance] }),
    [],
    [],
    [binding.bundle]
  )
  const app = await jobHarness(
    () => {
      return responsesReply({ kind: 'text', text: 'unused' })
    },
    library,
    (coordinator, config) => {
      config.bot.plugins = env.manager.config
      coordinator.plugins = new PluginService(() => {
        return config
      }, env.manager)
    }
  )
  const timers = new PluginTimers(
    () => {
      return app.config
    },
    app.coordinator.plugins!,
    app.coordinator
  )
  try {
    timers.start()
    let value: unknown
    for (let attempt = 0; attempt < 100; attempt++) {
      value = (
        await app.coordinator.plugins!.managed!.state.read(binding.instance.id, 'unused-scope', {
          area: 'instance',
          key: 'tick'
        })
      ).value
      if (value !== null) {
        break
      }
      await Bun.sleep(20)
    }
    expect(z.object({ count: z.number(), origin: z.string() }).parse(value)).toEqual({
      count: 1,
      origin: 'schedule'
    })
    expect(app.requests).toHaveLength(0)
    expect(app.store.listMessages(app.room.id)).toHaveLength(0)
  } finally {
    await timers.close()
    await app.close()
    await env.close()
  }
})
