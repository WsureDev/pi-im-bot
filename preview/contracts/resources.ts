import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../../src/plugins/configuration/schema'
import { PluginConfigViewSchema, SavePluginConfigSchema } from '../../src/plugins/configuration/contracts'
import { OperationSchema } from './operations'

const IdSchema = z.string().regex(/^[a-z][a-z0-9_.:-]{0,100}$/)
export const ProviderDeclarationSchema = z
  .object({
    apiVersion: z.literal(2),
    id: IdSchema,
    pluginId: IdSchema,
    title: z.string(),
    description: z.string(),
    version: z.string(),
    operations: z
      .array(OperationSchema)
      .min(1)
      .max(100)
      .refine((items) => {
        return (
          new Set(
            items.map((item) => {
              return item.id
            })
          ).size === items.length
        )
      }, '操作 ID 重复'),
    display: z
      .object({
        icon: z.string().regex(/^mdi-[a-z0-9-]+$/),
        columns: z.array(z.object({ key: z.string(), title: z.string() }))
      })
      .strict(),
    configurationSchema: ConfigDefinitionSchema,
    resourceSchema: ConfigDefinitionSchema,
    discovery: z
      .object({
        mode: z.literal('plugin-rpc'),
        timeoutMs: z.number().int().positive().max(30000),
        maximumItems: z.number().int().min(1).max(500)
      })
      .strict()
  })
  .strict()
export type ProviderDeclaration = z.infer<typeof ProviderDeclarationSchema>
export const ResourceDescriptorSchema = z
  .object({
    externalId: IdSchema,
    name: z.string().min(1),
    description: z.string(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
    operationIds: z.array(z.string()).min(1)
  })
  .strict()
export type ResourceDescriptor = z.infer<typeof ResourceDescriptorSchema>
export const ResourceRecordSchema = ResourceDescriptorSchema.extend({
  id: IdSchema,
  providerId: IdSchema,
  ownerPluginId: IdSchema,
  enabled: z.boolean(),
  discoveredAt: z.number(),
  state: z.enum(['ready', 'stale']),
  configuration: ConfigValuesSchema
})
export type ResourceRecord = z.infer<typeof ResourceRecordSchema>
export const ProviderInstanceSchema = z.object({
  id: IdSchema,
  configuration: ConfigValuesSchema,
  lastDiscoveryAt: z.number().optional(),
  discoveryRevision: z.number().int().default(0)
})
export const ResourceConfigurationSchema = PluginConfigViewSchema.extend({
  subject: z.enum(['provider', 'resource']),
  subjectId: z.string(),
  title: z.string(),
  ownerPluginId: z.string()
})
export const SaveResourceConfigurationSchema = SavePluginConfigSchema.omit({
  services: true,
  connectors: true,
  dependencies: true
})
export const RegistryViewSchema = z.object({
  revision: z.number().int(),
  providers: z.array(
    ProviderDeclarationSchema.extend({
      active: z.boolean(),
      resources: z.number().int(),
      discoveryRevision: z.number().int(),
      lastDiscoveryAt: z.number().optional()
    })
  ),
  resources: z.array(
    ResourceRecordSchema.omit({ configuration: true }).extend({
      available: z.boolean(),
      providerTitle: z.string(),
      operations: z.array(OperationSchema)
    })
  )
})
export type RegistryView = z.infer<typeof RegistryViewSchema>
