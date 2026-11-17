import { z } from 'zod'
import type { Address } from '../domain/message'

export const TriggerIdentitySchema = z.object({
  origin: z.enum(['platform', 'local', 'mock', 'legacy']),
  actorId: z.string(),
  actorName: z.string(),
  channel: z.string(),
  accountId: z.string(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  chatKind: z.enum(['group', 'direct']).optional(),
  chatId: z.string().optional(),
  messageIds: z.array(z.string()).default([])
})
export type TriggerIdentity = Readonly<z.infer<typeof TriggerIdentitySchema>>

export const AuthoritySchema = z.object({
  identities: z.array(TriggerIdentitySchema).min(1),
  capabilities: z.array(z.string()),
  policyRevision: z.string()
})
export type Authority = z.infer<typeof AuthoritySchema>

export function identityForRoom(identity: TriggerIdentity, address: Address): TriggerIdentity {
  if (
    (identity.chatId !== undefined && identity.chatId !== address.chatId) ||
    (identity.chatKind !== undefined && identity.chatKind !== address.kind)
  ) {
    throw new Error('触发身份不属于当前聊天范围')
  }
  if (identity.origin === 'platform') {
    if (identity.channel !== address.channel || identity.accountId !== address.accountId) {
      throw new Error('触发身份的平台账号不匹配')
    }
    return identity
  }
  return Object.freeze({ ...identity, chatKind: address.kind, chatId: address.chatId })
}

// Editable Web/Mock display labels are never platform credentials.
export function localIdentity(
  channel: string,
  accountId: string,
  actorId = 'developer',
  actorName = '开发者'
): TriggerIdentity {
  let origin: TriggerIdentity['origin'] = 'local'
  if (channel === 'mock') {
    origin = 'mock'
  }
  return Object.freeze({ origin, channel, accountId, actorId, actorName, messageIds: [] })
}
