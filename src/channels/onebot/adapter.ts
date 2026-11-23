import { actionRequest, actionResult, type OneBotAction, type ActionParams } from './actions'
import { z } from 'zod'
import type { ChannelAdapter } from '../../domain/channel'
import {
  PartialDelivery,
  type ChannelMedia,
  type SendControl,
  type ChannelMessagePart
} from '../../domain/channel-media'
import type { Address, IncomingMessage, InboundOutcome } from '../../domain/message'
import type { EventHub } from '../../runtime/events'
import { OneBotMessageSchema, OneBotResponseSchema } from './protocol'
import { parseOneBotContent } from './content'
import { readOneBotMedia } from './media'
import { fetchedMessage } from './history'
import { parseRecall } from './recall'
import type { IncomingMedia } from '../../media/schema'
import { BACKGROUND_CONTEXT, awaitWithContext, withAbortSignal } from '@earendil-works/chord/context'
import { oneBotAllowed, type OneBotConfig } from './config'
import { authorizeOneBot, tokenRevision } from './auth'
import type { DiscoveredChat, OneBotStatus, RouteReason } from './status'

export interface OneBotSocket {
  send(data: string): number
  close(code?: number, reason?: string): void
}
interface PendingAction {
  selfId: string
  resolve(value: unknown): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}
export class OneBotAdapter implements ChannelAdapter {
  readonly id = 'onebot-v11'
  readonly capabilities = {
    forward: true,
    text: true,
    images: true,
    audio: true,
    files: false,
    edit: false,
    recall: true,
    threads: false
  }
  private readonly sockets = new Map<string, OneBotSocket>()
  private readonly pending = new Map<string, PendingAction>()
  private readonly chats = new Map<string, DiscoveredChat>()
  private readonly seenMessages = new Map<string, number>()
  private received = 0
  private recorded = 0
  private lastReceivedAt: number | null = null
  private lastAuthFailure: OneBotStatus['lastAuthFailure'] = null
  private readonly recent: OneBotStatus['recent'] = []

  constructor(
    private readonly config: () => OneBotConfig,
    private readonly events: EventHub,
    private readonly receive: (message: IncomingMessage) => Promise<InboundOutcome>,
    private readonly recalled?: (address: Address, platformId: string) => void
  ) {}

  authorize(request: Request) {
    const result = authorizeOneBot(request, this.config())
    if (!result.ok) {
      this.lastAuthFailure = { at: Date.now(), reason: result.reason }
      this.publish()
    }
    return result
  }

  connect(selfId: string, socket: OneBotSocket, revision: string) {
    if (!this.config().enabled || revision !== tokenRevision(this.config().accessToken)) {
      socket.close(1008, 'Authentication configuration changed')
      return
    }
    const previous = this.sockets.get(selfId)
    if (previous) {
      this.disconnect(selfId, previous)
      previous.close(1012, 'Replaced by a new connection')
    }
    this.sockets.set(selfId, socket)
    this.publish()
  }

