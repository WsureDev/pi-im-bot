import { z } from 'zod'
import { ConfigValuesSchema } from '../../plugins/configuration/schema'
import { ProtocolIdSchema, ResourceIdSchema } from '../protocol'

export const ResourceCommandSchema = z
  .object({
    id: ResourceIdSchema,
    name: z.string().regex(/^[\p{L}\p{N}_-]{1,40}$/u),
    description: z.string().min(1).max(300),
    enabled: z.boolean().default(false),
    target: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('resource'),
          resourceId: ResourceIdSchema,
          protocol: ProtocolIdSchema,
          method: ResourceIdSchema
        })
        .strict(),
      z.object({ kind: z.literal('mcp'), serverId: z.string(), tool: z.string() }).strict()
    ]),
    arguments: z.enum(['none', 'text', 'json']).default('none'),
    textPath: z.string().default('/text'),
    textType: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
    fixed: ConfigValuesSchema.default({}),
    output: z.enum(['json', 'images']).default('json')
  })
  .strict()
export type ResourceCommand = z.infer<typeof ResourceCommandSchema>
export function resourceCommandCapability(id: string) {
  return 'command:resource:' + id
}
