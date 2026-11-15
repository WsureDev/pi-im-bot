import { z } from 'zod'

const CommonFieldSchema = z.object({
  type: z.enum(['string', 'text', 'int', 'float', 'bool', 'object', 'list', 'template_list']),
  description: z.string(),
  hint: z.string().optional(),
  default: z.json().optional(),
  options: z.array(z.union([z.string(), z.number()])).optional(),
  labels: z.array(z.string()).optional(),
  secret: z.boolean().optional(),
  condition: z.record(z.string(), z.json()).optional(),
  slider: z.object({ min: z.number(), max: z.number(), step: z.number() }).optional(),
  _special: z.enum(['select_mcp', 'select_provider', 'select_persona']).optional(),
  scope: z.array(z.enum(['instance', 'account', 'room', 'conversation'])).optional()
})
interface Template {
  name: string
  hint?: string
  display_item?: string
  items: Record<string, ConfigField>
}
export interface ConfigField extends z.infer<typeof CommonFieldSchema> {
  items?: Record<string, ConfigField>
  templates?: Record<string, Template>
}
export const ConfigFieldSchema: z.ZodType<ConfigField> = z.lazy(() => {
  return CommonFieldSchema.extend({
    items: z.record(z.string(), ConfigFieldSchema).optional(),
    templates: z
      .record(
        z.string(),
        z.object({
          name: z.string(),
          hint: z.string().optional(),
          display_item: z.string().optional(),
          items: z.record(z.string(), ConfigFieldSchema)
        })
      )
      .optional()
  })
})
export const ConfigDefinitionSchema = z.record(z.string(), ConfigFieldSchema)
export const SettingsSchema = z.record(z.string(), z.json())
export type Settings = z.infer<typeof SettingsSchema>

export function defaults(fields: Record<string, ConfigField>): Settings {
  const result: Settings = {}
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) {
      result[key] = structuredClone(field.default)
    } else if (field.type === 'object') {
      result[key] = defaults(field.items ?? {})
    } else if (field.type === 'bool') {
      result[key] = false
    } else if (field.type === 'list' || field.type === 'template_list') {
      result[key] = []
    } else if (field.type === 'int' || field.type === 'float') {
      result[key] = 0
    } else {
      result[key] = ''
    }
  }
  return result
}
