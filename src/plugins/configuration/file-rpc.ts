import { z } from 'zod'
import type { PluginHostServices } from '../rpc/services'
import type { PluginInvocation } from '../invocation'
import type { PluginBinding } from '../registry'
import { mergeConfig } from './values'
import { ConfigFileTokenSchema, readConfigFile } from './files'
import { ConfigValuesSchema, type ConfigDefinition, type ConfigValues } from './schema'

export function registerConfigFiles(
  host: PluginHostServices,
  invocation: PluginInvocation,
  binding: PluginBinding,
  authorize: (grant: string) => void
) {
  host.register(
    'configuration.file',
    'configuration.file',
    z
      .object({
        token: ConfigFileTokenSchema,
        offset: z
          .number()
          .int()
          .min(0)
          .max(5 * 1024 * 1024)
          .default(0),
        length: z.number().int().min(1).max(65536).default(65536)
      })
      .strict(),
    async (input, context) => {
      authorize('configuration.file')
      const settings = mergeConfig(
        binding.instance.settings,
        invocation.input.context.effective.settings.extensions.settings[binding.instance.id] ?? {},
        binding.bundle.configuration
      )
      const allowed = new Set<string>()
      function visit(fields: ConfigDefinition, values: ConfigValues) {
        for (const [key, field] of Object.entries(fields)) {
          if (field.type === 'file') {
            for (const token of z.array(z.string()).parse(values[key] ?? [])) {
              allowed.add(token)
            }
          }
          if (field.type === 'object') {
            visit(field.items ?? {}, ConfigValuesSchema.parse(values[key] ?? {}))
          }
        }
      }
      visit(binding.bundle.configuration ?? {}, settings)
      if (!allowed.has(input.token)) {
        throw new Error('文件不属于此插件当前配置')
      }
      const result = await readConfigFile(
        invocation.config.dataDir,
        binding.instance.id,
        input.token,
        input.offset,
        input.length
      )
      context.signal.throwIfAborted()
      authorize('configuration.file')
      return result
    }
  )
}
