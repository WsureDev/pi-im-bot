import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { PluginConfigViewSchema, type PluginConfigView } from '../../src/plugins/configuration/contracts'
import { parseConfigDefinition, ConfigValuesSchema } from '../../src/plugins/configuration/schema'
import { fillConfigDefaults } from '../../src/plugins/configuration/values'
import {
  createConfigurationDraft,
  configurationDefinition,
  configurationPayload,
  setConfigurationOverride
} from '../src/api/plugin-configuration'

function view(): PluginConfigView {
  const definition = parseConfigDefinition({
    token: { type: 'string', description: 'Token', secret: true, default: '' },
    text: { type: 'string', description: 'Text', default: 'default', scope: ['instance', 'room'] },
    enabled: { type: 'bool', description: 'Enabled', default: true, scope: ['instance', 'room'] },
    preset: {
      type: 'object',
      description: 'Preset',
      items: {
        probability: {
          type: 'int',
          description: 'Probability',
          default: 100,
          slider: { min: 0, max: 100, step: 1 },
          scope: ['instance', 'room']
        },
        secret: { type: 'string', description: 'Nested secret', secret: true, default: '' },
        voice: { type: 'string', description: 'Voice', default: 'selected' }
      }
    },
    templates: {
      type: 'template_list',
      description: 'Templates',
      default: [],
      templates: {
        item: {
          name: 'Item',
          items: {
            name: { type: 'string', description: 'Name', default: '' },
            token: { type: 'string', description: 'Secret', secret: true, default: '' }
          }
        }
      }
    }
  })
  const values = fillConfigDefaults(definition, {})
  delete values.token
  const preset = ConfigValuesSchema.parse(values.preset)
  delete preset.secret
  values.preset = preset
  return PluginConfigViewSchema.parse({
    revision: 'revision',
    release: 'release',
    target: { level: 'instance' },
    targets: [],
    definition,
    values,
    inherited: values,
    secrets: [
      { path: '/token', configured: true, list: false },
      { path: '/preset/secret', configured: true, list: false }
    ],
    issues: [],
    choices: { select_mcp: [], select_provider: [], select_model_group: [], select_persona: [] }
  })
}

test('metadata and secret actions retain nested fields, 0, false and empty strings', () => {
  const source = view()
  const draft = createConfigurationDraft(reactive(source))
  draft.values.text = ''
  draft.values.enabled = false
  const preset = ConfigValuesSchema.parse(draft.values.preset)
  preset.probability = 0
  draft.values.preset = preset
  draft.secrets['/token'] = { action: 'set', value: 'TEST_ONLY_REPLACEMENT' }
  draft.secrets['/preset/secret'] = { action: 'clear', value: '' }
  const result = configurationPayload(source, draft)
  expect(result.values.text).toBe('')
  expect(result.values.enabled).toBe(false)
  expect(ConfigValuesSchema.parse(result.values.preset).probability).toBe(0)
  expect(result.values).not.toHaveProperty('token')
  expect(ConfigValuesSchema.parse(result.values.preset)).not.toHaveProperty('secret')
  expect(result.secrets).toEqual([
    { action: 'set', path: '/token', value: 'TEST_ONLY_REPLACEMENT' },
    { action: 'clear', path: '/preset/secret' }
  ])
  expect(
    configurationDefinition(reactive(source), reactive(draft.values)).preset.items?.probability.slider
  ).toEqual({ min: 0, max: 100, step: 1 })
})

test('unchanged secrets produce no placeholder writes and scoped inheritance stays sparse', () => {
  const source = view()
  expect(configurationPayload(source, createConfigurationDraft(source)).secrets).toEqual([])
  source.target = { level: 'room', roomId: 'room' }
  source.values = { text: 'local', preset: { probability: 0 } }
  const draft = createConfigurationDraft(source)
  draft.overrides['/text'] = false
  expect(configurationPayload(source, draft).values).toEqual({ preset: { probability: 0 } })
  draft.overrides['/preset/probability'] = false
  expect(configurationPayload(source, draft).values).toEqual({})
  setConfigurationOverride(source, draft, '/preset/probability', false)
  expect(ConfigValuesSchema.parse(draft.values.preset).probability).toBe(100)
})

test('revealed values populate password inputs without becoming save changes', () => {
  const source = view()
  const draft = createConfigurationDraft(source, { '/token': 'TEST_STORED', '/preset/secret': 'TEST_NESTED' })
  expect(draft.secrets['/token']).toEqual({ action: 'keep', value: 'TEST_STORED' })
  expect(configurationPayload(source, draft).secrets).toEqual([])
  expect(JSON.stringify(draft.values)).not.toContain('TEST_')
  draft.secrets['/token'] = { action: 'clear', value: '' }
  expect(configurationPayload(source, draft).secrets).toEqual([{ path: '/token', action: 'clear' }])
})

test('template secrets remain attached to stable entry identity after reorder and deletion', () => {
  const source = view()
  const first = '11111111-1111-4111-8111-111111111111'
  const second = '22222222-2222-4222-8222-222222222222'
  source.values.templates = [
    { __entry_id: first, __template_key: 'item', name: 'first' },
    { __entry_id: second, __template_key: 'item', name: 'second' }
  ]
  const draft = createConfigurationDraft(source)
  draft.secrets['/templates/@' + first + '/token'] = { action: 'set', value: 'TEST_ONLY_FIRST' }
  draft.secrets['/templates/@' + second + '/token'] = { action: 'clear', value: '' }
  const entries = draft.values.templates
  if (!Array.isArray(entries)) {
    throw new Error('Expected template array')
  }
  entries.reverse()
  expect(configurationPayload(source, draft).secrets[0].path).toBe('/templates/@' + second + '/token')
  entries.splice(1, 1)
  expect(configurationPayload(source, draft).secrets).toEqual([
    { action: 'clear', path: '/templates/@' + second + '/token' }
  ])
})

test('cached voice options retain all choices and an unlisted current selection', () => {
  const source = view()
  source.gsviConfiguration = {
    projectionSupported: true,
    projectionActive: true,
    refreshDisabled: true,
    inlinePresentationContract: 'tool-send@1',
    runtimeContract: 'gsvi-plugin@1',
    voiceChoices: Array.from({ length: 1500 }, (_value, index) => {
      return 'voice-' + index
    }),
    voiceHint: 'Cached only'
  }
  const definition = configurationDefinition(source, source.values)
  expect(definition.preset.items?.voice.options).toHaveLength(1501)
  expect(definition.preset.items?.voice.options?.at(-1)).toBe('selected')
  source.gsviConfiguration.voiceChoices = []
  expect(configurationDefinition(source, source.values).preset.items?.voice.options).toBeUndefined()
})
