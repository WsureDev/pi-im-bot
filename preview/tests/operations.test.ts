import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createResearchApp } from '../server/routes'
import { OperationRunner } from '../server/operations'
import { filesProvider } from '../providers/files'
import { seedState } from '../server/seed'
import { InvocationResultSchema } from '../contracts/operations'
import { RegistryViewSchema } from '../contracts/resources'
import { migrateResourceState } from '../migrate-resources'

let directory: string
let harness: Awaited<ReturnType<typeof createResearchApp>>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'generic-operation-test-'))
  harness = await createResearchApp(join(directory, 'state.json'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
function invoke(resourceId: string, operationId: string, parameters: object, revision = 1) {
  return harness.app.request('/api/research/operations/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resourceId, operationId, operationVersion: '1.0.0', revision, parameters })
  })
}
test('resource registry has no business categories and exposes provider-owned schemas', async () => {
  const response = await harness.app.request('/api/research/registry')
  const text = await response.text()
  expect(text).not.toContain('resourceKind')
  expect(text).not.toContain('kindTitle')
  const registry = RegistryViewSchema.parse(JSON.parse(text))
  expect(
    registry.resources
      .find((entry) => {
        return entry.id === 'provider-files.main.documents'
      })
      ?.operations.map((entry) => {
        return entry.id
      })
  ).toEqual(['normalize', 'statistics'])
})
test('one endpoint invokes unrelated API and text operations without an agent', async () => {
  const api = InvocationResultSchema.parse(
    await (await invoke('provider-http.main.records', 'lookup', { recordId: 'R-123' })).json()
  )
  expect(api.status).toBe('succeeded')
  expect(api.output).toEqual({ recordId: 'R-123', status: 'ready (demo)', tenant: 'demo' })
  const text = InvocationResultSchema.parse(
    await (await invoke('provider-files.main.documents', 'normalize', { text: '  A  \n\n B ' })).json()
  )
  expect(text.output).toEqual({ content: 'A\nB', lineCount: 2 })
  const statistics = InvocationResultSchema.parse(
    await (await invoke('provider-files.main.documents', 'statistics', { text: '猫\nB' })).json()
  )
  expect(statistics.output).toEqual({ characters: 3, lines: 2 })
  expect(harness.store.read().handlerInvocations).toBe(0)
})
test('canonical JSON schema rejects invalid input and unknown operations before invocation', async () => {
  expect((await invoke('provider-http.main.records', 'lookup', { recordId: 'wrong' })).status).toBe(400)
  expect((await invoke('provider-files.main.documents', 'normalize', { text: 42 })).status).toBe(400)
  expect(
    (await invoke('provider-files.main.documents', 'normalize', { text: 'ok', surprise: true })).status
  ).toBe(400)
  expect((await invoke('provider-files.main.documents', 'lookup', { recordId: 'R-123' })).status).toBe(404)
  expect((await invoke('provider-files.main.documents', 'normalize', { text: 'ok' }, 0)).status).toBe(409)
})
test('disabled resources fail closed and capability bindings address arbitrary operations', async () => {
  const binding = await harness.app.request('/api/research/presets/community/binding', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: 1,
      capabilityId: 'image.draw',
      operation: { resourceId: 'provider-files.main.documents', operationId: 'statistics' }
    })
  })
  expect(binding.status).toBe(200)
  expect(harness.store.read().presets[0].bindings['image.draw']).toEqual({
    resourceId: 'provider-files.main.documents',
    operationId: 'statistics'
  })
  await harness.store.change((state) => {
    state.resources.find((entry) => {
      return entry.id === 'provider-files.main.documents'
    })!.enabled = false
  })
  expect((await invoke('provider-files.main.documents', 'statistics', { text: 'a' }, 3)).status).toBe(409)
})
test('bad provider output is rejected, errors are masked and timeout does not replay', async () => {
  const original = filesProvider.invoke
  const operation = filesProvider.declaration.operations[0]
  const timeout = operation.timeoutMs
  const input = {
    resourceId: 'provider-files.main.documents',
    operationId: 'normalize',
    revision: 1,
    operationVersion: '1.0.0',
    parameters: { text: 'a' }
  }
  const runner = new OperationRunner()
  let calls = 0
  try {
    filesProvider.invoke = async () => {
      return { invalid: 'private-backend-detail' }
    }
    expect((await runner.invoke(await seedState(), input)).error?.code).toBe('INVALID_OUTPUT')
    filesProvider.invoke = async () => {
      throw new Error('credential-should-not-escape')
    }
    expect(JSON.stringify(await runner.invoke(await seedState(), input))).not.toContain(
      'credential-should-not-escape'
    )
    operation.timeoutMs = 50
    filesProvider.invoke = async (_request, signal) => {
      calls += 1
      return new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'))
          },
          { once: true }
        )
      })
    }
    expect((await runner.invoke(await seedState(), input)).error?.code).toBe('TIMEOUT')
    expect(calls).toBe(1)
    const abort = new AbortController()
    const pending = runner.invoke(await seedState(), input, abort.signal)
    abort.abort()
    expect((await pending).status).toBe('cancelled')
  } finally {
    filesProvider.invoke = original
    operation.timeoutMs = timeout
  }
})

test('one-time migration preserves user policies, hook edits, secrets and resource choices', async () => {
  const state = await seedState()
  const providers = state.providers.filter((item) => {
    return !['provider-http.main', 'provider-files.main'].includes(item.id)
  })
  providers[0].configuration.apiKey = 'migration-private-fixture'
  const resources = state.resources
    .filter((item) => {
      return providers.some((entry) => {
        return entry.id === item.providerId
      })
    })
    .map(({ operationIds, ...resource }) => {
      return { ...resource, kind: 'legacy-' + resource.providerId }
    })
  const presets = state.presets.map((preset) => {
    return {
      ...preset,
      bindings: {
        'legacy-provider-gsvi.main': 'provider-gsvi.main.nagi',
        'legacy-provider-comfy.main': 'provider-comfy.main.text2image'
      }
    }
  })
  presets[0].policies['image.draw'].group.roles = ['bot_admin']
  presets[0].flow['image-tools/caption'] = { priority: 617, enabled: false }
  const migrated = await migrateResourceState({ ...state, version: 1, providers, resources, presets })
  expect(migrated.version).toBe(2)
  expect(migrated.presets[0].policies).toEqual(presets[0].policies)
  expect(migrated.presets[0].flow).toEqual(presets[0].flow)
  expect(migrated.presets[0].bindings['speech.speak']).toEqual({
    resourceId: 'provider-gsvi.main.nagi',
    operationId: 'synthesize'
  })
  expect(migrated.providers[0].configuration.apiKey).toBe('migration-private-fixture')
  expect(
    migrated.resources.some((item) => {
      return item.id === 'provider-files.main.documents'
    })
  ).toBe(true)
  expect(await migrateResourceState(migrated)).toEqual(migrated)
})
