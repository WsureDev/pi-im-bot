import type { Address, IncomingMessage } from '../../domain/message'
import type { FetchedMessage } from './actions'
import { parseOneBotContent } from './content'

export function fetchedMessage(address: Address, id: string, result: FetchedMessage): IncomingMessage {
  if (result.message_id !== id) {
    throw new Error('平台返回的引用消息 ID 不匹配')
  }
  if (address.kind === 'group') {
    if (result.message_type !== 'group' || result.group_id !== address.chatId) {
      throw new Error('无法确认引用属于当前群')
    }
  } else if (
    result.message_type !== 'private' ||
    (result.sender.user_id !== address.chatId &&
      !(result.sender.user_id === address.accountId && result.target_id === address.chatId))
  ) {
    throw new Error('无法确认引用属于当前私聊')
  }
  return {
    address,
    externalId: result.message_id,
    actorId: result.sender.user_id,
    actorName: result.sender.card || result.sender.nickname || result.sender.user_id,
    ...parseOneBotContent(result.message),
    receivedAt: result.time * 1000,
    isSelf: result.sender.user_id === address.accountId
  }
}
