import { builtinPluginPoints } from '../../src/plugins/hooks/points'
import { FlowRegistrationSchema, type FlowStage } from '../contracts/flow'

export const flowStages: FlowStage[] = [
  {
    id: 'trigger',
    title: '触发入口',
    description: 'IM 消息、指令或后台任务进入统一入口',
    category: 'entry',
    implemented: true,
    reads: ['标准化消息'],
    writes: ['触发请求']
  },
  ...builtinPluginPoints.map((point) => {
    return {
      id: point.id,
      title: point.title,
      description: point.summary,
      category: 'hook' as const,
      mode: point.mode,
      implemented: true,
      reads: [point.flow],
      writes: [...point.writable]
    }
  }),
  {
    id: 'authorization',
    title: '身份与权限上下文',
    description: '预览新增：从可信身份和预设计算本次触发权限',
    category: 'authorization',
    implemented: false,
    reads: ['平台事件', 'Bot 管理员名单', '当前预设'],
    writes: ['TriggerContext v1']
  },
  {
    id: 'agent',
    title: 'Pi Agent / Tool',
    description: 'Pi 保持模型与工具循环；Tool 沿用触发人的权限',
    category: 'execution',
    implemented: true,
    reads: ['模型上下文', '权限快照'],
    writes: ['回复 / 工具结果']
  },
  {
    id: 'command',
    title: '指令处理器',
    description: '按相同能力策略检查指令入口后调用插件',
    category: 'execution',
    implemented: true,
    reads: ['指令参数', 'TriggerContext'],
    writes: ['指令结果']
  },
  {
    id: 'job',
    title: '后台任务',
    description: '任务保留来源与权限上限，执行前重新核对',
    category: 'execution',
    implemented: true,
    reads: ['任务', '触发上下文'],
    writes: ['任务结果']
  },
  {
    id: 'platform',
    title: '平台发送',
    description: '区分已受理和已确认发送，保留交付回执',
    category: 'execution',
    implemented: true,
    reads: ['最终内容'],
    writes: ['平台回执']
  },
  {
    id: 'denied',
    title: '明确拒绝',
    description: '权限未通过时不进入处理器',
    category: 'terminal',
    implemented: false,
    reads: ['拒绝原因'],
    writes: []
  }
]
export const flowEdges = [
  { source: 'trigger', target: 'message.recorded@1' },
  { source: 'message.recorded@1', target: 'authorization' },
  { source: 'authorization', target: 'context.collect@1', label: 'Agent' },
  { source: 'context.collect@1', target: 'model.history@1' },
  { source: 'model.history@1', target: 'agent' },
  { source: 'authorization', target: 'command', label: '指令' },
  { source: 'authorization', target: 'job', label: '任务' },
  { source: 'authorization', target: 'denied', label: '不允许' },
  { source: 'agent', target: 'delivery.visibility@1' },
  { source: 'command', target: 'delivery.visibility@1' },
  { source: 'job', target: 'delivery.visibility@1' },
  { source: 'delivery.visibility@1', target: 'delivery.text@1' },
  { source: 'delivery.text@1', target: 'delivery.presentation@1' },
  { source: 'delivery.presentation@1', target: 'platform' },
  { source: 'platform', target: 'delivery.receipt@1' }
]
export const registrations = [
  ['audit-log/record', 'audit-log', 'message.recorded@1', '记录消息摘要', 10],
  ['policy-guard/record', 'policy-guard', 'message.recorded@1', '记录范围状态', 50],
  ['image-tools/context', 'image-tools', 'context.collect@1', '补充绘图提示', 40],
  ['speech-tools/context', 'speech-tools', 'context.collect@1', '补充语音偏好', 30],
  ['audit-log/context', 'audit-log', 'context.collect@1', '补充审计摘要', 10],
  ['image-tools/history', 'image-tools', 'model.history@1', '工具参数摘要', 20],
  ['policy-guard/visibility', 'policy-guard', 'delivery.visibility@1', '发送范围策略', 100],
  ['markdown-format/clean', 'markdown-format', 'delivery.text@1', '整理文字格式', 80],
  ['image-tools/caption', 'image-tools', 'delivery.text@1', '补充图片说明', 50],
  ['audit-log/text', 'audit-log', 'delivery.text@1', '检查最终文本', 20],
  ['speech-tools/present', 'speech-tools', 'delivery.presentation@1', '选择语音呈现', 60],
  ['image-tools/present', 'image-tools', 'delivery.presentation@1', '选择图片呈现', 40],
  ['audit-log/receipt', 'audit-log', 'delivery.receipt@1', '保留交付回执', 40],
  ['policy-guard/recall', 'policy-guard', 'delivery.receipt@1', '安排延后撤回', 20]
].map(([id, pluginId, pointId, title, priority]) => {
  const after: string[] = []
  if (id === 'audit-log/text') {
    after.push('markdown-format/clean')
  }
  return FlowRegistrationSchema.parse({
    id,
    pluginId,
    pointId,
    title,
    priority,
    description: '此处理器由所属插件注册，配置只改变当前预设的优先级和启停。',
    enabled: true,
    before: [],
    after,
    requires: []
  })
})
