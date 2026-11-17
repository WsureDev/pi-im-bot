import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../../src/plugins/configuration/schema'

// JSON Schema defines the data contract. UI metadata only supplies presentation hints.
export const ObjectSchemaDocumentSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.json()),
    required: z.array(z.string()).optional()
  })
  .catchall(z.json())
export const OperationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_.-]{0,60}$/),
    version: z.string().min(1),
    title: z.string(),
    description: z.string(),
    inputSchema: ObjectSchemaDocumentSchema,
    outputSchema: ObjectSchemaDocumentSchema,
    inputUiSchema: ConfigDefinitionSchema,
    example: ConfigValuesSchema,
    timeoutMs: z.number().int().min(50).max(30000),
    effect: z.enum(['read', 'write'])
  })
  .strict()
export type Operation = z.infer<typeof OperationSchema>
export const OperationReferenceSchema = z.object({ resourceId: z.string(), operationId: z.string() }).strict()
export type OperationReference = z.infer<typeof OperationReferenceSchema>
export const InvokeOperationSchema = OperationReferenceSchema.extend({
  revision: z.number().int(),
  operationVersion: z.string(),
  parameters: ConfigValuesSchema
}).strict()
export type InvokeOperation = z.infer<typeof InvokeOperationSchema>
export const InvocationResultSchema = z.object({
  requestId: z.string(),
  resourceId: z.string(),
  operationId: z.string(),
  demonstration: z.literal(true),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  elapsedMs: z.number(),
  output: ConfigValuesSchema.optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional()
})
export type InvocationResult = z.infer<typeof InvocationResultSchema>
