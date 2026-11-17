import { CapabilitySchema, type Capability } from '../contracts/capabilities'
import { ActorFixtureSchema, SceneFixtureSchema } from '../contracts/context'
import { DemoPluginSchema } from '../contracts/presets'

export const demoPlugins = [
  {
    id: 'provider-http',
    name: '普通 API 适配器',
    description: '由插件声明业务查询操作',
    provider: true,
    active: true
  },
  {
    id: 'provider-files',
    name: '文本处理后端',
    description: '由插件声明文档整理与统计操作',
    provider: true,
    active: true
  },
  {
    id: 'image-tools',
    name: '绘图工具',
    description: '消费图像资源的指令与 Tool',
    provider: false,
    active: true
  },
  {
    id: 'speech-tools',
    name: '语音呈现',
    description: '消费语音资源并参与回复呈现',
    provider: false,
    active: true
  },
  { id: 'audit-log', name: '消息审计', description: '消息和回执观察', provider: false, active: true },
  { id: 'policy-guard', name: '渠道策略', description: '消息策略与管理指令', provider: false, active: true },
  { id: 'markdown-format', name: '文字整理', description: '规范化回复文本', provider: false, active: true },
  {
    id: 'provider-gsvi',
    name: 'GSVI Provider',
    description: '提供 自定义语音操作 的演示实现',
    provider: true,
    active: true
  },
  {
    id: 'provider-comfy',
    name: 'ComfyUI Provider',
    description: '提供 自定义工作流操作 的演示实现',
    provider: true,
    active: true
  },
  {
    id: 'provider-lab',
    name: '实验室语音 Provider',
    description: '用于演示无需修改 Bot/UI 的动态扩展',
    provider: true,
    active: false
  }
].map((plugin) => {
  return DemoPluginSchema.parse(plugin)
})

export const capabilities: Capability[] = [
  {
    id: 'image.draw',
    pluginId: 'image-tools',
    title: '画图',
    description: '指令与 Tool 共用图像生成权限',
    commands: ['/draw', '/画图'],
    tool: 'image_generate',
    defaultOperation: { resourceId: 'provider-comfy.main.text2image', operationId: 'render' }
  },
  {
    id: 'speech.speak',
    pluginId: 'speech-tools',
    title: '语音合成',
    description: '通过已绑定的语音资源生成回复',
    commands: ['/tts'],
    tool: 'speech_synthesize',
    defaultOperation: { resourceId: 'provider-gsvi.main.hana', operationId: 'synthesize' }
  },
  {
    id: 'image.queue',
    pluginId: 'image-tools',
    title: '查看图像队列',
    description: '查看本范围图像任务',
    commands: ['/draw queue'],
    tool: 'image_queue'
  },
  {
    id: 'channel.recall',
    pluginId: 'policy-guard',
    title: '撤回消息',
    description: '需要目标范围内的管理权限',
    commands: ['/recall'],
    tool: 'message_recall'
  },
  {
    id: 'bot.manage',
    pluginId: 'policy-guard',
    title: '管理 Bot',
    description: '管理预设与全局设置',
    commands: ['/bot-config'],
    tool: 'bot_config'
  },
  {
    id: 'audit.status',
    pluginId: 'audit-log',
    title: '状态查询',
    description: '读取当前范围状态',
    commands: ['/status'],
    tool: 'read_status'
  },
  {
    id: 'core.help',
    pluginId: 'core',
    title: '帮助',
    description: '列出当前身份可用的入口',
    commands: ['/help']
  },
  {
    id: 'core.history',
    pluginId: 'core',
    title: '聊天历史',
    description: '读取当前对话历史',
    commands: [],
    tool: 'chat_history'
  }
].map((capability) => {
  return CapabilitySchema.parse(capability)
})

export const actors = [
  {
    id: 'bot-admin',
    name: '林 · Bot 管理员',
    botAdmin: true,
    description: '来自 Bot 管理员名单；不假定具有群管理身份'
  },
  {
    id: 'channel-admin',
    name: '岚 · 渠道管理员',
    botAdmin: false,
    description: '仅在设计群是管理员；在另一个群和私聊里是普通用户'
  },
  { id: 'member', name: '小鱼 · 普通用户', botAdmin: false, description: '普通群成员/私聊用户' },
  { id: 'owner', name: '池 · 群主', botAdmin: false, description: '群主归入该群的渠道管理身份' },
  {
    id: 'dual-admin',
    name: '青 · 双重管理身份',
    botAdmin: true,
    description: '同时在 Bot 管理员名单和当前群管理员名单'
  }
].map((actor) => {
  return ActorFixtureSchema.parse(actor)
})
export const scenes = [
  {
    id: 'design-group',
    title: '群聊 · 设计群',
    kind: 'group',
    platform: 'onebot-v11',
    accountId: 'demo-bot',
    channelId: 'group-design',
    roles: {
      'bot-admin': 'member',
      'channel-admin': 'admin',
      member: 'member',
      owner: 'owner',
      'dual-admin': 'admin'
    }
  },
  {
    id: 'another-group',
    title: '群聊 · 另一个群',
    kind: 'group',
    platform: 'onebot-v11',
    accountId: 'demo-bot',
    channelId: 'group-another',
    roles: {
      'bot-admin': 'member',
      'channel-admin': 'member',
      member: 'member',
      owner: 'member',
      'dual-admin': 'member'
    }
  },
  {
    id: 'direct',
    title: '私聊',
    kind: 'direct',
    platform: 'onebot-v11',
    accountId: 'demo-bot',
    channelId: 'direct-demo',
    roles: {}
  }
].map((scene) => {
  return SceneFixtureSchema.parse(scene)
})
