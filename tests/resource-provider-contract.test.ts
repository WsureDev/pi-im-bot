import { expect, test } from 'bun:test'
import { pluginFixture } from './plugin-fixture'
import { ResourceLibrary } from '../src/resources/library'
import { ResourcesConfigSchema } from '../src/resources/schema'
import { ProvidedResourceSchema } from '../src/resource-providers/definition'
import {
  providedResourceRevision,
  assertResourceContext,
  assertResourceToolExport
} from '../src/resource-providers/context'
import { ResourceHttpRequestSchema, resourceHttpRequest, resourceUrl } from '../src/resource-providers/http'
import { UncertainHostResult } from '../src/plugins/rpc/uncertain'
import { PluginInvocationError } from '../src/plugins/rpc/peer'
import { PluginService } from '../src/plugins/service'
import { ProviderCatalog } from '../src/providers/catalog'
import { ProvidersConfigSchema } from '../src/providers/schema'
import { BotConfigSchema } from '../src/config/schema'
import { RoomSchema } from '../src/domain/message'
import { initialFramework, resolveSettings } from '../src/settings/resolve'
import { captureAuthority, assertCapability } from '../src/permissions/authorize'
import { identityForRoom, localIdentity } from '../src/permissions/identity'
import type { Configuration } from '../src/config/load'
import { agentInput } from './agent-input'
import { Hono } from 'hono'
import { rejectPluginConsoleAccess } from '../src/http/plugin-origin'
import { operationView } from '../src/resource-providers/presentation'
import { PluginOperationSchema } from '../src/plugins/manifest'

test('complex operation parameters remain JSON-editable and primitive defaults respect the declaration', () => {
  const complex = PluginOperationSchema.parse({
    id: 'complex',
    title: 'Complex',
    description: '',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }
    }
  })
  expect(operationView(complex, 'release').inputUiSchema).toEqual({})
  const simple = PluginOperationSchema.parse({
    id: 'simple',
    title: 'Simple',
    description: '',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 2 },
        mode: { type: 'string', enum: ['first', 'second'] }
      },
      required: ['limit']
    }
  })
  const view = operationView(simple, 'release')
  expect(view.example).toEqual({ limit: 2, mode: 'first' })
  expect(view.inputUiSchema.limit.required).toBe(true)
})

test('legacy plugin-owned resource contexts remain versioned while independent resources replace their directory', async () => {
  const fixture = await pluginFixture()
  try {
    const binding = await fixture.register(
      'adapter',
      'export default { operations: { echo(){return {text:"ok"}} } }',
      {
        resourceProvider: {
          apiVersion: 1,
          title: 'Ordinary API',
          discover: 'echo',
          resourceSchema: { key: { type: 'string', secret: true, default: '' } }
        }
      }
    )
    binding.instance.settings = { token: 'PRIVATE_CONNECTION_FIXTURE' }
    const resource = ProvidedResourceSchema.parse({
      id: 'adapter:remote',
      providerId: 'adapter',
      externalId: 'remote',
      name: 'Remote API',
      operationIds: ['echo'],
      enabled: true,
      state: 'ready',
      configuration: { key: 'PRIVATE_RESOURCE_FIXTURE' },
      discoveredAt: 1
    })
    const library = new ResourceLibrary(
      ResourcesConfigSchema.parse({ plugins: [binding.instance], provided: [resource] }),
      [],
      [],
      [binding.bundle]
    )
    expect(() => assertResourceToolExport({ resources: library }, 'plugin:adapter/echo')).toThrow(
      '未声明为模型入口'
    )
    const context = { resourceId: resource.id, resourceRevision: providedResourceRevision(resource) }
    expect(() => assertResourceContext({ resources: library }, context)).not.toThrow()
    library.config.provided[0].name = 'new display name'
    library.config.provided[0].discoveredAt = 2
    expect(() => assertResourceContext({ resources: library }, context)).not.toThrow()
    library.config.provided[0].configuration.key = 'rotated'
    expect(() => assertResourceContext({ resources: library }, context)).toThrow('资源配置已变化')
    library.config.plugins[0].enabled = false
    expect(() => assertResourceContext({ resources: library }, context)).toThrow()
    expect(ProvidedResourceSchema.safeParse({ ...resource, id: 'other:remote' }).success).toBe(false)
  } finally {
    await fixture.close()
  }
})

