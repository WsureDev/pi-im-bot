import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../plugins/configuration/schema'

export const ProviderMetadataSchema = z
  .object({
    apiVersion: z.literal(1),
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    icon: z
      .string()
      .regex(/^mdi-[a-z0-9-]+$/)
      .default('mdi-server-network'),
    discover: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,47}$/)
      .optional(),
    tools: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/))
      .max(100)
      .default([]),
    http: z
      .object({
        baseUrlField: z.string().min(1).max(100),
        headersField: z.string().min(1).max(100).optional()
      })
      .strict()
      .optional(),
    resourceSchema: ConfigDefinitionSchema.default({})
  })
  .strict()
export const DiscoveredResourceSchema = z
  .object({
    externalId: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    description: z.string().max(2000).default(''),
    operationIds: z.array(z.string()).min(1).max(100),
    attributes: ConfigValuesSchema.default({})
  })
  .strict()
export const DiscoveryResultSchema = z
  .object({ resources: z.array(DiscoveredResourceSchema).max(500) })
  .strict()
export const ProvidedResourceSchema = DiscoveredResourceSchema.extend({
  id: z.string().min(1),
  providerId: z.string().min(1),
  enabled: z.boolean(),
  state: z.enum(['ready', 'stale']),
  configuration: ConfigValuesSchema,
  discoveredAt: z.number()
}).refine((resource) => {
  return resource.id === resource.providerId + ':' + encodeURIComponent(resource.externalId)
}, '资源 ID 必须属于提供者命名空间')
export type ProvidedResource = z.infer<typeof ProvidedResourceSchema>
