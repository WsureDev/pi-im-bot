import { z } from 'zod'
import { CapabilityPolicySchema, CapabilitySchema } from './capabilities'
import { FlowOverrideSchema } from './flow'
import { OperationReferenceSchema } from './operations'

export const PresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  revision: z.number().int(),
  policies: z.record(z.string(), CapabilityPolicySchema),
  flow: z.record(z.string(), FlowOverrideSchema),
  bindings: z.record(z.string(), OperationReferenceSchema)
})
export type Preset = z.infer<typeof PresetSchema>
export const DemoPluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.boolean(),
  active: z.boolean()
})
export const DemoSnapshotSchema = z.object({
  demo: z.literal(true),
  revision: z.number().int(),
  defaultPresetId: z.string(),
  presets: z.array(PresetSchema),
  plugins: z.array(DemoPluginSchema),
  capabilities: z.array(CapabilitySchema)
})
export type DemoSnapshot = z.infer<typeof DemoSnapshotSchema>
