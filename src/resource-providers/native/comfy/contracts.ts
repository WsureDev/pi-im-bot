import { z } from 'zod'

export const NativeGraphSchema = z.record(
  z.string(),
  z
    .object({
      class_type: z.string(),
      inputs: z.record(z.string(), z.json()),
      _meta: z.record(z.string(), z.json()).optional()
    })
    .passthrough()
)
export type NativeGraph = z.infer<typeof NativeGraphSchema>
export const WorkflowSettingsSchema = z.object({
  json_file: z.string().default('workflow_api.json'),
  input_node_id: z.string().default('6'),
  neg_node_id: z.string().default('7'),
  output_node_id: z.string().default('')
})
export const LoraControlSchema = z.object({
  enabled: z.boolean().default(false),
  inject_catalog_into_system_prompt: z.boolean().default(false),
  inject_selected_prompt_hints: z.boolean().default(true),
  keep_workflow_defaults_when_selected: z.boolean().default(true),
  max_lora_count: z.number().int().default(4),
  max_trigger_options_per_lora: z.number().int().default(3),
  trigger_option_preview_length: z.number().int().default(80)
})
export const ComfyResourceConfigurationSchema = z.object({
  server_address: z.string().default('127.0.0.1:8188'),
  request_headers: z.string().default('{}'),
  workflow_directory: z.string().default(''),
  scan_directories: z.string().default(''),
  default_negative: z.string().default(''),
  request_timeout_ms: z.number().int().min(1000).default(300000),
  job_timeout_ms: z.number().int().nonnegative().default(0)
})
export const LoraEntrySchema = z.object({
  name: z.string(),
  display_name: z.string(),
  workflow_name: z.string().default(''),
  loader_name: z.string().default(''),
  default_strength: z.number().nullable().default(null),
  default_clip_strength: z.number().nullable().default(null),
  default_active: z.boolean().default(false),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(''),
  trigger_words: z.array(z.string()).default([]),
  prompt_hints: z.array(z.string()).default([]),
  trigger_options: z.array(z.string()).default([]),
  source_nodes: z.array(z.string()).default([]),
  model_name: z.string().default(''),
  base_model: z.string().default(''),
  tags: z.array(z.string()).default([]),
  is_style_lora: z.boolean().default(false),
  excluded: z.boolean().default(false)
})
export type LoraEntry = z.infer<typeof LoraEntrySchema>
export const LoraSelectionSchema = z.object({
  name: z.string(),
  strength: z.number().optional(),
  clip_strength: z.number().optional(),
  trigger_indexes: z.array(z.number().int()).default([]),
  control: z.literal('clear_defaults').optional()
})
export const ComfySubmitSchema = z
  .object({
    item: z.number().int().nonnegative(),
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    workflow: z.string().optional(),
    workflow_settings: WorkflowSettingsSchema.prefault({}),
    lora_control: LoraControlSchema.prefault({}),
    selections: z.array(LoraSelectionSchema).default([]),
    seed: z.number().int().positive().optional()
  })
  .strict()
