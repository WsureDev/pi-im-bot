import { z } from 'zod'
import { toRaw, type InjectionKey } from 'vue'
import {
  ConfigValuesSchema,
  type ConfigDefinition,
  type ConfigField,
  type ConfigValues
} from '@core/plugins/configuration/schema'
import type { PluginConfigView } from '@core/plugins/configuration/contracts'
import type { SecretChange } from '@core/plugins/configuration/secrets'
import { fillConfigDefaults, mergeConfig, containsConfigSecrets } from '@core/plugins/configuration/values'
import { SecretValuesSchema, type SecretValues } from '@core/plugins/configuration/secret-editor'
import { request } from './http'

export interface ConfigurationDraft {
  values: ConfigValues
  overrides: Record<string, boolean>
  secrets: Record<string, { action: 'keep' | 'set' | 'clear'; value: string | string[] }>
  bindings: PluginConfigView['bindings']
}
export interface ConfigurationContext {
  view: PluginConfigView
  draft: ConfigurationDraft
  canOverride(field: ConfigField): boolean
  editable(path: string, field: ConfigField): boolean
  inherit(path: string, enabled: boolean): void
}
export const PluginConfigIdKey: InjectionKey<() => string> = Symbol('plugin-config-id')
export const ConfigurationKey: InjectionKey<ConfigurationContext> = Symbol('plugin-configuration')

export function setConfigurationOverride(
  view: PluginConfigView,
  draft: ConfigurationDraft,
  path: string,
  enabled: boolean
) {
  draft.overrides[path] = enabled
  if (enabled) {
    return
  }
  const keys = path
    .slice(1)
    .split('/')
    .map((key) => {
      return key.replaceAll('~1', '/').replaceAll('~0', '~')
    })
  let target = draft.values
  let inherited = view.inherited
  for (const key of keys.slice(0, -1)) {
    const child = ConfigValuesSchema.parse(target[key] ?? {})
    target[key] = child
    target = child
    inherited = ConfigValuesSchema.parse(inherited[key] ?? {})
  }
  const key = keys[keys.length - 1]
  if (Object.hasOwn(inherited, key)) {
    target[key] = structuredClone(toRaw(inherited[key]))
  }
}

export function pointer(parent: string, key: string) {
  return parent + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')
}

function visit(
  definition: ConfigDefinition,
  values: ConfigValues,
  operation: (path: string, field: ConfigField, parent: ConfigValues, key: string) => void,
  prefix = ''
) {
  for (const [key, field] of Object.entries(definition)) {
    const path = pointer(prefix, key)
    operation(path, field, values, key)
    if (field.type === 'object') {
      const nested = ConfigValuesSchema.parse(values[key] ?? {})
      values[key] = nested
      visit(field.items ?? {}, nested, operation, path)
    }
    if (field.type === 'template_list') {
      const entries = z.array(ConfigValuesSchema).parse(values[key] ?? [])
      values[key] = entries
      for (const entry of entries) {
        const template = field.templates?.[z.string().parse(entry.__template_key)]
        if (template) {
          visit(template.items, entry, operation, path + '/@' + z.string().parse(entry.__entry_id))
        }
      }
    }
  }
}

export async function readConfigurationSecrets(path: string, view: PluginConfigView) {
  return request(path + '/secrets', SecretValuesSchema, {
    method: 'POST',
    data: { revision: view.revision, release: view.release, target: view.target }
  })
}

export function createConfigurationDraft(
  view: PluginConfigView,
  storedSecrets: SecretValues = {}
): ConfigurationDraft {
  const definition = toRaw(view.definition ?? {})
  const values = fillConfigDefaults(
    definition,
    mergeConfig(toRaw(view.inherited), toRaw(view.values), definition)
  )
  const overrides: Record<string, boolean> = {}
  visit(definition, structuredClone(toRaw(view.values)), (path, field, parent, key) => {
    if (field.type !== 'object') {
      overrides[path] = Object.hasOwn(parent, key)
    }
  })
  const secrets: ConfigurationDraft['secrets'] = {}
  visit(definition, values, (path, field, parent, key) => {
    if (field.secret) {
      let value: string | string[] = ''
      if (field.type === 'list') {
        value = []
      }
      if (Object.hasOwn(storedSecrets, path)) {
        value = structuredClone(toRaw(storedSecrets[path]))
      }
      secrets[path] = { action: 'keep', value }
      delete parent[key]
    }
  })
  return { values, overrides, secrets, bindings: structuredClone(toRaw(view.bindings)) }
}

