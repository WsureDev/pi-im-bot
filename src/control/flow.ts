import { z } from 'zod'
import { builtinPluginPoints } from '../plugins/hooks/points'
import { SettingsEditError } from '../settings/editor'
import { ControlScopes } from './scopes'
import { LiveFlowSchema, type FlowStage, type SaveLiveFlowSchema } from './contracts'
import { ControlError } from './error'

const stages: FlowStage[] = [
  {
    id: 'trigger',
    title: '触发入口',
    description: '平台消息、命令、计划进入协调器',
    category: 'entry',
    implemented: true,
    reads: ['可信平台/本地身份'],
    writes: ['触发请求']
  },
  ...builtinPluginPoints.map((point) => {
    return {
      id: point.id,
      title: point.title,
      description: point.summary,
      category: 'hook' as const,
      implemented: true,
      mode: point.mode,
      reads: [point.flow],
      writes: [...point.writable]
    }
  }),
  {
    id: 'authority',
    title: '权限与上下文',
    description: '按配置和可信身份捕获权限上限，执行时再次检查',
    category: 'authorization',
    implemented: true,
    reads: ['触发身份', '当前设置'],
    writes: ['Authority']
  },
  {
    id: 'agent',
    title: 'Agent / Tool',
    description: 'Pi 模型与工具循环',
    category: 'execution',
    implemented: true,
    reads: ['上下文'],
    writes: ['回复']
  },
  {
    id: 'command',
    title: '直接指令',
    description: '命令解析后直接调用操作',
    category: 'execution',
    implemented: true,
    reads: ['命令参数'],
    writes: ['操作结果']
  },
  {
    id: 'job',
    title: '后台任务',
    description: '持久任务保留原触发身份和权限上限',
    category: 'execution',
    implemented: true,
    reads: ['任务'],
    writes: ['任务结果']
  },
  {
    id: 'platform',
    title: '平台发送',
    description: '交付账本记录平台确认',
    category: 'execution',
    implemented: true,
    reads: ['最终内容'],
    writes: ['回执']
  }
]
stages.push({
  id: 'denied',
  title: '权限拒绝',
  description: '权限未满足时不进入业务处理器',
  category: 'terminal',
  implemented: true,
  reads: ['拒绝原因'],
  writes: []
})
const edges = [
  ['trigger', 'message.recorded@1'],
  ['message.recorded@1', 'authority'],
  ['authority', 'context.collect@1'],
  ['context.collect@1', 'model.history@1'],
  ['model.history@1', 'agent'],
  ['authority', 'command'],
  ['authority', 'job'],
  ['authority', 'denied'],
  ['agent', 'delivery.visibility@1'],
  ['command', 'delivery.visibility@1'],
  ['job', 'delivery.visibility@1'],
  ['delivery.visibility@1', 'delivery.text@1'],
  ['delivery.text@1', 'delivery.presentation@1'],
  ['delivery.presentation@1', 'platform'],
  ['platform', 'delivery.receipt@1']
].map(([source, target]) => {
  return { source, target }
})
export async function liveFlow(scopes: ControlScopes, scopeId: string, pluginId?: string) {
  const scope = await scopes.read(scopeId)
  const config = scopes.host.configuration()
  const registry = config.resources.pluginRegistry(scope.settings)
  if (
    pluginId &&
    !config.resources.config.plugins.some((entry) => {
      return entry.id === pluginId
    })
  ) {
    throw new SettingsEditError('插件不存在')
  }
  const extra: FlowStage[] = []
  for (const point of registry.points.values()) {
    if (point.owner) {
      extra.push({
        id: point.id,
        title: point.owner.instance.name + ' / ' + point.id,
        description: '由插件显式调用的自定义点；无法静态推断连线。',
        category: 'hook',
        mode: point.mode,
        implemented: true,
        reads: ['插件传入数据'],
        writes: [...point.writable]
      })
    }
  }
  for (const instance of config.resources.config.plugins) {
    const bundle = config.resources.pluginPackage(instance.id)
    for (const point of bundle?.manifest.points ?? []) {
      const id = ['plugin', instance.id, point.id].join('.')
      if (
        !extra.some((entry) => {
          return entry.id === id
        })
      ) {
        extra.push({
          id,
          title: instance.name + ' / ' + point.id,
          description: '由插件显式调用的自定义点；无法静态推断连线。',
          category: 'hook',
          mode: point.mode,
          implemented: true,
          reads: ['插件传入数据'],
          writes: point.writable
        })
      }
    }
  }
  const registrations = config.resources.config.plugins.flatMap((instance) => {
    const bundle = config.resources.pluginPackage(instance.id)
    return (bundle?.manifest.hooks ?? []).map((hook) => {
      const id = instance.id + '/' + hook.id
      const pointId = registry.pointId(instance, hook.point)
      const planned = registry.handlers.get(pointId) ?? []
      const rank =
        planned.findIndex((entry) => {
          return entry.key === id
        }) + 1
      return {
        id,
        pluginId: instance.id,
        pointId,
        title: hook.id,
        description: instance.name,
        priority: scope.settings.extensions.priorities[id] ?? hook.priority,
        enabled: !scope.settings.extensions.disabled[id],
        before: hook.before,
        after: hook.after,
        requires: hook.requires,
        editable: !pluginId || pluginId === instance.id,
        rank,
        effective: rank > 0
      }
    })
  })
  return LiveFlowSchema.parse({
    revision: scope.revision,
    scopeId,
    stages: [...stages, ...extra],
    edges,
    registrations
  })
}
export async function saveLiveFlow(
  scopes: ControlScopes,
  scopeId: string,
  input: z.infer<typeof SaveLiveFlowSchema>,
  pluginId?: string
) {
  const view = await liveFlow(scopes, scopeId, pluginId)
  if (view.revision !== input.revision) {
    throw new SettingsEditError('流程已变化，请刷新后保存', 409)
  }
  const scope = await scopes.read(scopeId)
  let extensions = structuredClone(scope.settings.extensions)
  if (scopeId !== 'global') {
    const own = scopes.host.coordinator.requireRoom(scopeId).settings.extensions
    extensions = {
      priorities: { ...own?.priorities },
      disabled: { ...own?.disabled },
      settings: structuredClone(own?.settings ?? {})
    }
  }
  for (const change of input.changes) {
    const entry = view.registrations.find((entry) => {
      return entry.id === change.id
    })
    if (!entry?.editable) {
      throw new ControlError('此范围只能编辑所属插件的注册项', 403)
    }
    extensions.priorities[change.id] = change.priority
    extensions.disabled[change.id] = !change.enabled
  }
  await scopes.save(scopeId, input.revision, { extensions })
}
