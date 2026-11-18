import { z } from 'zod'
import { ConfigDefinitionSchema, ConfigValuesSchema } from '../plugins/configuration/schema'
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
