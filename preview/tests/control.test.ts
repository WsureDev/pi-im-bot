import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createResearchApp } from '../server/routes'
import { seedState } from '../server/seed'
import { DemoStore } from '../server/state'
import { flowView, saveFlow } from '../server/flow'
import { simulate } from '../server/permissions'
import { FlowViewSchema } from '../contracts/flow'
import { ResourceConfigurationSchema, RegistryViewSchema } from '../contracts/resources'
import { DemoSnapshotSchema } from '../contracts/presets'
import { SimulationResultSchema } from '../contracts/context'
import type { Role } from '../contracts/capabilities'

let directory: string
let harness: Awaited<ReturnType<typeof createResearchApp>>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pi-control-test-'))
  harness = await createResearchApp(join(directory, 'state.json'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
function request(path: string, method = 'GET', body?: object) {
  return harness.app.request('/api/research' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('global and plugin graph use the same host order, zero priority and dependencies are respected', async () => {
  const state = harness.store.read()
  const view = flowView(state, 'community')
  expect(view.order['delivery.text@1']).toEqual([
    'markdown-format/clean',
    'image-tools/caption',
    'audit-log/text'
  ])
  saveFlow(state, 'community', {
    revision: 1,
    changes: [
      { id: 'audit-log/text', priority: 1000, enabled: true },
      { id: 'image-tools/caption', priority: 0, enabled: true }
    ]
  })
  expect(flowView(state, 'community').order['delivery.text@1']).toEqual([
    'markdown-format/clean',
    'audit-log/text',
    'image-tools/caption'
  ])
  expect(flowView(state, 'sandbox').order['delivery.text@1']).toEqual(view.order['delivery.text@1'])
  const own = flowView(state, 'community', 'image-tools')
  expect(
    own.registrations
      .filter((entry) => {
        return entry.editable
      })
      .every((entry) => {
        return entry.pluginId === 'image-tools'
      })
  ).toBe(true)
})
test('plugin endpoint refuses foreign edits atomically and accepts its own registration', async () => {
  const path = '/presets/community/plugins/image-tools/flow'
  const forbidden = await request(path, 'PUT', {
    revision: 1,
    changes: [
      { id: 'image-tools/caption', priority: 90, enabled: true },
      { id: 'audit-log/text', priority: 0, enabled: false }
    ]
  })
  expect(forbidden.status).toBe(403)
  expect(
    flowView(harness.store.read(), 'community').registrations.find((entry) => {
      return entry.id === 'image-tools/caption'
    })?.priority
  ).toBe(50)
  const accepted = await request(path, 'PUT', {
    revision: 1,
    changes: [{ id: 'image-tools/caption', priority: 90, enabled: true }]
  })
  expect(accepted.status).toBe(200)
  const view = FlowViewSchema.parse(await accepted.json())
  expect(view.order['delivery.text@1'][0]).toBe('image-tools/caption')
  expect(
    (
      await request(path, 'PUT', {
        revision: 1,
        changes: [{ id: 'image-tools/caption', priority: 0, enabled: true }]
      })
    ).status
  ).toBe(409)
})
test('draw command and Tool share the group/private role matrix including channel-scoped admins', async () => {
  for (const groupRoles of [['bot_admin'], ['bot_admin', 'channel_admin'], ['everyone']] as Role[][]) {
    const state = await seedState()
    state.presets[0].policies['image.draw'].group.roles = groupRoles
    for (const surface of ['command', 'tool'] as const) {
      for (const sceneId of ['design-group', 'another-group', 'direct']) {
        for (const actorId of ['member', 'channel-admin', 'bot-admin', 'owner', 'dual-admin']) {
          let expected = sceneId === 'direct' || groupRoles.includes('everyone')
          if (groupRoles.includes('bot_admin') && ['bot-admin', 'dual-admin'].includes(actorId)) {
            expected = true
          }
          if (
            groupRoles.includes('channel_admin') &&
            sceneId === 'design-group' &&
            ['channel-admin', 'owner', 'dual-admin'].includes(actorId)
          ) {
            expected = true
          }
          const before = state.handlerInvocations
          const result = simulate(state, {
            presetId: 'community',
            capabilityId: 'image.draw',
            actorId,
            sceneId,
            surface,
            text: '/draw cat'
          })
          expect(result.executed).toBe(expected)
          expect(result.visibleTools.includes('image_generate')).toBe(expected)
          let delta = 0
          if (expected) {
            delta = 1
          }
          expect(state.handlerInvocations - before).toBe(delta)
          if (sceneId === 'direct') {
            expect(result.context.actor.roles).not.toContain('channel_admin')
          }
        }
      }
    }
  }
})
test('trusted context selects distinct handler branches and refuses forged role claims', async () => {
  const input = {
    presetId: 'community',
    capabilityId: 'image.draw',
    sceneId: 'direct',
    surface: 'tool',
    text: 'cat'
  }
  expect(
    (await request('/simulate', 'POST', { ...input, actorId: 'member', roles: ['bot_admin'] })).status
  ).toBe(400)
  for (const [actorId, sceneId, behavior, quota] of [
    ['member', 'direct', 'standard', 1],
    ['channel-admin', 'design-group', 'channel-management', 5],
    ['bot-admin', 'design-group', 'bot-management', 20]
  ] as const) {
    const response = await request('/simulate', 'POST', { ...input, actorId, sceneId })
    const result = SimulationResultSchema.parse(await response.json())
    expect(result.behavior).toBe(behavior)
    expect(result.controls.quota).toBe(quota)
    expect(result.context.actor.id).toBe(actorId)
    expect(result.context.actor.evidence.length).toBeGreaterThan(0)
  }
})
test('disabled capabilities, surfaces and chat scopes cannot execute; bot admin has no implicit bypass', async () => {
  const state = await seedState()
  const input = {
    presetId: 'community',
    capabilityId: 'image.draw',
    actorId: 'bot-admin',
    sceneId: 'design-group',
    surface: 'tool' as const,
    text: 'cat'
  }
  const policy = state.presets[0].policies['image.draw']
  policy.group.roles = ['channel_admin']
  expect(simulate(state, input).executed).toBe(false)
  policy.group.roles = ['everyone']
  policy.toolEnabled = false
  expect(simulate(state, input).executed).toBe(false)
  expect(simulate(state, { ...input, surface: 'command' }).executed).toBe(true)
  policy.toolEnabled = true
  policy.group.enabled = false
  expect(simulate(state, input).executed).toBe(false)
  policy.group.enabled = true
  policy.enabled = false
  expect(simulate(state, input).executed).toBe(false)
})
test('policy schema rejects private channel roles; presets and revisions remain independent', async () => {
  const state = harness.store.read()
  const policy = state.presets[0].policies['image.draw']
  expect(
    (
      await request('/presets/community/policies', 'PUT', {
        revision: 1,
        policies: { 'image.draw': { ...policy, direct: { enabled: true, roles: ['channel_admin'] } } }
      })
    ).status
  ).toBe(400)
  policy.group.roles = ['bot_admin']
  expect(
    (await request('/presets/community/policies', 'PUT', { revision: 1, policies: { 'image.draw': policy } }))
      .status
  ).toBe(200)
  expect(
    (await request('/presets/community/policies', 'PUT', { revision: 1, policies: { 'image.draw': policy } }))
      .status
  ).toBe(409)
  const snapshot = DemoSnapshotSchema.parse(await (await request('/snapshot')).json())
  expect(snapshot.presets[0].policies['image.draw'].group.roles).toEqual(['bot_admin'])
  expect(snapshot.presets[1].policies['image.draw'].group.roles).toEqual(['everyone'])
})
test('third provider discovers through generic registry, disabling and re-registering preserves resource config', async () => {
  const providerId = 'provider-lab.main'
  expect((await request('/providers/' + providerId + '/discovery', 'POST', { revision: 1 })).status).toBe(409)
  await request('/providers/' + providerId + '/registration', 'PUT', { revision: 1, enabled: true })
  const registry = RegistryViewSchema.parse(
    await (await request('/providers/' + providerId + '/discovery', 'POST', { revision: 2 })).json()
  )
  const resource = registry.resources.find((item) => {
    return item.providerId === providerId
  })!
  expect(
    resource.operations.map((item) => {
      return item.id
    })
  ).toEqual(['synthesize'])
  expect(resource.available).toBe(true)
  const configPath = '/resources/' + resource.id + '/configuration'
  const config = ResourceConfigurationSchema.parse(await (await request(configPath)).json())
  expect(config.definition?.quality.options).toEqual(['standard', 'high'])
  await request(configPath, 'PUT', {
    revision: config.revision,
    release: config.release,
    target: config.target,
    values: { ...config.values, quality: 'high' }
  })
  await request('/providers/' + providerId + '/registration', 'PUT', { revision: 4, enabled: false })
  const offline = RegistryViewSchema.parse(await (await request('/registry')).json())
  expect(
    offline.resources.find((item) => {
      return item.id === resource.id
    })?.available
  ).toBe(false)
  await request('/providers/' + providerId + '/registration', 'PUT', { revision: 5, enabled: true })
  await request('/providers/' + providerId + '/discovery', 'POST', { revision: 6 })
  const preserved = ResourceConfigurationSchema.parse(await (await request(configPath)).json())
  expect(preserved.values.quality).toBe('high')
  expect(
    harness.store.read().resources.filter((item) => {
      return item.id === resource.id
    })
  ).toHaveLength(1)
})
test('provider config changes discovery and marks removed resources stale while bindings fail closed', async () => {
  const configPath = '/providers/provider-comfy.main/configuration'
  let config = ResourceConfigurationSchema.parse(await (await request(configPath)).json())
  await request(configPath, 'PUT', {
    revision: config.revision,
    release: config.release,
    target: config.target,
    values: { ...config.values, collection: 'all-examples' }
  })
  await request('/providers/provider-comfy.main/discovery', 'POST', { revision: 2 })
  const resourceId = 'provider-comfy.main.illustration'
  expect(
    (
      await request('/presets/community/binding', 'PUT', {
        revision: 1,
        capabilityId: 'image.draw',
        operation: { resourceId, operationId: 'render' }
      })
    ).status
  ).toBe(200)
  config = ResourceConfigurationSchema.parse(await (await request(configPath)).json())
  await request(configPath, 'PUT', {
    revision: config.revision,
    release: config.release,
    target: config.target,
    values: { ...config.values, collection: 'reviewed' }
  })
  await request('/providers/provider-comfy.main/discovery', 'POST', { revision: 5 })
  const state = harness.store.read()
  expect(
    state.resources.find((item) => {
      return item.id === resourceId
    })?.state
  ).toBe('stale')
  const result = simulate(state, {
    presetId: 'community',
    capabilityId: 'image.draw',
    actorId: 'member',
    sceneId: 'direct',
    surface: 'tool',
    text: 'cat'
  })
  expect(result.executed).toBe(false)
  expect(result.context.authorization.reasons.join()).toContain('资源')
})
test('credentials are private, validated, preserved by keep, and persisted across reopening', async () => {
  const path = '/providers/provider-gsvi.main/configuration'
  let config = ResourceConfigurationSchema.parse(await (await request(path)).json())
  const marker = 'synthetic-test-secret-not-a-real-credential'
  const save = await request(path, 'PUT', {
    revision: config.revision,
    release: config.release,
    target: config.target,
    values: config.values,
    secrets: [{ path: '/apiKey', action: 'set', value: marker }]
  })
  expect(save.status).toBe(200)
  const body = await save.text()
  expect(body).not.toContain(marker)
  config = ResourceConfigurationSchema.parse(JSON.parse(body))
  const visible = await request(path + '/secrets', 'POST', { revision: config.revision, release: config.release, target: config.target })
  expect(visible.headers.get('Cache-Control')).toBe('no-store')
  expect(await visible.json()).toEqual({ '/apiKey': marker })
  expect((await request(path + '/secrets', 'POST', { revision: 'stale', release: config.release, target: config.target })).status).toBe(409)
  expect(
    config.secrets.find((secret) => {
      return secret.path === '/apiKey'
    })?.configured
  ).toBe(true)
  expect(
    (
      await request(path, 'PUT', {
        revision: config.revision,
        release: config.release,
        target: config.target,
        values: { ...config.values, version: 'unsupported' }
      })
    ).status
  ).toBe(400)
  expect(
    (
      await request(path, 'PUT', {
        revision: config.revision,
        release: config.release,
        target: config.target,
        values: { ...config.values, version: 'v2' }
      })
    ).status
  ).toBe(200)
  expect(await (await request('/snapshot')).text()).not.toContain(marker)
  expect(await (await request('/registry')).text()).not.toContain(marker)
  const reopened = await DemoStore.open(join(directory, 'state.json'), seedState)
  expect(reopened.read().providers[0].configuration.apiKey).toBe(marker)
  expect(reopened.read().providers[0].configuration.version).toBe('v2')
  expect((await stat(join(directory, 'state.json'))).mode & 0o777).toBe(0o600)
})
