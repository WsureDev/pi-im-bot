import type { PluginStateStore } from './state/store'
import type { ComfyBroker } from '../services/comfy/broker'
import type { ResourceNativeContext } from '../resource-providers/native/contracts'
export interface PluginManagedServices {
  renderHtml?: typeof import('../services/render/html').renderHtml
  state: PluginStateStore
  comfy: ComfyBroker
  resources?: ResourceNativeContext['durable']
  configuration?: { patch(id: string, release: string, patch: Record<string, unknown>): Promise<void> }
}
