import { fillConfigDefaults } from '../../src/plugins/configuration/values'
import { CapabilityPolicySchema } from '../contracts/capabilities'
import { capabilities, demoPlugins } from '../fixtures/catalog'
import { providerModules } from '../providers/catalog'
import { discover } from './registry'
import { DemoStateSchema, type DemoState } from './state'

export async function seedState(): Promise<DemoState> {
  const policies = Object.fromEntries(
    capabilities.map((capability) => {
      const policy = CapabilityPolicySchema.parse({
        enabled: true,
        commandEnabled: capability.commands.length > 0,
        toolEnabled: Boolean(capability.tool),
        group: { enabled: true, roles: ['everyone'] },
        direct: { enabled: true, roles: ['everyone'] }
      })
      if (['image.draw', 'channel.recall'].includes(capability.id)) {
        policy.group.roles = ['bot_admin', 'channel_admin']
      }
      if (capability.id === 'channel.recall') {
        policy.direct = { enabled: false, roles: [] }
      }
      if (capability.id === 'bot.manage') {
        policy.group.roles = ['bot_admin']
        policy.direct.roles = ['bot_admin']
      }
      return [capability.id, policy]
    })
  )
  const state = DemoStateSchema.parse({
    version: 2,
    revision: 1,
    defaultPresetId: 'community',
    handlerInvocations: 0,
    presets: [
      {
        id: 'community',
        name: '社区助手',
        description: '私聊开放；群内绘图由 Bot 管理员与渠道管理员使用。',
        revision: 1,
        policies,
        flow: {},
        bindings: {}
      },
      {
        id: 'sandbox',
        name: '创作沙盒',
        description: '独立预设，所有人可绘图；可用于比较配置差异。',
        revision: 1,
        policies: structuredClone(policies),
        flow: {},
        bindings: {}
      }
    ],
    plugins: structuredClone(demoPlugins),
    providers: providerModules.map(({ declaration }) => {
      return {
        id: declaration.id,
        configuration: fillConfigDefaults(declaration.configurationSchema, {}),
        discoveryRevision: 0
      }
    }),
    resources: []
  })
  state.presets[1].policies['image.draw'].group.roles = ['everyone']
  for (const module of providerModules) {
    if (
      state.plugins.find((plugin) => {
        return plugin.id === module.declaration.pluginId
      })?.active
    ) {
      await discover(state, module.declaration.id)
    }
  }
  for (const preset of state.presets) {
    for (const capability of capabilities) {
      if (capability.defaultOperation) {
        preset.bindings[capability.id] = structuredClone(capability.defaultOperation)
      }
    }
  }
  return state
}
