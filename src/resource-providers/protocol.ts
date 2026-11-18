import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../plugins/configuration/schema'

export const ResourceIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/u)
export const ProtocolIdSchema = z.string().regex(/^[a-z][a-z0-9.-]+@[1-9][0-9]*$/u)
export const ResourceMethodSchema = z
  .object({
    id: ResourceIdSchema,
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(4000),
    effect: z.enum(['read', 'write']),
    inputSchema: z.record(z.string(), z.json()),
    outputSchema: z.record(z.string(), z.json()),
    inputUiSchema: ConfigDefinitionSchema.default({}),
    example: ConfigValuesSchema.default({})
  })
  .strict()
export const ResourceProtocolSchema = z
  .object({
    id: ProtocolIdSchema,
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(4000),
    methods: z.array(ResourceMethodSchema).min(1).max(100)
  })
  .strict()
const HttpMappingSchema = z
  .object({
    kind: z.literal('http'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    path: z.string().regex(/^\/(?!\/)[^?#]*$/u),
    query: z.record(z.string(), z.string()).default({}),
    idempotencyHeader: z.string().optional()
  })
  .strict()
const McpMappingSchema = z.object({ kind: z.literal('mcp'), tool: z.string().min(1).max(256) }).strict()
export const ResourceMappingSchema = z
  .object({
    protocol: ProtocolIdSchema,
    method: ResourceIdSchema,
    inputMapping: z.record(z.string(), z.string()).optional(),
    outputPath: z.string().optional(),
    transport: z.discriminatedUnion('kind', [HttpMappingSchema, McpMappingSchema]),
    files: z
      .object({
        itemsPath: z.string(),
        urlField: z.string().optional(),
        path: z.string().optional(),
        query: z.record(z.string(), z.string()).default({})
      })
      .strict()
      .optional()
  })
  .strict()
export const ProviderDefinitionSchema = z
  .object({
    id: ResourceIdSchema,
    title: z.string().min(1).max(100),
    description: z.string().max(4000),
    configuration: ConfigDefinitionSchema,
    mappings: z.array(ResourceMappingSchema).min(1).max(200)
  })
  .strict()
export const ResourceInstanceSchema = z
  .object({
    id: ResourceIdSchema,
    name: z.string().min(1).max(100),
    provider: ResourceIdSchema,
    enabled: z.boolean().default(false),
    configuration: ConfigValuesSchema.default({})
  })
  .strict()
export const ResourceDependencySchema = z
  .object({
    alias: ResourceIdSchema,
    protocol: ProtocolIdSchema,
    methods: z.array(ResourceIdSchema).min(1).max(100),
    required: z.boolean().default(true)
  })
  .strict()
export const ResourceCallSchema = z
  .object({
    resourceId: ResourceIdSchema,
    protocol: ProtocolIdSchema,
    method: ResourceIdSchema,
    parameters: ConfigValuesSchema.default({})
  })
  .strict()
export const ResourceOutputSchema = z.object({
  requestId: z.string(),
  value: z.json(),
  files: z.array(z.object({ url: z.url(), name: z.string() })).default([]),
  artifactIds: z.array(z.string()).default([])
})
export type ResourceProtocol = z.infer<typeof ResourceProtocolSchema>
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>
export type ResourceInstance = z.infer<typeof ResourceInstanceSchema>
export type ResourceCall = z.infer<typeof ResourceCallSchema>
export type ResourceMethod = z.infer<typeof ResourceMethodSchema>
export type ResourceMapping = z.infer<typeof ResourceMappingSchema>

export function resourceCapability(id: string, protocol: string, method: string) {
  return 'resource:' + id + '/' + protocol + '/' + method
}