test('HTTP transport uses configured origin, bounded responses and no redirect credential forwarding', async () => {
  let calls = 0
  let credential = ''
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      calls += 1
      credential = request.headers.get('authorization') ?? ''
      if (new URL(request.url).pathname.endsWith('redirect')) {
        return new Response('', { status: 302, headers: { location: 'http://example.invalid/steal' } })
      }
      if (new URL(request.url).pathname.endsWith('bad')) {
        return new Response('invalid', { headers: { 'content-type': 'application/json' } })
      }
      return Response.json({ answer: 42 })
    }
  })
  try {
    const metadata = { baseUrlField: 'endpoint', headersField: 'headers' }
    const configuration = {
      endpoint: `http://127.0.0.1:${server.port}/api/`,
      headers: { authorization: 'TEST_ONLY_HEADER' }
    }
    const result = await resourceHttpRequest(
      metadata,
      configuration,
      ResourceHttpRequestSchema.parse({ path: 'lookup' }),
      new AbortController().signal
    )
    expect(result.body).toEqual({ answer: 42 })
    expect(credential).toBe('TEST_ONLY_HEADER')
    expect(() => resourceUrl(configuration.endpoint, '../../outside')).toThrow()
    expect(() => resourceUrl(configuration.endpoint, 'http://example.invalid/steal')).toThrow()
    const redirect = await resourceHttpRequest(
      metadata,
      configuration,
      ResourceHttpRequestSchema.parse({ path: 'redirect' }),
      new AbortController().signal
    )
    expect(redirect.status).toBe(302)
    expect(calls).toBe(2)
    await expect(
      resourceHttpRequest(
        metadata,
        configuration,
        ResourceHttpRequestSchema.parse({ path: 'bad', method: 'POST', body: { example: true } }),
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(UncertainHostResult)
    expect(calls).toBe(3)
  } finally {
    await server.stop(true)
  }
})

test('plugin HTTP transport cannot access the Bot management API even with spoofed marker headers', async () => {
  const app = new Hono()
  app.use('/api/*', rejectPluginConsoleAccess)
  app.get('/api/private', (c) => c.json({ secret: 'not-for-plugins' }))
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch })
  try {
    const result = await resourceHttpRequest(
      { baseUrlField: 'endpoint' },
      { endpoint: `http://127.0.0.1:${server.port}/api/` },
      ResourceHttpRequestSchema.parse({ path: 'private', headers: { 'x-pi-plugin-request': '' } }),
      new AbortController().signal
    )
    expect(result.status).toBe(403)
    expect(JSON.stringify(result)).not.toContain('not-for-plugins')
    expect((await app.request('/api/private')).status).toBe(200)
  } finally {
    await server.stop(true)
  }
})

test('uncertain host results remain uncertain through the isolated worker protocol', async () => {
  const fixture = await pluginFixture()
  try {
    const binding = await fixture.register(
      'uncertain',
      'export default { operations: { async echo(input,context){return {value:await context.host("call",{})}} } }'
    )
    const result = fixture.manager.invoke(
      binding,
      { kind: 'operation', handler: 'echo', phase: 'execute' },
      fixture.context(binding),
      {},
      new AbortController().signal,
      async () => {
        throw new UncertainHostResult('结果未确认')
      }
    )
    try {
      await result
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(PluginInvocationError)
      if (error instanceof PluginInvocationError) {
        expect(error.failure.code).toBe('unknown')
      }
    }
  } finally {
    await fixture.close()
  }
})

