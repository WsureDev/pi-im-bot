import type { ChannelAdapter } from '../domain/channel'
import type { Address } from '../domain/message'
import type { ChannelMedia, SendControl } from '../domain/channel-media'

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>()
  register(adapter: ChannelAdapter) {
    this.adapters.set(adapter.id, adapter)
  }
  get(id: string) {
    const adapter = this.adapters.get(id)
    if (!adapter) {
      throw new Error(`Channel adapter is not installed: ${id}`)
    }
    return adapter
  }
  send(address: Address, text: string, media?: readonly ChannelMedia[], control?: SendControl) {
    return this.get(address.channel).send(address, text, media, control)
  }
}
