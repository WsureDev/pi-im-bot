import type { ConfigDefinition } from '@core/plugins/configuration/schema'

const groups = [
  { key: 'preferences', title: '人格与回复', icon: 'mdi-chat-outline' },
  { key: 'data', title: '消息与媒体', icon: 'mdi-format-list-bulleted' },
  { key: 'behavior', title: '运行与队列', icon: 'mdi-cog-outline' },
  { key: 'resources', title: '能力与资源', icon: 'mdi-server-network' },
  { key: 'permissions', title: '权限策略', icon: 'mdi-shield-check-outline' },
  { key: 'output', title: '输出', icon: 'mdi-message-outline' }
]

// AstrBot's core configuration workspace separates navigation, group headings
// and field rows. Keep every Pi group visible; navigation only scrolls to it.
export function settingsSections(definition: ConfigDefinition) {
  return groups.flatMap((group) => {
    const field = definition[group.key]
    if (!field) {
      return []
    }
    const displayed = { ...field }
    if (field.type === 'object') {
      displayed.description = ''
      delete displayed.hint
    }
    return [
      {
        ...group,
        heading: field.description || group.title,
        hint: field.hint,
        single: field.type !== 'object',
        metadata: { settings: { type: 'object', items: { [group.key]: displayed } } }
      }
    ]
  })
}
