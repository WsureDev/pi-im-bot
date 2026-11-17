import { expect, test } from 'bun:test'
import { parseConfigDefinition } from '../src/plugins/configuration/schema'
import { configurationSecretValues } from '../src/plugins/configuration/secret-editor'
import { publicConfig } from '../src/plugins/configuration/secrets'

test('private editor projects only declared secrets including lists and stable template identities', () => {
  const entryId = '11111111-1111-4111-8111-111111111111'
  const definition = parseConfigDefinition({
    ordinary: { type: 'string', default: '' },
    token: { type: 'string', secret: true, default: '' },
    keys: { type: 'list', secret: true, default: [] },
    nested: { type: 'object', items: { password: { type: 'string', secret: true, default: '' } } },
    entries: { type: 'template_list', default: [], templates: { item: { name: 'Item', items: { token: { type: 'string', secret: true, default: '' } } } } }
  })
  const values = { ordinary: 'public', token: 'TEST_TOKEN', keys: ['TEST_KEY_A', 'TEST_KEY_B'], nested: { password: 'TEST_PASSWORD' },
    entries: [{ __entry_id: entryId, __template_key: 'item', token: 'TEST_TEMPLATE' }] }
  expect(configurationSecretValues(definition, values)).toEqual({ '/token': 'TEST_TOKEN', '/keys': ['TEST_KEY_A', 'TEST_KEY_B'], '/nested/password': 'TEST_PASSWORD', ['/entries/@' + entryId + '/token']: 'TEST_TEMPLATE' })
  expect(JSON.stringify(publicConfig(definition, values))).not.toContain('TEST_')
})
