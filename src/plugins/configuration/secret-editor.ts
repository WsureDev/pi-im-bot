import { z } from 'zod'
import { ConfigValuesSchema, type ConfigDefinition, type ConfigValues } from './schema'
import { PluginConfigTargetSchema } from './contracts'

export const SecretValuesSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]))
export type SecretValues = z.infer<typeof SecretValuesSchema>
export const ReadConfigSecretsSchema = z
  .object({
    revision: z.string(),
    release: z.string(),
    target: PluginConfigTargetSchema
  })
  .strict()
export const SecretValueSchema = z.object({ value: z.string() })

// Only used by the configuration editor's explicit private read, never by status/snapshot APIs.
export function configurationSecretValues(definition: ConfigDefinition, input: ConfigValues): SecretValues {
  const output: SecretValues = {}
  function visit(fields: ConfigDefinition, values: ConfigValues, prefix: string) {
    for (const [key, field] of Object.entries(fields)) {
      const path = prefix + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')
      if (field.secret) {
        if (field.type === 'list') {
          output[path] = z.array(z.string()).parse(values[key] ?? [])
        } else {
          output[path] = z.string().parse(values[key] ?? '')
        }
      } else if (field.type === 'object') {
        visit(field.items ?? {}, ConfigValuesSchema.parse(values[key] ?? {}), path)
      } else if (field.type === 'template_list') {
        for (const entry of z.array(ConfigValuesSchema).parse(values[key] ?? [])) {
          const template = field.templates?.[z.string().parse(entry.__template_key)]
          if (!template) {
            throw new Error('配置模板不存在')
          }
          visit(template.items, entry, path + '/@' + z.uuid().parse(entry.__entry_id))
        }
      }
    }
  }
  visit(definition, input, '')
  return output
}
