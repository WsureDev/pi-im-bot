import type { PluginStateStore } from './state/store'
import type { ComfyBroker } from '../services/comfy/broker'
export interface PluginManagedServices {
  state: PluginStateStore
  comfy: ComfyBroker
}
