import { RoomSchema } from '../domain/message'
import type { Configuration } from '../config/load'
import type { Coordinator } from '../runtime/coordinator'
import type { PluginService } from './service'
import { resolveSettings, revision } from '../settings/resolve'
import { localIdentity } from '../permissions/identity'
import { fillConfigDefaults } from './configuration/values'
import { readConfigPath } from '../resource-providers/projection'
import type { PluginInvocation } from './invocation'
import { pluginOperationId } from './identity'

/** Host-owned lifecycle for explicitly declared instance maintenance operations. */
export class PluginTimers {
  private readonly deadlines = new Map<string, number>()
  private readonly running = new Map<string, Promise<void>>()
  private readonly abort = new AbortController()
  private interval?: ReturnType<typeof setInterval>
  constructor(
    private readonly config: () => Configuration,
    private readonly service: PluginService,
    private readonly coordinator: Coordinator
  ) {}

  start() {
    if (this.interval) {
      throw new Error('Plugin timers already started')
    }
    this.interval = setInterval(() => {
      this.tick()
    }, 1000)
    this.tick()
  }
  private tick() {
    if (this.abort.signal.aborted || !this.service.available()) {
      return
    }
    const config = this.config()
    const live = new Set<string>()
    for (const instance of config.resources.config.plugins) {
      if (!instance.enabled) {
        continue
      }
      const bundle = config.resources.pluginPackage(instance.id)
      if (!bundle) {
        continue
      }
      const settings = fillConfigDefaults(bundle.configuration ?? {}, instance.settings)
      for (const timer of bundle.manifest.timers) {
        const enabled = readConfigPath(settings, timer.enabledSetting)
        if (enabled !== true && enabled !== 'true') {
          continue
        }
        const key = instance.id + ':' + timer.id
        live.add(key)
        if (this.running.has(key) || (this.deadlines.get(key) ?? 0) > Date.now()) {
          continue
        }
        this.deadlines.set(key, Date.now() + timer.intervalSeconds * 1000)
        const operation = bundle.manifest.operations.find((entry) => {
          return entry.id === timer.operation
        })
        if (!operation || operation.tool) {
          continue
        }
        const room = RoomSchema.parse({
          id: 'plugin-maintenance:' + instance.id,
          name: instance.name + ' maintenance',
          address: { channel: 'mock', accountId: 'maintenance', kind: 'direct', chatId: instance.id },
          mode: 'demo',
          currentConversationId: 'maintenance',
          createdAt: 0,
          updatedAt: 0
        })
        const effective = resolveSettings(config.framework, room.address, {})
        effective.settings.resources.plugins = { mode: 'selected', ids: [instance.id] }
        const capability = pluginOperationId(instance.id, operation.id)
        const capabilities = [capability, 'runtime_status']
        const identity = localIdentity('mock', 'maintenance', 'maintenance', 'Plugin maintenance')
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(operation.timeoutMs)])
        const authorize = (requested: string) => {
          signal.throwIfAborted()
          const current = this.config().resources.config.plugins.find((item) => {
            return item.id === instance.id
          })
          if (!current?.enabled || !capabilities.includes(requested)) {
            throw new Error('维护操作已停用或超出授权能力')
          }
        }
        const invocation: PluginInvocation = {
          config,
          room,
          origin: 'schedule',
          input: {
            roomId: room.id,
            text: '',
            actorId: identity.actorId,
            actorName: identity.actorName,
            source: 'schedule',
            receivedAt: Date.now(),
            identities: [identity],
            context: {
              conversationId: 'maintenance',
              rootConversationId: 'maintenance',
              conversationEpoch: 0,
              sessionKey: room.id,
              capabilityRevisions: config.resources.capabilityRevisions(effective.settings),
              effective,
              authority: { identities: [identity], capabilities, policyRevision: revision(settings) }
            }
          },
          services: {
            authorize,
            history: () => {
              return []
            },
            assertActive: () => {
              return authorize(capability)
            },
            configuredDelivery: this.coordinator.deliverConfigured.bind(this.coordinator),
            async send() {
              throw new Error('维护操作只允许配置声明的提醒目标')
            }
          }
        }
        const task = this.service
          .scoped(room.id, instance.id, signal, async (active) => {
            await this.service.execute(invocation, capability, {}, key + ':' + Date.now(), active)
          })
          .catch((error) => {
            if (!this.abort.signal.aborted) {
              console.warn('Plugin maintenance:', instance.id, config.catalog.redact(String(error)))
            }
          })
          .finally(() => {
            this.running.delete(key)
          })
        this.running.set(key, task)
      }
    }
    for (const key of this.deadlines.keys()) {
      if (!live.has(key)) {
        this.deadlines.delete(key)
      }
    }
  }
  async close() {
    clearInterval(this.interval)
    this.abort.abort('shutdown')
    await Promise.allSettled(this.running.values())
  }
}
