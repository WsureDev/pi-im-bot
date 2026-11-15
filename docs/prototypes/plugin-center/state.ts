import { z } from 'zod'
import { SettingsSchema, defaults } from './schema'
import { plugins } from './fixtures'

const InstanceSchema = z.object({
  installed: z.boolean(),
  enabled: z.boolean(),
  settings: SettingsSchema,
  overrides: z.record(z.string(), SettingsSchema).default({}),
  rooms: z.array(z.string()).default([]),
  priority: z.number().int().default(0)
})
const PreviewStateSchema = z.record(z.string(), InstanceSchema)
const key = 'pi-im-plugin-center-design-v1'
let parsed = PreviewStateSchema.safeParse({})
try {
  parsed = PreviewStateSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? '{}'))
} catch {}
export const instances: z.infer<typeof PreviewStateSchema> = {}
if (parsed.success) {
  Object.assign(instances, parsed.data)
}
for (const plugin of plugins) {
  if (!instances[plugin.id]) {
    instances[plugin.id] = InstanceSchema.parse({
      installed: plugin.installed,
      enabled: plugin.enabled,
      settings: defaults(plugin.schema),
      rooms: ['qq-test'],
      priority: 0
    })
  }
}
export function persist() {
  localStorage.setItem(key, JSON.stringify(instances))
}
export function blocked(id: string) {
  if (id === 'voice' && !instances[id].settings.service) {
    return '待绑定语音服务'
  }
  return ''
}
export const rooms = [
  { id: 'qq-test', name: 'QQ · 专用测试群', hint: '示例群，群员共享配置' },
  { id: 'mock', name: 'Mock · 开发聊天', hint: '示例调试会话' }
]
