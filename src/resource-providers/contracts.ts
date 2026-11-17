import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../plugins/configuration/schema'
import { PluginConfigViewSchema, SavePluginConfigSchema } from '../plugins/configuration/contracts'
export const ResourceOperationViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.string(),
  inputSchema: z.record(z.string(), z.json()),
  outputSchema: z.record(z.string(), z.json()).optional(),
  inputUiSchema: ConfigDefinitionSchema,
  example: ConfigValuesSchema,
  execution: z.enum(['foreground', 'background']),
  timeoutMs: z.number()
})
export type ResourceOperationView = z.infer<typeof ResourceOperationViewSchema>
export const ResourceRegistryViewSchema = z.object({
  revision: z.string(),
  providers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      version: z.string(),
      active: z.boolean(),
      runtimeReady: z.boolean(),
      discoverable: z.boolean(),
      resourceCount: z.number(),
      operationCount: z.number(),
      icon: z.string()
    })
  ),
  resources: z.array(
    z.object({
      id: z.string(),
      providerId: z.string(),
      name: z.string(),
      description: z.string(),
      externalId: z.string(),
      enabled: z.boolean(),
      state: z.enum(['ready', 'stale']),
      available: z.boolean(),
      base: z.boolean(),
      attributes: ConfigValuesSchema,
      operations: z.array(ResourceOperationViewSchema)
    })
  )
})
export type ResourceRegistryView = z.infer<typeof ResourceRegistryViewSchema>
export const ResourceConfigViewSchema = PluginConfigViewSchema.extend({
  subject: z.enum(['provider', 'resource']),
  subjectId: z.string(),
  title: z.string(),
  ownerPluginId: z.string()
})
export const SaveResourceConfigSchema = SavePluginConfigSchema.omit({
  services: true,
  connectors: true,
  dependencies: true
})
export const InvokeResourceSchema = z
  .object({
    revision: z.string(),
    roomId: z.string(),
    resourceId: z.string(),
    operationId: z.string(),
    operationVersion: z.string(),
    parameters: ConfigValuesSchema
  })
  .strict()
export const ResourceResultSchema = z.object({
  requestId: z.string(),
  status: z.enum(['done', 'accepted']),
  output: z.json().optional(),
  text: z.string().optional(),
  artifactIds: z.array(z.string()).default([]),
  jobId: z.string().optional()
})
export type ResourceResult = z.infer<typeof ResourceResultSchema>
