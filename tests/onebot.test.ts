import { describe, expect, test } from 'bun:test'
import { OneBotAdapter } from '../src/channels/onebot/adapter'
import { extractPrompt } from '../src/runtime/trigger'
import { OneBotConfigSchema } from '../src/channels/onebot/config'
import { authorizeOneBot, tokenRevision } from '../src/channels/onebot/auth'
import { EventHub } from '../src/runtime/events'
import type { IncomingMessage } from '../src/domain/message'
import { nextOccurrence } from '../src/scheduler/service'
import { z } from 'zod'

test('OneBot validates acknowledgements without retrying sends, and preserves exact string IDs', async () => {
  const config = OneBotConfigSchema.parse({
    targets: [{ selfId: '11', chatId: '33', name: 'test', enabled: true }]
  })
  const adapter = new OneBotAdapter(
    () => config,
    new EventHub(),
    async () => 'recorded'
  )
  const address = { channel: 'onebot', accountId: '11', kind: 'group' as const, chatId: '33' }
  let response: { status: string; retcode: number; data: unknown } = {
    status: 'ok',
    retcode: 0,
    data: { message_id: '9223372036854775807' }
  }
  const actions: string[] = []
  const socket = {
    send(raw: string) {
      const request = z.object({ action: z.string(), echo: z.string() }).parse(JSON.parse(raw))
      actions.push(request.action)
      void adapter.message('11', JSON.stringify({ ...response, echo: request.echo }), socket)
      return raw.length
    },
    close() {}
  }
  adapter.connect('11', socket, tokenRevision(''))
  expect((await adapter.send(address, 'first')).messageIds).toEqual(['9223372036854775807'])
  response = { status: 'failed', retcode: 0, data: { message_id: 44 } }
  await expect(adapter.send(address, 'failed')).rejects.toThrow('OneBot')
  response = { status: 'ok', retcode: 0, data: {} }
  await expect(adapter.send(address, 'missing receipt')).rejects.toThrow()
  response = { status: 'ok', retcode: 0, data: { message_id: 9007199254740992 } }
  await expect(adapter.send(address, 'unsafe numeric receipt')).rejects.toThrow()
  response = { status: 'ok', retcode: 0, data: null }
  await adapter.recall(address, '9223372036854775807')
  expect(actions).toEqual([
    'send_group_msg',
    'send_group_msg',
    'send_group_msg',
    'send_group_msg',
    'delete_msg'
  ])
  adapter.disconnect('11', socket)
})

describe('OneBot test-room routing', () => {
  test('discovers an unknown discussion group without invoking the agent', async () => {
    const received: IncomingMessage[] = []
    const config = OneBotConfigSchema.parse({})
    const adapter = new OneBotAdapter(
      () => {
        return config
      },
      new EventHub(),
      async (message) => {
        received.push(message)
        return 'recorded'
      }
    )
    const socket = {
      send() {
        return 0
      },
      close() {}
    }
    adapter.connect('11', socket, tokenRevision(''))
    const event = {
      post_type: 'message',
      message_type: 'group',
      self_id: 11,
      user_id: 22,
      group_id: 33,
      message_id: 44,
      message: [{ type: 'text', data: { text: '!pi hello' } }]
    }
    await adapter.message('11', JSON.stringify(event), socket)
    expect(adapter.status().chats[0].chatId).toBe('33')
    expect(received).toHaveLength(0)
    config.targets.push({ selfId: '11', chatId: '33', name: 'test', enabled: true })
    await adapter.message('11', JSON.stringify(event), socket)
    await adapter.message('11', JSON.stringify(event), socket)
    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('!pi hello')
    await adapter.message('11', JSON.stringify({ ...event, message_id: 45, user_id: 11 }), socket)
    expect(received).toHaveLength(2)
    expect(received[1].isSelf).toBe(true)
    const other = {
      send() {
        return 0
      },
      close() {}
    }
    adapter.connect('99', other, tokenRevision(''))
    await adapter.message('99', JSON.stringify({ ...event, self_id: 99 }), other)
    expect(received).toHaveLength(2)
  })

  test('requires a prefix boundary and does not treat ordinary messages as tasks', () => {
    expect(extractPrompt('hello', '!pi')).toBeNull()
    expect(extractPrompt('!picture', '!pi')).toBeNull()
    expect(extractPrompt('!pi hello', '!pi')).toBe('hello')
    expect(extractPrompt('!pi', '!pi')).toBe('/help')
    expect(extractPrompt('/help', '!pi')).toBe('/help')
    expect(extractPrompt('/status ', '!pi')).toBe('/status')
    expect(extractPrompt('/unrelated', '!pi')).toBeNull()
    expect(extractPrompt('!pi\t任务', '!pi')).toBe('任务')
    expect(extractPrompt('[CQ:reply,id=9][CQ:at,qq=11] /help', '!pi', '11')).toBe('/help')
    expect(extractPrompt('[CQ:at,qq=99] /help', '!pi', '11')).toBeNull()
  })

  test('authenticates optional Bearer tokens and rejects a stale socket after rotation', () => {
    const config = OneBotConfigSchema.parse({ accessToken: 'private-test-token' })
    function handshake(token: string) {
      return new Request('http://localhost/ws', {
        headers: { 'x-self-id': '11', authorization: 'Bearer ' + token }
      })
    }
    expect(authorizeOneBot(handshake('wrong'), config).ok).toBe(false)
    expect(authorizeOneBot(handshake('private-test-token'), config).ok).toBe(true)
    expect(
      authorizeOneBot(
        new Request('http://localhost/ws?access_token=private-test-token', {
          headers: { 'x-self-id': '11' }
        }),
        config
      ).ok
    ).toBe(true)
    expect(
      authorizeOneBot(
        new Request('http://localhost/ws', { headers: { 'x-self-id': '11' } }),
        OneBotConfigSchema.parse({})
      ).ok
    ).toBe(true)
    let closed = 0
    const socket = {
      send() {
        return 0
      },
      close() {
        closed += 1
      }
    }
    const adapter = new OneBotAdapter(
      () => {
        return config
      },
      new EventHub(),
      async () => {
        return 'recorded'
      }
    )
    const auth = adapter.authorize(handshake(config.accessToken))
    if (!auth.ok) {
      throw new Error('Expected valid auth')
    }
    const previous = { ...config }
    config.accessToken = 'rotated-test-token'
    adapter.reconfigure(previous)
    adapter.connect('11', socket, auth.revision)
    expect(closed).toBe(1)
    expect(adapter.status().connected).toBe(false)
    expect(JSON.stringify(adapter.status())).not.toContain('private-test-token')
  })

  test('cron follows the chosen timezone', () => {
    expect(nextOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-11-08T00:00:00Z'))).toBe(
      new Date('2026-11-08T01:00:00Z').getTime()
    )
  })
})
