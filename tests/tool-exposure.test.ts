import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { z } from 'zod'
import { RoomSchema } from '../src/domain/message'
import { BotConfigSchema } from '../src/config/schema'
import { ProvidersConfigSchema } from '../src/providers/schema'
import { ProviderCatalog } from '../src/providers/catalog'
import { runAgent } from './agent-runtime'
import { agentInput, testFramework, testResources } from './agent-input'
import { responsesReply } from './responses-fixture'
import { assertCapability } from '../src/permissions/authorize'

test('Pi native tool search loads only authorized tools and shared loadouts expire after idle user turns', async () => {
  const root = await mkdtemp('/tmp/pi-tool-exposure-')
  const requested: string[][] = []
  let calls = 0
  let sends = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const body = z
        .object({ tools: z.array(z.object({ name: z.string() })).default([]) })
        .parse(await request.json())
      requested.push(
        body.tools
          .map((tool) => {
            return tool.name
          })
          .sort()
      )
      calls += 1
      if (calls === 1) {
        return responsesReply({
          kind: 'tool',
          name: 'tool_search',
          arguments: { query: 'chat_send', limit: 1 }
        })
      }
      if (calls === 2) {
        return responsesReply({ kind: 'tool', name: 'chat_send', arguments: { text: 'loaded notification' } })
      }
      if (calls === 4) {
        return responsesReply({ kind: 'tool', name: 'chat_send', arguments: { text: 'still in use' } })
      }
      if (calls === 8) {
        return responsesReply({
          kind: 'tool',
          name: 'tool_search',
          arguments: { query: 'chat_send', limit: 1 }
        })
      }
      return responsesReply({ kind: 'text', text: 'done' })
    }
  })
  try {
    const catalog = await ProviderCatalog.create(
      ProvidersConfigSchema.parse({
        defaultGroup: 'main',
        providers: [
          {
            id: 'test',
            baseUrl: `http://127.0.0.1:${server.port}/v1`,
            apiKey: 'test',
            models: [{ id: 'test' }]
          }
        ],
        groups: [{ id: 'main', candidates: [{ provider: 'test', model: 'test' }] }]
      })
    )
    const room = RoomSchema.parse({
      id: 'scope',
      name: 'Scope',
      address: { channel: 'mock', accountId: 'mock-bot', kind: 'group', chatId: 'scope' },
      mode: 'live',
      createdAt: 1,
      updatedAt: 1
    })
    const input = agentInput(room, 'Use an additional notification if needed')
    input.context.effective.settings.resources.toolExposure = 'deferred'
    input.context.effective.settings.resources.idleToolTurns = 1
    async function run() {
      return runAgent(
        {
          bot: BotConfigSchema.parse({}),
          catalog,
          framework: testFramework(),
          resources: testResources(),
          configDir: root,
          dataDir: root,
          projectDir: root
        },
        room,
        input,
        new AbortController().signal,
        {
          authorize(name) {
            assertCapability(input.context.authority, input.context.effective.settings, name)
          },
          history() {
            return []
          },
          async send(text) {
            sends += 1
            return {
              id: 'sent',
              roomId: room.id,
              role: 'assistant',
              actorId: 'bot',
              actorName: 'Pi',
              text,
              attachments: [],
              platformMessageIds: [],
              createdAt: Date.now(),
              recalled: false
            }
          }
        },
        { trace() {}, preview() {}, provider() {}, tool() {} }
      )
    }
    expect(await run()).toBe('done')
    expect(requested[0]).toEqual(['chat_history', 'tool_search'])
    expect(requested[1]).toEqual(['chat_history', 'chat_send', 'tool_search'])
    expect(sends).toBe(1)
    expect(await run()).toBe('done')
    expect(requested[3]).toContain('chat_send')
    expect(await run()).toBe('done')
    expect(requested[5]).toContain('chat_send')
    expect(await run()).toBe('done')
    expect(requested[6]).not.toContain('chat_send')
    input.context.authority.capabilities = ['chat_history', 'tool_search']
    expect(await run()).toBe('done')
    expect(requested.at(-1)).not.toContain('chat_send')
    expect(sends).toBe(2)
    for (const tools of requested) {
      expect(tools).not.toContain('bash')
      expect(tools).not.toContain('codemode')
    }
  } finally {
    await server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
