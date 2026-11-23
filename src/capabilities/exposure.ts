import type { BotTool } from './tool'
import type { z } from 'zod'
import type { ResourceSettingsSchema } from '../settings/schema'

type ResourceSettings = z.infer<typeof ResourceSettingsSchema>

export function exposedDefinitions(tools: BotTool[], resources: ResourceSettings): BotTool[] {
  return tools.map((tool) => {
    let exposure: BotTool['exposure'] = 'direct'
    if (resources.toolExposure === 'deferred' && !resources.permanentTools.includes(tool.name)) {
      exposure = 'deferred'
    }
    return { ...tool, exposure }
  })
}
