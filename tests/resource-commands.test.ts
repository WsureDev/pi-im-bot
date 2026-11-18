import { expect, test } from 'bun:test'
import { ResourceCommandSchema } from '../src/resource-providers/commands/schema'
import { commandParameters } from '../src/resource-providers/commands/parameters'
import { validateResourceCommands } from '../src/resource-providers/commands/catalog'
import { ResourcesConfigSchema } from '../src/resources/schema'
import { ResourceLibrary } from '../src/resources/library'
import { jobHarness } from './job-harness'
import { mcpFixture } from './mcp-fixture'
import { inspectMcp } from '../src/resources/mcp/client'
import { CapabilityAccessSchema } from '../src/permissions/capability-policy'

test('stopping a resource command cancels local waiting and prevents a late reply', async () => {
  const started = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      started.resolve()
      await Bun.sleep(150)
      return Response.json({ models: [{ id: 'DO_NOT_DELIVER_AFTER_STOP' }] })
    }
  })
  const config = ResourcesConfigSchema.parse({
    providers: [
      {
        id: 'gateway',
        name: 'Gateway',
        provider: 'comfy-gateway',
        enabled: true,
        configuration: { endpoint: 'http://127.0.0.1:' + server.port, headers: '{}' }
      }
    ],
    resourceCommands: [
      {
        id: 'models',
        name: 'models',
        description: 'Models',
        enabled: true,
        target: { kind: 'resource', resourceId: 'gateway', protocol: 'pi.comfy-gateway@1', method: 'models' }
      }
    ]
  })
  const app = await jobHarness(
    () => {
      throw new Error('Unexpected LLM')
    },
    new ResourceLibrary(config, [])
  )
  try {
    const pending = app.coordinator.receive(app.room.id, '/models')
    await started.promise
    app.coordinator.stop(app.room.id)
    await pending
    expect(
      app.store.listMessages(app.room.id, 20).filter((entry) => {
        return entry.role !== 'user'
      })
    ).toHaveLength(0)
    expect(app.requests).toHaveLength(0)
  } finally {
    await app.close()
    await server.stop(true)
  }
})

test('text mapping modifies only its selected leaf and JSON callers cannot replace fixed workflow parameters', () => {
  const command = ResourceCommandSchema.parse({
    id: 'draw',
    name: 'draw',
    description: 'Draw',
    target: { kind: 'resource', resourceId: 'gateway', protocol: 'pi.comfy-gateway@1', method: 'submit' },
    arguments: 'text',
    textPath: '/prompt/6/inputs/text',
    fixed: { prompt: { '6': { class_type: 'Text', inputs: { text: '', seed: 7 } } } }
  })
  expect(commandParameters(command, 'a cat')).toEqual({
    prompt: { '6': { class_type: 'Text', inputs: { text: 'a cat', seed: 7 } } }
  })
  expect(
    commandParameters({ ...command, arguments: 'json' }, '{"prompt":{"6":{"inputs":{"seed":999}}}}')
  ).toEqual(command.fixed)
  expect(commandParameters({ ...command, textPath: '/count', textType: 'number', fixed: {} }, '3')).toEqual({
    count: 3
  })
  expect(() => commandParameters({ ...command, textPath: '/__proto__/unsafe' }, 'x')).toThrow('保留')
  const config = ResourcesConfigSchema.parse({ resourceCommands: [{ ...command, name: 'help' }] })
  expect(() => validateResourceCommands(config, ResourceLibrary.empty())).toThrow('冲突')
})

test('resource commands execute with no plugins or model calls, and direct permissions remain independent of Tool exposure', async () => {
  let calls = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      calls += 1
      return Response.json({ models: [{ id: 'fixture-model' }] })
    }
  })
  const config = ResourcesConfigSchema.parse({
    providers: [
      {
        id: 'gateway',
        name: 'Gateway',
        provider: 'comfy-gateway',
        enabled: true,
        configuration: { endpoint: 'http://127.0.0.1:' + server.port, headers: '{}' }
      }
    ],
    resourceCommands: [
      {
        id: 'models',
        name: 'models',
        description: 'Models',
        enabled: true,
        target: { kind: 'resource', resourceId: 'gateway', protocol: 'pi.comfy-gateway@1', method: 'models' }
      }
    ]
  })
  const app = await jobHarness(
    () => {
      throw new Error('Direct commands must not invoke an LLM')
    },
    new ResourceLibrary(config, [])
  )
  try {
    expect(app.coordinator.plugins).toBeUndefined()
    app.config.framework.defaults.permissions.capabilityPolicies = {
      'resource:gateway/pi.comfy-gateway@1/models': CapabilityAccessSchema.parse({
        enabled: true,
        toolEnabled: false,
        commandEnabled: true,
        group: { enabled: true, roles: ['everyone'] },
        direct: { enabled: true, roles: ['everyone'] }
      })
    }
    expect(await app.coordinator.receive(app.room.id, '/models')).toBeNull()
    expect(calls).toBe(1)
    expect(app.requests).toHaveLength(0)
    expect(
      app.store.listMessages(app.room.id, 20).some((entry) => {
        return entry.text.includes('fixture-model')
      })
    ).toBe(true)
    app.config.framework.defaults.permissions.rules = [
      { subjects: [{ kind: 'everyone' }], capabilities: ['command:resource:models'], effect: 'deny' }
    ]
    await app.coordinator.receive(app.room.id, '/models')
    expect(calls).toBe(1)
  } finally {
    await app.close()
    await server.stop(true)
  }
})

test('an existing MCP tool can become a direct command without pretending to implement a domain protocol', async () => {
  const upstream = mcpFixture({ content: [{ type: 'text', text: 'MCP_DIRECT_RESULT' }] })
  const manifest = await inspectMcp(upstream.config, AbortSignal.timeout(2000))
  const config = ResourcesConfigSchema.parse({
    mcp: [upstream.config],
    resourceCommands: [
      {
        id: 'report',
        name: 'report',
        description: 'Report',
        enabled: true,
        target: { kind: 'mcp', serverId: upstream.config.id, tool: 'long-result' },
        arguments: 'text',
        textPath: '/query'
      }
    ]
  })
  const app = await jobHarness(
    () => {
      throw new Error('Unexpected LLM call')
    },
    new ResourceLibrary(config, [manifest])
  )
  try {
    await app.coordinator.receive(app.room.id, '/report test')
    expect(upstream.state.calls).toBe(1)
    expect(app.requests).toHaveLength(0)
    expect(
      app.store.listMessages(app.room.id, 20).some((entry) => {
        return entry.text.includes('MCP_DIRECT_RESULT')
      })
    ).toBe(true)
  } finally {
    await app.close()
    await upstream.server.stop(true)
  }
})
