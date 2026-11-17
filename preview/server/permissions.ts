import type { z } from 'zod'
import { actors, capabilities, scenes } from '../fixtures/catalog'
import {
  SimulationResultSchema,
  TriggerContextSchema,
  type SimulationInputSchema,
  type TriggerContext
} from '../contracts/context'
import type { Capability, Role } from '../contracts/capabilities'
import { requirePreset, type DemoState } from './state'
import { resourceAvailable } from './registry'
import { DemoError } from './errors'

function identity(actorId: string, sceneId: string) {
  const actor = actors.find((item) => {
    return item.id === actorId
  })
  const scene = scenes.find((item) => {
    return item.id === sceneId
  })
  if (!actor || !scene) {
    throw new DemoError('演示身份或场景不存在', 404)
  }
  const roles: Role[] = ['everyone']
  let channelRole: TriggerContext['actor']['channelRole'] = 'none'
  const evidence = ['preview: 模拟平台事件；不读取用户提交的角色字段']
  if (actor.botAdmin) {
    roles.push('bot_admin')
    evidence.push('host: 演示 Bot 管理员名单')
  }
  if (scene.kind === 'group') {
    channelRole = scene.roles[actorId] ?? 'member'
    evidence.push(
      'adapter: ' + scene.platform + '/' + scene.accountId + '/' + scene.channelId + ' 的群成员角色快照'
    )
    if (channelRole === 'owner' || channelRole === 'admin') {
      roles.push('channel_admin')
    }
  }
  return { actor, scene, roles, channelRole, evidence }
}

function evaluate(
  state: DemoState,
  input: z.infer<typeof SimulationInputSchema>,
  capability: Capability,
  facts: ReturnType<typeof identity>
) {
  const preset = requirePreset(state, input.presetId)
  const policy = preset.policies[capability.id]
  const reasons: string[] = []
  let matchedRoles: Role[] = []
  if (!policy || !policy.enabled) {
    reasons.push('此能力在当前预设中已禁用')
  }
  if (
    capability.pluginId !== 'core' &&
    !state.plugins.find((item) => {
      return item.id === capability.pluginId
    })?.active
  ) {
    reasons.push('能力所属插件未启用')
  }
  if (input.surface === 'command' && (!capability.commands.length || !policy?.commandEnabled)) {
    reasons.push('指令入口已禁用或不存在')
  }
  if (input.surface === 'tool' && (!capability.tool || !policy?.toolEnabled)) {
    reasons.push('Tool 入口已禁用或不存在')
  }
  if (policy) {
    const audience = policy[facts.scene.kind]
    if (!audience.enabled) {
      reasons.push('当前聊天类型已禁用')
    }
    matchedRoles = audience.roles.filter((role) => {
      return facts.roles.includes(role)
    })
    if (!matchedRoles.length) {
      reasons.push('触发人在当前聊天范围内不具备允许的身份')
    }
  }
  const resources: TriggerContext['resources'] = []
  if (capability.defaultOperation) {
    const selected = preset.bindings[capability.id]
    const resource = state.resources.find((item) => {
      return item.id === selected?.resourceId && item.operationIds.includes(selected.operationId)
    })
    if (!resource || !resourceAvailable(state, resource.id)) {
      reasons.push('所需资源未绑定、已停用或 Provider 不可用')
    } else {
      resources.push({ id: resource.id, providerId: resource.providerId, operationId: selected.operationId })
    }
  }
  return { allowed: reasons.length === 0, reasons, matchedRoles, resources, preset }
}

