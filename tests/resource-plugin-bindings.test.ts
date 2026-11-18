import { expect, test } from 'bun:test'
import { pluginFixture } from './plugin-fixture'
import { jobHarness } from './job-harness'
import { ResourceLibrary } from '../src/resources/library'
import { ResourcesConfigSchema } from '../src/resources/schema'
import { PluginService } from '../src/plugins/service'
import { localIdentity } from '../src/permissions/identity'
import { compatibleResource } from '../src/resource-providers/bindings'

test('two isolated consumer plugins share a resource without owning its credentials or lifecycle', async () => {
  let calls = 0
  const upstream = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      calls += 1
      expect(request.headers.get('Authorization')).toBe('TEST_ONLY_RESOURCE_CREDENTIAL')
      return Response.json({ models: [{ id: 'shared-model' }] })
    }
  })
  const worker = await pluginFixture()
  const bindings = []
  for (const id of ['first', 'second']) {
    const binding = await worker.register(
      id,
      `export default {operations:{async echo(input,context){const result=await context.host('resource:engine',{method:'models',parameters:{}});return {value:{result:result.value,context:JSON.stringify(context.invocation)}}}}}`,
      {
        resources: [{ alias: 'engine', protocol: 'pi.comfy-gateway@1', methods: ['models'] }],
        operations: [
          {
            id: 'echo',
            title: 'Read models',
            description: 'Read models',
            inputSchema: { type: 'object' },
            grants: ['resource:engine']
          }
        ]
      }
    )
    binding.instance.grants = ['resource:engine']
    binding.instance.resources = { engine: 'gateway' }
    bindings.push(binding)
  }
  const resources = new ResourceLibrary(
    ResourcesConfigSchema.parse({
      plugins: bindings.map((entry) => {
        return entry.instance
      }),
      providers: [
        {
          id: 'gateway',
          name: 'Shared',
          provider: 'comfy-gateway',
          enabled: true,
          configuration: {
            endpoint: 'http://127.0.0.1:' + upstream.port,
            headers: '{"Authorization":"TEST_ONLY_RESOURCE_CREDENTIAL"}'
          }
        }
      ]
    }),
    [],
    [],
    bindings.map((entry) => {
      return entry.bundle
    })
  )
  const app = await jobHarness(() => {
    throw new Error('Unexpected LLM')
  }, resources)
  app.config.bot.plugins = worker.manager.config
  const service = new PluginService(() => {
    return app.config
  }, worker.manager)
  async function invoke(id: string) {
    const invocation = app.coordinator.jobInvocation(
      app.room.id,
      localIdentity('web', 'operator'),
      'read models'
    )
    return service.execute(
      {
        ...invocation,
        services: {
          authorize: invocation.authorize,
          history() {
            return []
          },
          async send() {
            throw new Error('Unexpected delivery')
          }
        }
      },
      'plugin:' + id + '/echo',
      {},
      crypto.randomUUID(),
      AbortSignal.timeout(3000)
    )
  }
  try {
    expect(compatibleResource(bindings[0].bundle, 'engine', resources.config, 'gateway')).toBe(true)
    const first = await invoke('first')
    expect(first).toMatchObject({
      status: 'done',
      result: { value: { result: { models: [{ id: 'shared-model' }] } } }
    })
    expect(JSON.stringify(first)).not.toContain('TEST_ONLY_RESOURCE_CREDENTIAL')
    expect(JSON.stringify(first)).not.toContain('127.0.0.1')
    resources.config.plugins = resources.config.plugins.filter((entry) => {
      return entry.id !== 'first'
    })
    expect(resources.config.providers).toHaveLength(1)
    expect(await invoke('second')).toMatchObject({ status: 'done' })
    expect(calls).toBe(2)
    resources.config.plugins[0].grants = []
    await expect(invoke('second')).rejects.toThrow()
    expect(calls).toBe(2)
  } finally {
    await app.close()
    await worker.close()
    await upstream.stop(true)
  }
})
