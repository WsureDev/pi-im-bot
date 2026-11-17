import type { CapabilityPolicy } from '@demo/contracts/capabilities'
export const groupOptions = [
  { title: '禁用群聊', value: 'disabled' },
  { title: '仅 Bot 管理', value: 'bot_admin' },
  { title: '仅渠道管理', value: 'channel_admin' },
  { title: 'Bot 管理 + 渠道管理', value: 'bot_admin,channel_admin' },
  { title: '任何人', value: 'everyone' }
]
export const directOptions = [
  { title: '禁用私聊', value: 'disabled' },
  { title: '仅 Bot 管理', value: 'bot_admin' },
  { title: '任何人', value: 'everyone' }
]
export function audienceValue(audience: CapabilityPolicy['group']) {
  if (!audience.enabled) {
    return 'disabled'
  }
  if (audience.roles.includes('everyone')) {
    return 'everyone'
  }
  return [...audience.roles].sort().join(',')
}
export function setAudience(policy: CapabilityPolicy, scene: 'group' | 'direct', value: string) {
  if (value === 'disabled') {
    policy[scene] = { enabled: false, roles: [] }
    return
  }
  const roles: CapabilityPolicy['group']['roles'] = []
  for (const role of ['bot_admin', 'channel_admin', 'everyone'] as const) {
    if (value.split(',').includes(role)) {
      roles.push(role)
    }
  }
  policy[scene] = { enabled: true, roles }
}
