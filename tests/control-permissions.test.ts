import { expect, test } from 'bun:test'
import { SettingsSchema } from '../src/settings/schema'
import {
  capabilityPolicyAllows,
  triggerRoles,
  CapabilityAccessSchema,
  assertToolEnabled
} from '../src/permissions/capability-policy'
import { identityForRoom, TriggerIdentitySchema } from '../src/permissions/identity'
import { isAllowed, captureAuthority, assertCapability } from '../src/permissions/authorize'
import { initialFramework, resolveSettings } from '../src/settings/resolve'
import { BotConfigSchema } from '../src/config/schema'

const address = { channel: 'onebot-v11', accountId: 'bot', kind: 'group' as const, chatId: 'group-a' }
function identity(
  actorId: string,
  role: 'owner' | 'admin' | 'member' = 'member',
  chatKind: 'group' | 'direct' = 'group'
) {
  return TriggerIdentitySchema.parse({
    origin: 'platform',
    actorId,
    actorName: actorId,
    channel: address.channel,
    accountId: 'bot',
    role,
    chatKind,
    chatId: 'group-a'
  })
}
function policy(roles: Array<'bot_admin' | 'channel_admin' | 'everyone'>) {
  return CapabilityAccessSchema.parse({
    enabled: true,
    toolEnabled: true,
    commandEnabled: true,
    group: { enabled: true, roles },
    direct: { enabled: true, roles: ['everyone'] }
  })
}
test('shared operation policy enforces independent group and direct roles from trusted identities', () => {
  const settings = SettingsSchema.parse({
    permissions: { botAdministrators: [{ channel: address.channel, accountId: 'bot', actorId: 'operator' }] }
  })
  for (const roles of [['bot_admin'], ['bot_admin', 'channel_admin'], ['everyone']] as Array<
    Array<'bot_admin' | 'channel_admin' | 'everyone'>
  >) {
    settings.permissions.capabilityPolicies = {
      'plugin:draw/create': policy(roles),
      'command:plugin:draw/draw': policy(roles)
    }
    for (const cap of ['plugin:draw/create', 'command:plugin:draw/draw']) {
      expect(isAllowed(settings, identity('operator'), cap)).toBe(true)
      expect(isAllowed(settings, identity('member'), cap)).toBe(roles.includes('everyone'))
      expect(isAllowed(settings, identity('group-admin', 'admin'), cap)).toBe(
        roles.includes('channel_admin') || roles.includes('everyone')
      )
      expect(isAllowed(settings, identity('owner', 'owner'), cap)).toBe(
        roles.includes('channel_admin') || roles.includes('everyone')
      )
      expect(isAllowed(settings, identity('member', 'member', 'direct'), cap)).toBe(true)
      expect(triggerRoles(settings, identity('group-admin', 'admin', 'direct'))).not.toContain(
        'channel_admin'
      )
    }
  }
  const fake = { ...identity('operator', 'admin'), origin: 'mock' as const }
  expect(triggerRoles(settings, fake)).toEqual(['everyone'])
  expect(triggerRoles(settings, { ...identity('operator'), accountId: 'another-bot' })).not.toContain(
    'bot_admin'
  )
})
test('role policies cannot widen legacy denies or a captured authority ceiling', () => {
  const framework = initialFramework(BotConfigSchema.parse({}), 'main')
  framework.defaults.permissions.capabilityPolicies = { chat_history: policy(['everyone']) }
  framework.defaults.permissions.rules = [
    { effect: 'deny', capabilities: ['chat_history'], subjects: [{ kind: 'everyone' }] }
  ]
  let effective = resolveSettings(framework, address, {})
  const actor = identity('member')
  const captured = captureAuthority(effective, [actor], undefined, ['chat_history'])
  expect(captured.capabilities).toEqual([])
  framework.defaults.permissions.rules = []
  effective = resolveSettings(framework, address, {})
  expect(() => assertCapability(captured, effective.settings, 'chat_history')).toThrow()
  effective.settings.permissions.capabilityPolicies!.chat_history.toolEnabled = false
  expect(() => assertToolEnabled(effective.settings, 'chat_history')).toThrow()
  expect(capabilityPolicyAllows(effective.settings, actor, 'chat_history')).toBe(true)
})
test('a platform role cannot be rebound to another chat and Bot administrators stay global', () => {
  expect(() => identityForRoom(identity('group-admin', 'admin'), { ...address, chatId: 'other' })).toThrow(
    '聊天范围'
  )
  expect(() => identityForRoom(identity('group-admin', 'admin'), { ...address, accountId: 'other' })).toThrow(
    '账号'
  )
  const framework = initialFramework(BotConfigSchema.parse({}), 'main')
  framework.defaults.permissions.botAdministrators = [
    { channel: address.channel, accountId: 'bot', actorId: 'operator' }
  ]
  const effective = resolveSettings(framework, address, {
    permissions: {
      default: 'allow',
      rules: [],
      botAdministrators: [{ channel: address.channel, accountId: 'bot', actorId: 'forged' }]
    }
  })
  expect(triggerRoles(effective.settings, identity('forged'))).not.toContain('bot_admin')
  expect(triggerRoles(effective.settings, identity('operator'))).toContain('bot_admin')
})