export function configurationDefinition(view: PluginConfigView, values: ConfigValues) {
  const definition = structuredClone(toRaw(view.definition ?? {}))
  visit(definition, structuredClone(toRaw(values)), (_path, field) => {
    if (field.type === 'dict' && !field.template_schema && field.items) {
      field.template_schema = field.items
    }
    if (field._special) {
      const choices = view.choices[field._special]
      field.options = choices.map((choice) => {
        return choice.id
      })
      field.labels = choices.map((choice) => {
        return choice.name
      })
      delete field._special
    }
  })
  const voice = definition.preset?.items?.voice
  const projection = view.gsviConfiguration
  if (voice && projection?.projectionActive) {
    voice.hint = (voice.hint ?? '') + ' ' + projection.voiceHint
    const preset = ConfigValuesSchema.parse(values.preset ?? {})
    const current = z.string().catch('').parse(preset.voice)
    if (projection.voiceChoices.length) {
      voice.options = [...new Set([...projection.voiceChoices, current].filter(Boolean))]
      voice.labels = voice.options.map((value) => {
        if (projection.voiceChoices.includes(String(value))) {
          return String(value)
        }
        return String(value) + '（当前选择）'
      })
    }
  }
  return definition
}

export function configurationPayload(view: PluginConfigView, draft: ConfigurationDraft) {
  const secrets: SecretChange[] = []
  function serialize(
    fields: ConfigDefinition,
    input: ConfigValues,
    prefix = '',
    scoped = view.target.level !== 'instance'
  ): ConfigValues {
    const output: ConfigValues = {}
    for (const [key, field] of Object.entries(fields)) {
      const path = pointer(prefix, key)
      if (field.secret) {
        const change = draft.secrets[path]
        if (change?.action === 'set') {
          secrets.push({ path, action: 'set', value: change.value })
        }
        if (change?.action === 'clear') {
          secrets.push({ path, action: 'clear' })
        }
        continue
      }
      if (field.type === 'object') {
        const nested = serialize(field.items ?? {}, ConfigValuesSchema.parse(input[key] ?? {}), path, scoped)
        if (Object.keys(nested).length || !scoped) {
          output[key] = nested
        }
      } else if (
        !scoped ||
        (draft.overrides[path] &&
          field.scope.includes(view.target.level) &&
          !field.readonly &&
          !containsConfigSecrets({ [key]: field }))
      ) {
        if (field.type === 'template_list') {
          output[key] = z
            .array(ConfigValuesSchema)
            .parse(input[key] ?? [])
            .map((entry) => {
              const templateKey = z.string().parse(entry.__template_key)
              const entryId = z.uuid().parse(entry.__entry_id)
              return {
                ...serialize(field.templates![templateKey].items, entry, path + '/@' + entryId, false),
                __template_key: templateKey,
                __entry_id: entryId
              }
            })
        } else if (Object.hasOwn(input, key)) {
          output[key] = input[key]
        }
      }
    }
    return output
  }
  const values = serialize(view.definition ?? {}, draft.values)
  function bindings(kind: 'service' | 'mcp' | 'plugin' | 'resource') {
    return Object.fromEntries(
      draft.bindings
        .filter((item) => {
          return item.kind === kind
        })
        .map((item) => {
          return [item.alias, item.value]
        })
    )
  }
  return {
    revision: view.revision,
    release: view.release,
    target: view.target,
    values,
    secrets,
    services: bindings('service'),
    connectors: bindings('mcp'),
    dependencies: bindings('plugin'),
    resources: bindings('resource')
  }
}
