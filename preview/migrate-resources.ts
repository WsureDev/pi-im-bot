import { z } from 'zod'
import { writeFile } from 'node:fs/promises'
import { DemoStateSchema } from './server/state'
import { PresetSchema } from './contracts/presets'
import { ResourceRecordSchema } from './contracts/resources'
import { providerModules } from './providers/catalog'
import { capabilities } from './fixtures/catalog'
import { seedState } from './server/seed'

const LegacyResourceSchema = ResourceRecordSchema.omit({ operationIds: true }).extend({ kind: z.string() })
const LegacyStateSchema = DemoStateSchema.extend({
  version: z.literal(1),
  resources: z.array(LegacyResourceSchema),
  presets: z.array(PresetSchema.extend({ bindings: z.record(z.string(), z.string()) }))
})
export async function migrateResourceState(raw: unknown) {
  const current = DemoStateSchema.safeParse(raw)
  if (current.success) {
    return current.data
  }
  const old = LegacyStateSchema.parse(raw)
  const seeded = await seedState()
  const existingProviders = new Set(
    old.providers.map((item) => {
      return item.id
    })
  )
  const resources = old.resources.map(({ kind, ...resource }) => {
    const module = providerModules.find((item) => {
      return item.declaration.id === resource.providerId
    })
    if (!module) {
      throw new Error('无法迁移未安装的提供者：' + resource.providerId)
    }
    return {
      ...resource,
      operationIds: module.declaration.operations.map((item) => {
        return item.id
      })
    }
  })
  const presets = old.presets.map((preset) => {
    const bindings: z.infer<typeof PresetSchema>['bindings'] = {}
    for (const capability of capabilities) {
      const reference = capability.defaultOperation
      if (!reference) {
        continue
      }
      const previousDefault = old.resources.find((item) => {
        return item.id === reference.resourceId
      })
      if (!previousDefault) {
        continue
      }
      const selected = preset.bindings[previousDefault.kind]
      if (selected) {
        bindings[capability.id] = { resourceId: selected, operationId: reference.operationId }
      }
    }
    return { ...preset, revision: preset.revision + 1, bindings }
  })
  return DemoStateSchema.parse({
    ...old,
    version: 2,
    revision: old.revision + 1,
    presets,
    providers: [
      ...old.providers,
      ...seeded.providers.filter((item) => {
        return !existingProviders.has(item.id)
      })
    ],
    resources: [
      ...resources,
      ...seeded.resources.filter((item) => {
        return !existingProviders.has(item.providerId)
      })
    ],
    plugins: [
      ...old.plugins,
      ...seeded.plugins.filter((item) => {
        return !old.plugins.some((entry) => {
          return entry.id === item.id
        })
      })
    ]
  })
}
if (import.meta.main) {
  const input = z.string().min(1).parse(process.argv[2])
  const output = z.string().min(1).parse(process.argv[3])
  const state = await migrateResourceState(await Bun.file(input).json())
  await writeFile(output, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' })
  console.log('Migrated preview resource state to version ' + state.version)
}
