import { ConfigDefinitionSchema } from './schema'
import voiceSchema from '../../framework/plugin-examples/voice/_conf_schema.json'
import recallSchema from '../../framework/plugin-examples/recall/_conf_schema.json'
import imageSchema from '../../framework/plugin-examples/image-studio/_conf_schema.json'

export interface Feature {
  title: string
  kind: string
  description: string
  point?: string
  writes?: string
}
export interface ExamplePlugin {
  id: string
  name: string
  icon: string
  color: string
  category: string
  description: string
  version: string
  installed: boolean
  enabled: boolean
  state: string
  schema: ReturnType<typeof ConfigDefinitionSchema.parse>
  features: Feature[]
  needs: Array<{ name: string; reason: string; binding?: string }>
  permissions: Array<{ title: string; detail: string }>
}
export const plugins: ExamplePlugin[] = [
  {
    id: 'voice',
    name: 'GSVI 语音',
    icon: '声',
    color: 'peach',
    category: '语音与表达',
    description: '把合适的回复读出来。按群设置音色、长度和触发概率。',
    version: '0.1.0',
    installed: true,
    enabled: false,
    state: '待绑定服务',
    schema: ConfigDefinitionSchema.parse(voiceSchema),
    features: [
      {
        title: '语音呈现',
        kind: '回复呈现',
        description: '文字整理完成后生成音频；失败时按配置保留文字。',
        point: 'delivery.presentation@1',
        writes: '呈现文本与本次音频产物'
      },
      { title: '/voice', kind: '指令', description: '查看或切换当前群的语音偏好。' }
    ],
    needs: [
      { name: '语音合成服务', reason: '选择已登记的服务，凭据由 Bot 保存。HTTP 语音连接器属于后续实现。' }
    ],
    permissions: [
      { title: '生成和发布音频', detail: '只发布当前群、当前实例数据目录中的文件。' },
      { title: '调用绑定的语音服务', detail: '只调用所选服务，插件不取得上游凭据。' }
    ]
  },
  {
    id: 'recall',
    name: '延时撤回',
    icon: '撤',
    color: 'lavender',
    category: '群聊管理',
    description: '收到发送回执后安排撤回，倒计时交给框架持久任务。',
    version: '0.1.0',
    installed: true,
    enabled: true,
    state: '示例已启用',
    schema: ConfigDefinitionSchema.parse(recallSchema),
    features: [
      {
        title: '自动撤回',
        kind: '回执观察',
        description: '按已确认的逻辑消息回执安排撤回，不占用主对话。',
        point: 'delivery.receipt@1',
        writes: '本消息的延后撤回动作'
      },
      { title: '/recall', kind: '指令', description: '撤回引用消息，调用时重新检查触发成员权限。' }
    ],
    needs: [],
    permissions: [
      { title: '撤回本次 Bot 回复', detail: '只接收本次回执，不接受任意群号或消息 ID。手动指令独立鉴权。' }
    ]
  },
  {
    id: 'image-studio',
    name: '图像工作室',
    icon: '图',
    color: 'mint',
    category: '图像与视频',
    description: '统一绘图入口和多后端预设，长任务后台运行并交付结果。',
    version: '0.1.0',
    installed: false,
    enabled: false,
    state: '配置样例',
    schema: ConfigDefinitionSchema.parse(imageSchema),
    features: [
      {
        title: 'generate_image',
        kind: 'LLM 工具 · 后台',
        description: '提交后返回任务号，查询和取消由统一 Job 生命周期接管。'
      },
      {
        title: '/draw',
        kind: '指令 · 后台',
        description: '与工具调用共用同一操作，完整保留触发人的权限上限。'
      }
    ],
    needs: [{ name: '图像 MCP 服务', reason: '绑定已配置的图像工具服务。', binding: '从已登记 MCP 中选择' }],
    permissions: [
      { title: '调用绑定的图像工具', detail: '只接入选定的 MCP，不暴露其他工具或连接凭据。' },
      { title: '交付当前群的图片产物', detail: '长任务结果按原群范围回流，停止后抑制迟到回复。' }
    ]
  }
]