  disconnect(selfId: string, socket: OneBotSocket) {
    if (this.sockets.get(selfId) !== socket) {
      return
    }
    this.sockets.delete(selfId)
    for (const [echo, pending] of this.pending) {
      if (pending.selfId === selfId) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('OneBot connection closed; action outcome may be unknown'))
        this.pending.delete(echo)
      }
    }
    this.publish()
  }

  async message(selfId: string, raw: string, socket: OneBotSocket) {
    if (this.sockets.get(selfId) !== socket) {
      return
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      this.route(selfId, 'invalid')
      return
    }
    const response = OneBotResponseSchema.safeParse(value)
    if (response.success) {
      const pending = this.pending.get(response.data.echo)
      if (!pending || pending.selfId !== selfId) {
        return
      }
      clearTimeout(pending.timeout)
      this.pending.delete(response.data.echo)
      if (response.data.retcode === 0 && response.data.status !== 'failed') {
        pending.resolve(response.data.data)
      } else {
        pending.reject(
          new Error(
            `OneBot ${response.data.retcode}: ${response.data.message ?? response.data.wording ?? 'action failed'}`
          )
        )
      }
      return
    }
    const recall = parseRecall(value, selfId)
    if (recall) {
      if (oneBotAllowed(this.config(), recall.address)) {
        this.recalled?.(recall.address, recall.messageId)
      }
      return
    }
    const result = OneBotMessageSchema.safeParse(value)
    if (!result.success) {
      const event = z.object({ post_type: z.enum(['meta_event', 'notice', 'request']) }).safeParse(value)
      if (!event.success) {
        this.route(selfId, 'invalid')
      }
      return
    }
    if (result.data.self_id !== selfId) {
      this.route(selfId, 'invalid')
      return
    }
    const event = result.data
    this.received += 1
    this.lastReceivedAt = Date.now()
    let kind: Address['kind'] = 'direct'
    let chatId = event.user_id
    if (event.message_type === 'group') {
      if (!event.group_id) {
        return
      }
      kind = 'group'
      chatId = event.group_id
    }
    const key = `${selfId}:${kind}:${chatId}`
    const chat: DiscoveredChat = {
      selfId,
      kind,
      chatId,
      name: event.group_name ?? this.chats.get(key)?.name ?? chatId,
      seenAt: Date.now()
    }
    this.chats.set(key, chat)
    if (this.chats.size > 200) {
      this.chats.delete(this.chats.keys().next().value ?? '')
    }
    const config = this.config()
    const address: Address = { channel: this.id, accountId: selfId, kind, chatId }
    if (!config.enabled) {
      this.route(selfId, 'disabled', chatId)
      return
    }
    if (!oneBotAllowed(config, address)) {
      this.route(selfId, 'not_selected', chatId)
      return
    }
    const dedupeKey = `${key}:${event.message_id}`
    if (this.seenMessages.has(dedupeKey)) {
      this.route(selfId, 'duplicate', chatId)
      return
    }
    this.seenMessages.set(dedupeKey, Date.now())
    for (const [id, at] of this.seenMessages) {
      if (Date.now() - at > 600000) {
        this.seenMessages.delete(id)
      }
    }
    if (this.seenMessages.size > 10000) {
      this.seenMessages.delete(this.seenMessages.keys().next().value ?? '')
    }
    try {
      const outcome = await this.receive({
        address,
        externalId: event.message_id,
        actorId: event.user_id,
        platformRole: event.sender.role,
        actorName: event.sender.card || event.sender.nickname || event.user_id,
        ...parseOneBotContent(event.message),
        receivedAt: (event.time ?? Date.now() / 1000) * 1000,
        isSelf: event.user_id === selfId || event.post_type === 'message_sent'
      })
      if (['recorded', 'command', 'agent', 'self'].includes(outcome)) {
        this.recorded += 1
      }
      this.route(selfId, outcome, chatId)
    } catch (error) {
      this.seenMessages.delete(dedupeKey)
      this.route(selfId, 'error', chatId)
      throw error
    }
  }

  private async request<A extends OneBotAction>(address: Address, action: A, params: ActionParams<A>) {
    const socket = this.sockets.get(address.accountId)
    if (!socket) {
      return Promise.reject(new Error('NapCat 尚未连接'))
    }
    const echo = crypto.randomUUID()
    const request = actionRequest(action, params, echo)
    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(echo)
        reject(new Error('OneBot action timed out; delivery may have happened and is not retried'))
      }, 15000)
      this.pending.set(echo, { selfId: address.accountId, resolve, reject, timeout })
      try {
        socket.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(echo)
        reject(error)
      }
    })
    return actionResult(action, result)
  }

  async send(address: Address, text: string, media: readonly ChannelMedia[] = [], control?: SendControl) {
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('该机器人账号下的 QQ 会话未启用测试')
    }
    if (
      media.some((item) => {
        return item.kind !== 'image' && item.kind !== 'audio'
      })
    ) {
      throw new Error('此 QQ 适配暂不直接发送这种媒体')
    }
    const packets: Array<Array<{ type: string; data: Record<string, string> }>> = []
    const first: Array<{ type: string; data: Record<string, string> }> = []
    if (text) {
      first.push({ type: 'text', data: { text } })
    }
    for (const item of media) {
      if (item.kind === 'image') {
        first.push({ type: 'image', data: { file: 'base64://' + Buffer.from(item.data).toString('base64') } })
      }
    }
    if (first.length > 0) {
      packets.push(first)
    }
    for (const item of media) {
      if (item.kind === 'audio') {
        packets.push([
          { type: 'record', data: { file: 'base64://' + Buffer.from(item.data).toString('base64') } }
        ])
      }
    }
    const messageIds: string[] = []
    let sentAt = Date.now()
    try {
      for (const message of packets) {
        await control?.beforePart?.()
        if (!oneBotAllowed(this.config(), address)) {
          throw new Error('该 QQ 会话已停用')
        }
        let action: 'send_private_msg' | 'send_group_msg' = 'send_private_msg'
        let params: ActionParams<'send_private_msg' | 'send_group_msg'> = { user_id: address.chatId, message }
        if (address.kind === 'group') {
          action = 'send_group_msg'
          params = { group_id: address.chatId, message }
        }
        const result = await this.request(address, action, params)
        if (messageIds.length === 0) {
          sentAt = Date.now()
        }
        messageIds.push(result.message_id)
        await control?.received?.([...messageIds], sentAt)
      }
    } catch (error) {
      if (messageIds.length > 0) {
        throw new PartialDelivery(messageIds, sentAt, error)
      }
      throw error
    }
    return { messageIds, sentAt }
  }

  async sendForward(
    address: Address,
    text: string,
    media: readonly ChannelMedia[],
    control?: SendControl,
    parts?: readonly ChannelMessagePart[]
  ) {
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('当前QQ目标已停用')
    }
    if (
      media.some((file) => {
        return file.kind !== 'image'
      })
    ) {
      throw new Error('合并转发仅接受已校验图片')
    }
    const messages: Array<{
      type: string
      data: { uin: string; name: string; content: Array<{ type: string; data: Record<string, string> }> }
    }> = []
    if (parts) {
      for (const part of parts) {
        const content: Array<{ type: string; data: Record<string, string> }> = []
        if (part.text) {
          content.push({ type: 'text', data: { text: part.text } })
        }
        for (const file of part.media) {
          if (file.kind !== 'image') {
            throw new Error('合并转发仅接受已校验图片')
          }
          content.push({
            type: 'image',
            data: { file: 'base64://' + Buffer.from(file.data).toString('base64') }
          })
        }
        if (content.length) {
          messages.push({ type: 'node', data: { uin: address.accountId, name: 'Pi', content } })
        }
      }
    } else {
      if (text) {
        messages.push({
          type: 'node',
          data: { uin: address.accountId, name: 'Pi', content: [{ type: 'text', data: { text } }] }
        })
      }
      for (const file of media) {
        messages.push({
          type: 'node',
          data: {
            uin: address.accountId,
            name: 'Pi',
            content: [
              { type: 'image', data: { file: 'base64://' + Buffer.from(file.data).toString('base64') } }
            ]
          }
        })
      }
    }
    await control?.beforePart?.()
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('当前QQ目标已停用')
    }
    let action: 'send_private_forward_msg' | 'send_group_forward_msg' = 'send_private_forward_msg'
    let params: ActionParams<'send_private_forward_msg' | 'send_group_forward_msg'> = {
      user_id: address.chatId,
      messages
    }
    if (address.kind === 'group') {
      action = 'send_group_forward_msg'
      params = { group_id: address.chatId, messages }
    }
    const result = await this.request(address, action, params)
    const receipt = { messageIds: [result.message_id], sentAt: Date.now() }
    await control?.received?.(receipt.messageIds, receipt.sentAt)
    return receipt
  }
  async identity(address: Address, signal: AbortSignal) {
    const result = await awaitWithContext(
      this.request(address, 'get_login_info', {}),
      withAbortSignal(signal, BACKGROUND_CONTEXT)
    )
    return result.nickname
  }

  async recall(address: Address, messageId: string) {
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('该 QQ 会话已停用')
    }
    await this.request(address, 'delete_msg', { message_id: messageId })
  }
  async readMedia(address: Address, media: IncomingMedia, signal: AbortSignal) {
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('此 QQ 会话已停用')
    }
    return readOneBotMedia(media, this.config().mediaOrigins, signal, async (id) => {
      if (/[\\/\0]/u.test(id)) {
        throw new Error('平台图片标识无效')
      }
      return awaitWithContext(
        this.request(address, 'get_image', { file: id }),
        withAbortSignal(signal, BACKGROUND_CONTEXT)
      )
    })
  }
  async lookupMessage(address: Address, id: string, signal: AbortSignal) {
    if (!oneBotAllowed(this.config(), address)) {
      throw new Error('此 QQ 会话已停用')
    }
    if (!/^-?\d{1,20}$/u.test(id)) {
      throw new Error('平台消息 ID 无效')
    }
    const result = await awaitWithContext(
      this.request(address, 'get_msg', { message_id: id }),
      withAbortSignal(signal, BACKGROUND_CONTEXT)
    )
    return fetchedMessage(address, id, result)
  }
  async refreshGroups(selfId: string) {
    const groups = await this.request(
      { channel: this.id, accountId: selfId, kind: 'group', chatId: '' },
      'get_group_list',
      {}
    )
    for (const group of groups) {
      this.chats.set(selfId + ':group:' + group.group_id, {
        selfId,
        chatId: group.group_id,
        name: group.group_name,
        kind: 'group',
        seenAt: Date.now()
      })
    }
    while (this.chats.size > 200) {
      this.chats.delete(this.chats.keys().next().value ?? '')
    }
    this.publish()
    return this.status()
  }

  reconfigure(previous: OneBotConfig) {
    const next = this.config()
    if (!next.enabled || previous.accessToken !== next.accessToken || previous.path !== next.path) {
      for (const [selfId, socket] of this.sockets) {
        this.disconnect(selfId, socket)
        socket.close(1012, 'OneBot settings changed; reconnect')
      }
    }
    this.publish()
  }

  status(): OneBotStatus {
    return {
      connected: this.sockets.size > 0,
      accounts: [...this.sockets.keys()],
      received: this.received,
      recorded: this.recorded,
      lastReceivedAt: this.lastReceivedAt,
      lastAuthFailure: this.lastAuthFailure,
      chats: [...this.chats.values()],
      recent: [...this.recent]
    }
  }
  close() {
    for (const socket of this.sockets.values()) {
      socket.close(1001, 'Server shutdown')
    }
  }
  private route(selfId: string, reason: RouteReason, chatId?: string) {
    this.recent.unshift({ at: Date.now(), selfId, chatId, reason })
    this.recent.splice(20)
    this.publish()
  }
  private publish() {
    this.events.emit({ type: 'onebot_status', status: this.status() })
  }
}
