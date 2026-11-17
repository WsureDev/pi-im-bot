import { z } from 'zod'
import { ConfigDefinitionSchema, type ConfigDefinition } from '../plugins/configuration/schema'
import type { PluginOperation } from '../plugins/manifest'
import type { ResourceOperationView } from './contracts'

const PropertySchema = z
  .object({
    type: z.string(),
    description: z.string().optional(),
    default: z.json().optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional()
  })
  .passthrough()
export function operationView(operation: PluginOperation, version: string): ResourceOperationView {
  let ui: ConfigDefinition = operation.inputUiSchema ?? {}
  const example: ResourceOperationView['example'] = {}
  if (!operation.inputUiSchema) {
    const fields: Record<string, object> = {}
    let complete = true
    const required = z.array(z.string()).catch([]).parse(operation.inputSchema.required)
    for (const [key, raw] of Object.entries(operation.inputSchema.properties)) {
      const parsed = PropertySchema.safeParse(raw)
      if (!parsed.success) {
        complete = false
        break
      }
      const value = parsed.data
      let type = 'string'
      let defaultValue: z.infer<ReturnType<typeof z.json>> = ''
      if (value.type === 'boolean') {
        type = 'bool'
        defaultValue = false
      } else if (value.type === 'integer') {
        type = 'int'
        defaultValue = 0
      } else if (value.type === 'number') {
        type = 'float'
        defaultValue = 0
      } else if (value.type !== 'string') {
        complete = false
        break
      }
      if ((type === 'int' || type === 'float') && value.minimum !== undefined) {
        defaultValue = value.minimum
      }
      if (type === 'int' && typeof defaultValue === 'number') {
        defaultValue = Math.ceil(defaultValue)
      }
      if (value.enum?.length) {
        defaultValue = value.enum[0]
      }
      if (value.default !== undefined) {
        defaultValue = value.default
      }
      fields[key] = {
        type,
        description: value.description ?? key,
        default: defaultValue,
        required: required.includes(key),
        options: value.enum,
        min: value.minimum,
        max: value.maximum
      }
    }
    if (complete) {
      ui = ConfigDefinitionSchema.parse(fields)
    }
  }
  for (const [key, field] of Object.entries(ui)) {
    if (field.default !== undefined) {
      example[key] = field.default
    }
  }
  return {
    id: operation.id,
    title: operation.title,
    description: operation.description,
    version,
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
    inputUiSchema: ui,
    example,
    execution: operation.execution,
    timeoutMs: operation.timeoutMs
  }
}
