import { z } from 'zod'
import {
  ResourceProtocolSchema,
  ProviderDefinitionSchema,
  ResourceIdSchema,
  ResourceCallSchema
} from './protocol'
import { ResourceCommandSchema } from './commands/schema'
import { PluginConfigViewSchema, SavePluginConfigSchema } from '../plugins/configuration/contracts'

export const IndependentRegistrySchema = z.object({
  revision: z.string(),
  protocols: z.array(ResourceProtocolSchema),
  definitions: z.array(ProviderDefinitionSchema),
  instances: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      enabled: z.boolean(),
      consumers: z.array(z.string())
    })
  ),
  commands: z.array(ResourceCommandSchema),
  mcp: z.array(
    z.object({ serverId: z.string(), name: z.string(), tool: z.string(), description: z.string() })
  )
})
export const IndependentConfigSchema = PluginConfigViewSchema.extend({
  id: z.string(),
  title: z.string(),
  provider: z.string()
})
export const CreateResourceSchema = z
  .object({
    revision: z.string(),
    id: ResourceIdSchema,
    name: z.string().min(1).max(100),
    provider: ResourceIdSchema
  })
  .strict()
export const SaveIndependentConfigSchema = SavePluginConfigSchema.pick({
  revision: true,
  release: true,
  target: true,
  values: true,
  secrets: true
})
export const InvokeIndependentSchema = ResourceCallSchema.extend({ revision: z.string() }).strict()
