import { z } from 'zod'
import type { Settings } from '../settings/schema'
import type { TriggerIdentity } from './identity'

export const AccessRoleSchema = z.enum(['bot_admin', 'channel_admin', 'everyone'])
const AudienceSchema = z
  .object({ enabled: z.boolean(), roles: z.array(AccessRoleSchema).max(3) })
  .strict()
  .refine((value) => {
    return !value.enabled || value.roles.length > 0
  }, '启用范围至少选择一个身份')
export const CapabilityAccessSchema = z
  .object({
    enabled: z.boolean(),
    toolEnabled: z.boolean(),
    commandEnabled: z.boolean(),
    group: AudienceSchema,
    direct: AudienceSchema
  })
  .strict()
  .refine((value) => {
    return !value.direct.roles.includes('channel_admin')
  }, '私聊没有渠道管理身份')
export type CapabilityAccess = z.infer<typeof CapabilityAccessSchema>
export const BotAdministratorSchema = z
  .object({ channel: z.string().min(1), accountId: z.string().min(1), actorId: z.string().min(1) })
  .strict()
export function triggerRoles(settings: Settings, identity: TriggerIdentity) {
  return identityRoles(identity, settings.permissions.botAdministrators ?? [])
}
export function identityRoles(
  identity: TriggerIdentity,
  administrators: z.infer<typeof BotAdministratorSchema>[]
) {
  const roles: z.infer<typeof AccessRoleSchema>[] = ['everyone']
  if (
    identity.origin === 'local' ||
    (identity.origin === 'platform' &&
      administrators.some((entry) => {
        return (
          entry.channel === identity.channel &&
          entry.accountId === identity.accountId &&
          entry.actorId === identity.actorId
        )
      }))
  ) {
    roles.push('bot_admin')
  }
  if (
    identity.origin === 'platform' &&
    identity.chatKind === 'group' &&
    ['admin', 'owner'].includes(identity.role ?? '')
  ) {
    roles.push('channel_admin')
  }
  return roles
}
export function capabilityPolicyAllows(settings: Settings, identity: TriggerIdentity, capability: string) {
  const policy = settings.permissions.capabilityPolicies?.[capability]
  if (!policy) {
    return true
  }
  if (!policy.enabled || (capability.startsWith('command:') && !policy.commandEnabled)) {
    return false
  }
  // Console calls have a real room target attached by the host. Historical unknown scenes fail closed.
  if (!identity.chatKind) {
    return false
  }
  const audience = policy[identity.chatKind]
  return (
    audience.enabled &&
    audience.roles.some((role) => {
      return triggerRoles(settings, identity).includes(role)
    })
  )
}
export function assertToolEnabled(settings: Settings, capability: string) {
  if (settings.permissions.capabilityPolicies?.[capability]?.toolEnabled === false) {
    throw new Error('此 Tool 入口已停用：' + capability)
  }
}
