import { ConfigFieldSchema, type ConfigDefinition } from '@core/plugins/configuration/schema'
import { SettingsSchema } from '@core/settings/schema'
import type { FrameworkEditorState, Snapshot } from '@core/http/contracts'

const numeric: Record<string, [string, number, number]> = {
  quoteChars: ['引用正文预算（字符）', 0, 8000],
  imageMaxCount: ['每次请求最多图片数', 1, 8],
  imageMaxSide: ['图片投影最长边', 256, 4096],
  imageBudgetBytes: ['图片投影总预算（字节）', 65536, 16777216],
  historyLimit: ['历史消息数', 1, 100],
  historyChars: ['历史正文预算（字符）', 500, 100000],
  maxJobsPerRun: ['每轮后台任务上限', 1, 10],
  maxOutstandingJobs: ['未收尾任务上限', 1, 200],
  jobTimeoutMs: ['后台任务期限（毫秒）', 1000, 86400000],
  batchQuietMs: ['安静窗口（毫秒，0 关闭合批）', 0, 5000],
  batchMaxHoldMs: ['合批最长等待（毫秒）', 50, 10000],
  batchMaxRequests: ['每批最多发言数', 1, 20],
  batchMaxChars: ['合批正文预算（字符）', 500, 100000],
  queueMaxAgeMs: ['排队请求有效期（毫秒）', 1000, 3600000],
  timeoutMs: ['单轮超时（毫秒）', 1000, 3600000],
  maxModelCalls: ['模型调用上限', 1, 100]
}
const booleans: Record<string, string> = {
  includeQuotes: '引用消息内容',
  visionEnabled: '本轮图片视觉投影',
  includeSpeaker: '包含发言人',
  includeTime: '包含时间',
  agentEnabled: '启用 Agent',
  allowProactive: '允许主动回复',
  trim: '去除回复首尾空白'
}
const scope = ['instance', 'account', 'room', 'conversation']
export function settingsDefinition(library: FrameworkEditorState, snapshot: Snapshot): ConfigDefinition {
  const defaults = SettingsSchema.parse({})
  const definition: ConfigDefinition = {}
  for (const [section, title] of [
    ['data', '数据、媒体与引用'],
    ['behavior', '行为、合批与后台工作'],
    ['output', '输出']
  ] as const) {
    const items: ConfigDefinition = {}
    for (const [key, value] of Object.entries(defaults[section])) {
      const number = numeric[key]
      if (number) {
        items[key] = ConfigFieldSchema.parse({
          type: 'int',
          description: number[0],
          min: number[1],
          max: number[2],
          default: value,
          scope
        })
      } else {
        items[key] = ConfigFieldSchema.parse({
          type: 'bool',
          description: booleans[key] ?? key,
          default: value,
          scope
        })
      }
    }
    definition[section] = ConfigFieldSchema.parse({ type: 'object', description: title, items, scope })
  }
  definition.preferences = ConfigFieldSchema.parse({
    type: 'object',
    description: '人格与回复偏好',
    scope,
    items: {
      personaId: {
        type: 'string',
        description: '人格',
        options: library.config.personas.map((item) => {
          return item.id
        }),
        labels: library.config.personas.map((item) => {
          return item.name
        }),
        scope
      },
      providerGroup: {
        type: 'string',
        description: '模型组',
        options: snapshot.providers.groups.map((item) => {
          return item.id
        }),
        labels: snapshot.providers.groups.map((item) => {
          return item.name
        }),
        scope
      },
      visionProvider: {
        type: 'string',
        description: '默认图片描述模型',
        hint: '用于未单独选择识图模型的插件；请选择支持图片的模型，留空使用会话模型组。',
        default: '',
        options: [
          '',
          ...snapshot.providers.providers.flatMap((provider) => {
            return provider.models.map((model) => {
              return provider.id + '/' + model
            })
          })
        ],
        labels: [
          '使用会话模型组',
          ...snapshot.providers.providers.flatMap((provider) => {
            return provider.models.map((model) => {
              return provider.id + ' / ' + model
            })
          })
        ],
        scope
      },
      replyStyle: { type: 'text', description: '回复偏好', default: '', scope }
    }
  })
  const resources: ConfigDefinition = {}
  for (const [key, title] of [
    ['tools', '工具'],
    ['mcp', 'MCP'],
    ['skills', 'Skill'],
    ['plugins', '插件']
  ]) {
    resources[key] = ConfigFieldSchema.parse({
      type: 'text',
      description: title + '选择（JSON）',
      hint: 'mode: all 选择全部；mode: selected 与 ids 数组选择指定集合，空数组关闭该类能力。',
      editor_mode: true,
      editor_language: 'json',
      default: '{"mode":"all"}',
      scope
    })
  }
  resources.toolExposure = ConfigFieldSchema.parse({
    type: 'string',
    description: '工具收纳',
    options: ['all', 'deferred'],
    labels: ['全量装载', 'Pi 按需装载'],
    default: 'all',
    scope
  })
  resources.permanentTools = ConfigFieldSchema.parse({
    type: 'list',
    description: '常驻工具',
    default: defaults.resources.permanentTools,
    scope
  })
  resources.idleToolTurns = ConfigFieldSchema.parse({
    type: 'int',
    description: '工具闲置保留轮数',
    min: 0,
    max: 50,
    default: 3,
    scope
  })
  definition.resources = ConfigFieldSchema.parse({
    type: 'object',
    description: '能力与资源',
    items: resources,
    scope
  })
  definition.permissions = ConfigFieldSchema.parse({
    type: 'text',
    description: '调用权限（JSON）',
    editor_mode: true,
    editor_language: 'json',
    default: JSON.stringify(defaults.permissions, null, 2),
    scope
  })
  return definition
}
