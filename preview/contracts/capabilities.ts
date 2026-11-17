import { z } from 'zod'
import { OperationReferenceSchema } from './operations'

export const RoleSchema = z.enum(['bot_admin', 'channel_admin', 'everyone'])
export type Role = z.infer<typeof RoleSchema>
export const AudienceSchema = z
  .object({ enabled: z.boolean(), roles: z.array(RoleSchema).max(3) })
  .strict()
  .refine((value) => {
    return !value.enabled || value.roles.length > 0
  }, '启用的范围至少选择一种身份')
export const CapabilityPolicySchema = z
  .object({
    enabled: z.boolean(),
    commandEnabled: z.boolean(),
    toolEnabled: z.boolean(),
    group: AudienceSchema,
    direct: AudienceSchema
  })
  .strict()
  .refine((value) => {
    return !value.direct.roles.includes('channel_admin')
  }, '私聊没有渠道管理身份')
export type CapabilityPolicy = z.infer<typeof CapabilityPolicySchema>
export const CapabilitySchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  title: z.string(),
  description: z.string(),
  commands: z.array(z.string()),
  tool: z.string().optional(),
  defaultOperation: OperationReferenceSchema.optional()
})
export type Capability = z.infer<typeof CapabilitySchema>
export const SavePoliciesSchema = z
  .object({
    revision: z.number().int(),
    policies: z.record(z.string(), CapabilityPolicySchema)
  })
  .strict()
