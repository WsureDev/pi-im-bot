import type { z } from 'zod'
import { orderHooks } from '../../src/plugins/hooks/order'
import { PluginHookSchema } from '../../src/plugins/manifest'
import { FlowViewSchema, type SaveFlowSchema } from '../contracts/flow'
import { flowStages, flowEdges, registrations } from '../fixtures/flow'
import { requirePreset, requireRevision, type DemoState } from './state'
import { DemoError } from './errors'

export function flowView(state: DemoState, presetId: string, pluginId?: string) {
  const preset = requirePreset(state, presetId)
  if (
    pluginId &&
    !state.plugins.some((item) => {
      return item.id === pluginId
    })
  ) {
    throw new DemoError('插件不存在', 404)
  }
  const entries = registrations.map((registration) => {
    const effective = { ...registration, ...preset.flow[registration.id] }
    return {
      ...effective,
      rank: 0,
      editable: !pluginId || registration.pluginId === pluginId,
      effective:
        effective.enabled &&
        Boolean(
          state.plugins.find((plugin) => {
            return plugin.id === registration.pluginId
          })?.active
        )
    }
  })
  const order: Record<string, string[]> = {}
  for (const stage of flowStages) {
    const handlers = entries.filter((item) => {
      return item.pointId === stage.id && item.effective
    })
    const sorted = orderHooks(
      handlers.map((entry) => {
        return {
          key: entry.id,
          instanceId: entry.pluginId,
          generation: 'preview',
          priority: entry.priority,
          hook: PluginHookSchema.parse({
            id: entry.id.split('/')[1],
            point: stage.id,
            mode: stage.mode,
            priority: entry.priority,
            before: entry.before,
            after: entry.after,
            requires: entry.requires
          })
        }
      })
    )
    order[stage.id] = sorted.map((item) => {
      return item.key
    })
    for (const [index, item] of sorted.entries()) {
      entries.find((entry) => {
        return entry.id === item.key
      })!.rank = index + 1
    }
  }
  let scope: { kind: 'global' | 'plugin'; pluginId?: string } = { kind: 'global' }
  if (pluginId) {
    scope = { kind: 'plugin', pluginId }
  }
  return FlowViewSchema.parse({
    revision: preset.revision,
    presetId,
    scope,
    stages: flowStages,
    edges: flowEdges,
    registrations: entries,
    order
  })
}
export function saveFlow(
  state: DemoState,
  presetId: string,
  input: z.infer<typeof SaveFlowSchema>,
  pluginId?: string
) {
  const view = flowView(state, presetId, pluginId)
  const preset = requirePreset(state, presetId)
  requireRevision(preset.revision, input.revision)
  if (
    new Set(
      input.changes.map((change) => {
        return change.id
      })
    ).size !== input.changes.length
  ) {
    throw new DemoError('同一注册项不能重复提交')
  }
  for (const change of input.changes) {
    const entry = view.registrations.find((item) => {
      return item.id === change.id
    })
    if (!entry) {
      throw new DemoError('注册项不存在', 404)
    }
    if (!entry.editable) {
      throw new DemoError('插件范围只能修改该插件自己的注册项', 403)
    }
    preset.flow[change.id] = { priority: change.priority, enabled: change.enabled }
  }
  flowView(state, presetId, pluginId)
  preset.revision += 1
}
