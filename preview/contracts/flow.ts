import { z } from 'zod'

export const FlowStageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['entry', 'hook', 'execution', 'terminal', 'authorization']),
  mode: z.enum(['collect', 'transform', 'policy', 'select', 'observe', 'exclusive']).optional(),
  implemented: z.boolean(),
  reads: z.array(z.string()),
  writes: z.array(z.string())
})
export type FlowStage = z.infer<typeof FlowStageSchema>
export const FlowRegistrationSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  pointId: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.number().int(),
  enabled: z.boolean(),
  before: z.array(z.string()),
  after: z.array(z.string()),
  requires: z.array(z.string())
})
export type FlowRegistration = z.infer<typeof FlowRegistrationSchema>
export const FlowOverrideSchema = z
  .object({ priority: z.number().int().min(-100000).max(100000), enabled: z.boolean() })
  .strict()
export const SaveFlowSchema = z
  .object({
    revision: z.number().int(),
    changes: z
      .array(FlowOverrideSchema.extend({ id: z.string() }).strict())
      .min(1)
      .max(100)
  })
  .strict()
export const FlowViewSchema = z.object({
  revision: z.number().int(),
  presetId: z.string(),
  scope: z.object({ kind: z.enum(['global', 'plugin']), pluginId: z.string().optional() }),
  stages: z.array(FlowStageSchema),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })),
  registrations: z.array(
    FlowRegistrationSchema.extend({ editable: z.boolean(), rank: z.number().int(), effective: z.boolean() })
  ),
  order: z.record(z.string(), z.array(z.string()))
})
export type FlowView = z.infer<typeof FlowViewSchema>
