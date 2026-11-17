import type { HttpServices } from '../http/app'
import { revision, resolveSettings } from '../settings/resolve'
import { SettingsEditError } from '../settings/editor'
import type { Settings } from '../settings/schema'

export class ControlScopes {
  constructor(readonly host: HttpServices) {}
  async read(id: string) {
    const framework = await this.host.frameworkEditor.read()
    const resources = await this.host.resourceEditor.read()
    let settings = framework.config.defaults
    let roomRevision = 0
    if (id !== 'global') {
      const room = this.host.coordinator.requireRoom(id)
      roomRevision = room.revision
      settings = resolveSettings(
        framework.config,
        room.address,
        room.settings,
        {},
        undefined,
        this.host.configuration().resources.pluginConfigurations()
      ).settings
    }
    return {
      settings,
      framework,
      roomRevision,
      revision: revision({ framework: framework.version, resources: resources.revision, id, roomRevision })
    }
  }
  list() {
    return [
      { id: 'global', name: '全局默认' },
      ...this.host.coordinator.store.listRooms().map((room) => {
        return { id: room.id, name: room.name }
      })
    ]
  }
  async save(id: string, expected: string, patch: Pick<Partial<Settings>, 'permissions' | 'extensions'>) {
    const current = await this.read(id)
    if (current.revision !== expected) {
      throw new SettingsEditError('配置范围或插件目录已变化，草稿未覆盖，请刷新后重试。', 409)
    }
    if (id === 'global') {
      current.framework.config.defaults = { ...current.framework.config.defaults, ...patch }
      await this.host.frameworkEditor.save(current.framework.version, current.framework.config, async () => {
        if ((await this.read(id)).revision !== expected) {
          throw new SettingsEditError('配置在保存期间变化，请刷新', 409)
        }
      })
    } else {
      const room = this.host.coordinator.requireRoom(id)
      if (room.revision !== current.roomRevision) {
        throw new SettingsEditError('聊天范围已变化，请刷新', 409)
      }
      const next = {
        ...room,
        settings: { ...room.settings, ...patch },
        revision: room.revision + 1,
        updatedAt: Date.now()
      }
      this.host.frameworkEditor.validate(current.framework.config, next)
      this.host.coordinator.store.saveRoom(next)
      this.host.coordinator.events.emit({ type: 'room', room: next })
    }
    this.host.coordinator.events.emit({ type: 'config' })
  }
}