// Dispatch constructs context from host facts and never trusts input role claims.
// Both surfaces use the same evaluator; Tool keeps the originating actor.
export function simulate(state: DemoState, input: z.infer<typeof SimulationInputSchema>) {
  const capability = capabilities.find((item) => {
    return item.id === input.capabilityId
  })
  if (!capability) {
    throw new DemoError('能力不存在', 404)
  }
  const facts = identity(input.actorId, input.sceneId)
  const decision = evaluate(state, input, capability, facts)
  const { roles: sceneRoles, ...target } = facts.scene
  const context = TriggerContextSchema.parse({
    version: 1,
    requestId: crypto.randomUUID(),
    origin: 'preview-fixture',
    trigger: { surface: input.surface, capabilityId: capability.id, ownerPluginId: capability.pluginId },
    actor: {
      id: facts.actor.id,
      name: facts.actor.name,
      isBotAdmin: facts.actor.botAdmin,
      channelRole: facts.channelRole,
      roles: facts.roles,
      evidence: facts.evidence
    },
    target,
    authorization: {
      presetId: decision.preset.id,
      presetRevision: decision.preset.revision,
      stateRevision: state.revision,
      allowed: decision.allowed,
      reasons: decision.reasons,
      matchedRoles: decision.matchedRoles
    },
    resources: decision.resources
  })
  Object.freeze(context.actor.roles)
  Object.freeze(context.actor.evidence)
  Object.freeze(context.actor)
  Object.freeze(context.target)
  Object.freeze(context.authorization.reasons)
  Object.freeze(context.authorization.matchedRoles)
  Object.freeze(context.authorization)
  for (const resource of context.resources) {
    Object.freeze(resource)
  }
  Object.freeze(context.resources)
  Object.freeze(context.trigger)
  Object.freeze(context)
  const visibleTools = capabilities
    .filter((candidate) => {
      return candidate.tool && evaluate(state, { ...input, surface: 'tool' }, candidate, facts).allowed
    })
    .map((candidate) => {
      return candidate.tool!
    })
  let behavior: 'denied' | 'bot-management' | 'channel-management' | 'standard' = 'denied'
  let message = '权限检查未通过，处理器未执行。'
  let controls = { canManageBot: false, canManageChannel: false, quota: 0 }
  if (decision.allowed) {
    state.handlerInvocations += 1
    const result = demoHandler(context)
    behavior = result.behavior
    controls = result.controls
    message = result.message
  }
  const trace: Array<{ step: string; state: 'passed' | 'denied' | 'skipped'; detail: string }> = [
    {
      step: '解析触发身份',
      state: 'passed',
      detail: '服务端从模拟事件与管理员目录构造身份，客户端只选择场景。'
    },
    {
      step: '选择配置预设',
      state: 'passed',
      detail: decision.preset.name + ' · r' + decision.preset.revision
    }
  ]
  if (decision.allowed) {
    trace.push({
      step: '统一能力授权',
      state: 'passed',
      detail: '入口、聊天范围、身份与资源均通过；Tool 沿用触发人。'
    })
    trace.push({ step: '调用演示处理器', state: 'passed', detail: message })
  } else {
    trace.push({ step: '统一能力授权', state: 'denied', detail: decision.reasons.join('；') })
    trace.push({ step: '调用演示处理器', state: 'skipped', detail: '未进入处理器，不产生任何上游操作。' })
  }
  return SimulationResultSchema.parse({
    context,
    executed: decision.allowed,
    behavior,
    message,
    controls,
    visibleTools,
    trace,
    handlerInvocations: state.handlerInvocations
  })
}

function demoHandler(context: Readonly<TriggerContext>) {
  if (context.actor.isBotAdmin) {
    return {
      behavior: 'bot-management' as const,
      controls: {
        canManageBot: true,
        canManageChannel: context.actor.roles.includes('channel_admin'),
        quota: 20
      },
      message: '进入 Bot 管理分支：可查看全局演示任务，单次额度 20。'
    }
  }
  if (context.actor.roles.includes('channel_admin')) {
    return {
      behavior: 'channel-management' as const,
      controls: { canManageBot: false, canManageChannel: true, quota: 5 },
      message: '进入渠道管理分支：只管理当前群的演示任务，单次额度 5。'
    }
  }
  return {
    behavior: 'standard' as const,
    controls: { canManageBot: false, canManageChannel: false, quota: 1 },
    message: '进入普通用户分支：只操作自己的演示任务，单次额度 1。'
  }
}
