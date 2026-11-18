import { expect, test } from 'bun:test'
import { ResourcesConfigSchema } from '../src/resources/schema'
import { ResourceProtocolSchema, ProviderDefinitionSchema } from '../src/resource-providers/protocol'
import { callResource } from '../src/resource-providers/service'
import { resourceDefinitions } from '../src/resource-providers/registry'
import { connectionDefinition } from '../src/resource-providers/protocols/configuration'
import { mcpFixture } from './mcp-fixture'
import { UncertainHostResult } from '../src/plugins/rpc/uncertain'

function invocation() {
  return { requestId: 'test-only-request', signal: AbortSignal.timeout(3000), authorize() {} }
}
test('a custom protocol and two implementations work without any plugins or core business enum', async () => {
  const protocol = ResourceProtocolSchema.parse({
    id: 'example.search@1',
    title: 'Search',
    description: 'Returns hits for a query',
    methods: [
      {
        id: 'search',
        title: 'Search',
        description: 'Literal search',
        effect: 'read',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          properties: { hits: { type: 'array', items: { type: 'string' } } },
          required: ['hits']
        }
      }
    ]
  })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      expect(request.headers.get('x-pi-plugin-request')).toBe('resource')
      const value = { hits: [url.pathname + ':' + url.searchParams.get('q')] }
      if (url.pathname === '/second') {
        return Response.json({ data: value })
      }
      return Response.json(value)
    }
  })
  try {
    const config = ResourcesConfigSchema.parse({
      resourceProtocols: [protocol],
      providerDefinitions: ['first', 'second'].map((id) => {
        return ProviderDefinitionSchema.parse({
          id,
          title: id,
          description: '',
          configuration: connectionDefinition('http://localhost'),
          mappings: [
            {
              protocol: protocol.id,
              method: 'search',
              transport: { kind: 'http', method: 'GET', path: '/' + id, query: { q: 'query' } }
            }
          ]
        })
      }),
      providers: ['first', 'second'].map((provider) => {
        return {
          id: provider,
          provider,
          name: provider,
          enabled: true,
          configuration: { endpoint: 'http://127.0.0.1:' + server.port, headers: '{}' }
        }
      })
    })
    const second = config.providerDefinitions[1].mappings[0]
    second.inputMapping = { '/keyword': '/query' }
    second.outputPath = '/data'
    if (second.transport.kind === 'http') {
      second.transport.method = 'POST'
      second.transport.query = { q: 'keyword' }
    }
    expect(config.plugins).toHaveLength(0)
    expect(
      resourceDefinitions(config).protocols.some((entry) => {
        return entry.id === protocol.id
      })
    ).toBe(true)
    for (const resourceId of ['first', 'second']) {
      const result = await callResource(
        () => config,
        { resourceId, protocol: protocol.id, method: 'search', parameters: { query: 'cats' } },
        invocation()
      )
      expect(result.value).toEqual({ hits: ['/' + resourceId + ':cats'] })
    }
    await expect(
      callResource(
        () => config,
        { resourceId: 'first', protocol: protocol.id, method: 'search', parameters: { query: 2 } },
        invocation()
      )
    ).rejects.toThrow('参数')
    config.providers[0].enabled = false
    await expect(
      callResource(
        () => config,
        { resourceId: 'first', protocol: protocol.id, method: 'search', parameters: { query: 'cats' } },
        invocation()
      )
    ).rejects.toThrow('未启用')
  } finally {
    await server.stop(true)
  }
})

test('x-image MCP adaptation preserves count, cursor and structured output and rejects schema drift', async () => {
  const upstream = mcpFixture({
    content: [{ type: 'text', text: 'display only' }],
    structuredContent: { maxPick: 3, matchedTotal: 0, returned: 0, nextCursor: null, items: [] }
  })
  upstream.state.tools = [
    {
      name: 'pick_images',
      inputSchema: { type: 'object', properties: { count: { type: 'integer' }, cursor: { type: 'string' } } },
      annotations: { readOnlyHint: true }
    }
  ]
  const config = ResourcesConfigSchema.parse({
    providers: [
      {
        id: 'gallery',
        name: 'Gallery',
        provider: 'x-image',
        enabled: true,
        configuration: { endpoint: 'http://127.0.0.1:' + upstream.server.port + '/mcp', headers: '{}' }
      }
    ]
  })
  const call = {
    resourceId: 'gallery',
    protocol: 'pi.image-library@1',
    method: 'pick',
    parameters: { count: 4, cursor: 'existing-cursor' }
  }
  try {
    expect((await callResource(() => config, call, invocation())).value).toEqual({
      maxPick: 3,
      matchedTotal: 0,
      returned: 0,
      nextCursor: null,
      items: []
    })
    expect(upstream.state.calls).toBe(1)
    upstream.state.tools[0].annotations = { readOnlyHint: false }
    await expect(callResource(() => config, call, invocation())).rejects.toThrow('调用失败')
    expect(upstream.state.calls).toBe(1)
  } finally {
    await upstream.server.stop(true)
  }
})

test('gateway submit uses its idempotency header, validates before dispatch and never retries unknown outcomes', async () => {
  let calls = 0
  let fail = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      calls += 1
      expect(new URL(request.url).pathname).toBe('/prompt')
      expect(request.headers.get('X-Idempotency-Key')).toBe('test-only-request')
      expect(await request.json()).toMatchObject({ prompt: {} })
      if (fail) {
        return new Response('outcome unconfirmed', { status: 502 })
      }
      return Response.json({ prompt_id: 'original-job', number: 1, node_errors: {} })
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
    ]
  })
  const call = {
    resourceId: 'gateway',
    protocol: 'pi.comfy-gateway@1',
    method: 'submit',
    parameters: { prompt: {} }
  }
  try {
    await expect(callResource(() => config, call, { ...invocation(), readOnly: true })).rejects.toThrow(
      '只读'
    )
    expect(calls).toBe(0)
    expect((await callResource(() => config, call, invocation())).value).toMatchObject({
      prompt_id: 'original-job'
    })
    fail = true
    await expect(callResource(() => config, call, invocation())).rejects.toBeInstanceOf(UncertainHostResult)
    expect(calls).toBe(2)
  } finally {
    await server.stop(true)
  }
})

test('configuration changes during a request suppress its result and redirects cannot forward credentials', async () => {
  let changeConfiguration = () => {}
  let redirectedCalls = 0
  const other = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      redirectedCalls += 1
      return Response.json({ models: [] })
    }
  })
  let redirect = false
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      if (redirect) {
        return Response.redirect('http://127.0.0.1:' + other.port)
      }
      changeConfiguration()
      return Response.json({ models: [] })
    }
  })
  const config = ResourcesConfigSchema.parse({
    providers: [
      {
        id: 'gateway',
        name: 'Gateway',
        provider: 'comfy-gateway',
        enabled: true,
        configuration: {
          endpoint: 'http://127.0.0.1:' + server.port,
          headers: '{"Authorization":"TEST_ONLY_PRIVATE"}'
        }
      }
    ]
  })
  const call = { resourceId: 'gateway', protocol: 'pi.comfy-gateway@1', method: 'models', parameters: {} }
  changeConfiguration = () => {
    config.providers[0].configuration.headers = '{}'
  }
  try {
    await expect(callResource(() => config, call, invocation())).rejects.toThrow('配置已变化')
    redirect = true
    await expect(callResource(() => config, call, invocation())).rejects.toThrow('调用失败')
    expect(redirectedCalls).toBe(0)
  } finally {
    await server.stop(true)
    await other.stop(true)
  }
})