test('a resource operation executes through the isolated RPC host using only its configured HTTP connection', async () => {
  const fixture = await pluginFixture()
  let calls = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      calls += 1
      expect(request.headers.get('authorization')).toBe('TEST_ONLY_CONNECTION')
      return Response.json({ ok: true })
    }
  })
  try {
    const binding = await fixture.register(
      'httpapi',
      `export default {operations:{async echo(input,context){const response=await context.host('resource.http',{path:'record'});return {value:{body:response.body,externalId:context.invocation.resource.externalId,roles:context.invocation.actors[0].roles}}}}}`,
      {
        resourceProvider: { apiVersion: 1, http: { baseUrlField: 'endpoint', headersField: 'headers' } },
        operations: [
          {
            id: 'echo',
            title: 'API',
            description: 'API',
            inputSchema: { type: 'object' },
            grants: ['resource.http']
          }
        ]
      }
    )
    binding.instance.grants = ['resource.http']
    binding.instance.settings = {
      endpoint: `http://127.0.0.1:${server.port}/api/`,
      headers: { authorization: 'TEST_ONLY_CONNECTION' }
    }
    const resource = ProvidedResourceSchema.parse({
      id: 'httpapi:remote',
      providerId: 'httpapi',
      externalId: 'remote',
      name: 'Remote',
      operationIds: ['echo'],
      enabled: true,
      state: 'ready',
      configuration: {},
      discoveredAt: 1
    })
    const library = new ResourceLibrary(
      ResourcesConfigSchema.parse({ plugins: [binding.instance], provided: [resource] }),
      [],
      [],
      [binding.bundle]
    )
    const bot = BotConfigSchema.parse({ plugins: fixture.manager.config })
    const config: Configuration = {
      bot,
      resources: library,
      framework: initialFramework(bot, 'main'),
      catalog: await ProviderCatalog.create(
        ProvidersConfigSchema.parse(
          await Bun.file(new URL('../config/providers.example.json', import.meta.url)).json()
        ),
        fixture.root
      ),
      projectDir: fixture.root,
      dataDir: fixture.root,
      configDir: fixture.root
    }
    const room = RoomSchema.parse({
      id: 'test-room',
      name: 'Test',
      mode: 'live',
      address: { channel: 'mock', accountId: 'mock', kind: 'group', chatId: 'test-room' },
      createdAt: 1,
      updatedAt: 1
    })
    const input = agentInput(room, 'resource invocation')
    const effective = resolveSettings(config.framework, room.address, {})
    const identity = identityForRoom(localIdentity('web', 'operator'), room.address)
    input.context = {
      ...input.context,
      effective,
      authority: captureAuthority(
        effective,
        [identity],
        undefined,
        library.capabilityIds(effective.settings)
      ),
      resourceId: resource.id,
      resourceRevision: providedResourceRevision(resource)
    }
    const invocation = {
      config,
      room,
      input,
      services: {
        authorize(capability: string) {
          assertResourceContext(config, input.context)
          assertCapability(input.context.authority, effective.settings, capability)
        },
        history() {
          return []
        },
        async send() {
          throw new Error('unexpected send')
        }
      }
    }
    const service = new PluginService(() => {
      return config
    }, fixture.manager)
    const result = await service.execute(
      invocation,
      'plugin:httpapi/echo',
      {},
      'resource-call',
      new AbortController().signal
    )
    expect(result).toMatchObject({
      status: 'done',
      result: { value: { body: { ok: true }, externalId: 'remote', roles: ['everyone', 'bot_admin'] } }
    })
    expect(calls).toBe(1)
    library.config.plugins[0].grants = []
    await expect(
      service.execute(invocation, 'plugin:httpapi/echo', {}, 'revoked-call', new AbortController().signal)
    ).rejects.toThrow()
    expect(calls).toBe(1)
  } finally {
    await server.stop(true)
    await fixture.close()
  }
})
