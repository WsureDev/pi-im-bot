import { z } from 'zod'
import { CapabilityAccessSchema, BotAdministratorSchema } from '../permissions/capability-policy'
import { TriggerIdentitySchema } from '../permissions/identity'
export const ScopeSchema = z.object({ id: z.string(), name: z.string() })
export const CapabilityRowSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string(),
  commands: z.array(z.string()),
  commandIds: z.array(z.string()),
  tool: z.string().optional(),
  kind: z.enum(['tool', 'command', 'action'])
})
export type CapabilityRow = z.infer<typeof CapabilityRowSchema>
export const ControlSnapshotSchema = z.object({
  revision: z.string(),
  scopeId: z.string(),
  scopes: z.array(ScopeSchema),
  plugins: z.array(z.object({ id: z.string(), name: z.string(), enabled: z.boolean() })),
  capabilities: z.array(CapabilityRowSchema),
  policies: z.record(z.string(), CapabilityAccessSchema),
  administrators: z.array(BotAdministratorSchema)
})
export type ControlSnapshot = z.infer<typeof ControlSnapshotSchema>
export const SaveAccessSchema = z
  .object({
    revision: z.string(),
    policies: z.record(z.string(), CapabilityAccessSchema),
    administrators: z.array(BotAdministratorSchema).max(100).optional()
  })
  .strict()
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
export const LiveFlowSchema = z.object({
  revision: z.string(),
  scopeId: z.string(),
  stages: z.array(FlowStageSchema),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })),
  registrations: z.array(
    z.object({
      id: z.string(),
      pluginId: z.string(),
      pointId: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.number(),
      enabled: z.boolean(),
      before: z.array(z.string()),
      after: z.array(z.string()),
      requires: z.array(z.string()),
      editable: z.boolean(),
      rank: z.number(),
      effective: z.boolean()
    })
  )
})
export type FlowView = z.infer<typeof LiveFlowSchema>
export const SaveLiveFlowSchema = z
  .object({
    revision: z.string(),
    changes: z
      .array(
        z
          .object({
            id: z.string(),
            priority: z.number().int().min(-100000).max(100000),
            enabled: z.boolean()
          })
          .strict()
      )
      .min(1)
      .max(200)
  })
  .strict()
export const ContextHistorySchema = z.object({
  entries: z.array(
    z.object({
      runId: z.string(),
      roomId: z.string(),
      status: z.string(),
      source: z.string(),
      mode: z.enum(['demo', 'live']),
      at: z.number(),
      policyRevision: z.string(),
      actors: z.array(TriggerIdentitySchema.extend({ roles: z.array(z.string()) })),
      capabilities: z.array(z.string()),
      resourceId: z.string().optional()
    })
  )
})
