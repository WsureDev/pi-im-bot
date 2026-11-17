import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import { PluginConfigValidationError } from '../../src/plugins/configuration/values'
import { SaveFlowSchema } from '../contracts/flow'
import { SavePoliciesSchema } from '../contracts/capabilities'
import { DemoSnapshotSchema } from '../contracts/presets'
import { SaveResourceConfigurationSchema } from '../contracts/resources'
import { SimulationInputSchema } from '../contracts/context'
import { capabilities, actors, scenes } from '../fixtures/catalog'
import { DemoStore, requirePreset, requireRevision } from './state'
import { seedState } from './seed'
import { DemoError } from './errors'
import { flowView, saveFlow } from './flow'
import {
  registryView,
  provider,
  discover,
  configurationView,
  saveConfiguration,
  requireResource,
  resourceAvailable
} from './registry'
import { simulate } from './permissions'
import { InvokeOperationSchema, OperationReferenceSchema } from '../contracts/operations'
import { OperationRunner, resolveOperation, validateOperation } from './operations'
import { providerModules } from '../providers/catalog'
import { ReadConfigSecretsSchema } from '../../src/plugins/configuration/secret-editor'
import { configurationSecrets } from './registry'

const ToggleSchema = z.object({ revision: z.number().int(), enabled: z.boolean() }).strict()
const RevisionSchema = z.object({ revision: z.number().int() }).strict()
const BindingSchema = z
  .object({
    revision: z.number().int(),
    capabilityId: z.string(),
    operation: OperationReferenceSchema.nullable()
  })
  .strict()

export async function createResearchApp(path: string) {
  const store = await DemoStore.open(path, seedState)
  const runner = new OperationRunner()
  for (const module of providerModules) {
    for (const operation of module.declaration.operations) {
      validateOperation(operation)
    }
  }
  const app = new Hono().basePath('/api/research')
  app.use('*', bodyLimit({ maxSize: 256 * 1024 }))
  app.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  app.onError((error, c) => {
    if (error instanceof DemoError) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof PluginConfigValidationError) {
      return c.json({ error: error.message, issues: error.issues }, 400)
    }
    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: '输入不符合声明的接口',
          issues: error.issues.map((issue) => {
            return { path: issue.path.join('.'), message: issue.message }
          })
        },
        400
      )
    }
    return c.json({ error: '操作失败，请检查声明和配置。' }, 400)
  })
  app.get('/snapshot', (c) => {
    const state = store.read()
    return c.json(
      DemoSnapshotSchema.parse({
        demo: true,
        revision: state.revision,
        defaultPresetId: state.defaultPresetId,
        presets: state.presets,
        plugins: state.plugins,
        capabilities
      })
    )
  })
  for (const route of ['/presets/:presetId/flow', '/presets/:presetId/plugins/:pluginId/flow']) {
    app.get(route, (c) => {
      return c.json(flowView(store.read(), c.req.param('presetId')!, c.req.param('pluginId')))
    })
    app.put(route, sValidator('json', SaveFlowSchema), async (c) => {
      await store.change((state) => {
        saveFlow(state, c.req.param('presetId')!, c.req.valid('json'), c.req.param('pluginId'))
      })
      return c.json(flowView(store.read(), c.req.param('presetId')!, c.req.param('pluginId')))
    })
  }
  app.put('/presets/:id/policies', sValidator('json', SavePoliciesSchema), async (c) => {
    const input = c.req.valid('json')
    await store.change((state) => {
      const preset = requirePreset(state, c.req.param('id'))
      requireRevision(preset.revision, input.revision)
      for (const [id, policy] of Object.entries(input.policies)) {
        if (
          !capabilities.some((item) => {
            return item.id === id
          })
        ) {
          throw new DemoError('未知能力：' + id)
        }
        preset.policies[id] = policy
      }
      preset.revision += 1
    })
    return c.json({ ok: true })
  })
  app.get('/registry', (c) => {
    return c.json(registryView(store.read()))
  })
  app.post('/operations/invoke', sValidator('json', InvokeOperationSchema), async (c) => {
    return c.json(await runner.invoke(store.read(), c.req.valid('json'), c.req.raw.signal))
  })
  app.put('/providers/:id/registration', sValidator('json', ToggleSchema), async (c) => {
    const input = c.req.valid('json')
    await store.change((state) => {
      requireRevision(state.revision, input.revision)
      const declaration = provider(c.req.param('id')).declaration
      state.plugins.find((item) => {
        return item.id === declaration.pluginId
      })!.active = input.enabled
    })
    return c.json(registryView(store.read()))
  })
  app.post('/providers/:id/discovery', sValidator('json', RevisionSchema), async (c) => {
    await store.change(async (state) => {
      requireRevision(state.revision, c.req.valid('json').revision)
      await discover(state, c.req.param('id'))
    })
    return c.json(registryView(store.read()))
  })
  for (const kind of ['provider', 'resource'] as const) {
    app.post('/' + kind + 's/:id/configuration/secrets', sValidator('json', ReadConfigSecretsSchema), (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(configurationSecrets(store.read(), kind, c.req.param('id')!, c.req.valid('json')))
    })
    app.get('/' + kind + 's/:id/configuration', (c) => {
      return c.json(configurationView(store.read(), kind, c.req.param('id')!))
    })
    app.put(
      '/' + kind + 's/:id/configuration',
      sValidator('json', SaveResourceConfigurationSchema),
      async (c) => {
        await store.change((state) => {
          saveConfiguration(state, kind, c.req.param('id')!, c.req.valid('json'))
        })
        return c.json(configurationView(store.read(), kind, c.req.param('id')!))
      }
    )
  }
  app.put('/resources/:id/enabled', sValidator('json', ToggleSchema), async (c) => {
    await store.change((state) => {
      requireRevision(state.revision, c.req.valid('json').revision)
      requireResource(state, c.req.param('id')).enabled = c.req.valid('json').enabled
    })
    return c.json(registryView(store.read()))
  })
  app.put('/presets/:id/binding', sValidator('json', BindingSchema), async (c) => {
    const input = c.req.valid('json')
    await store.change((state) => {
      const preset = requirePreset(state, c.req.param('id'))
      requireRevision(preset.revision, input.revision)
      if (
        !capabilities.some((item) => {
          return item.id === input.capabilityId && item.defaultOperation
        })
      ) {
        throw new DemoError('入口不存在或没有声明外部操作绑定')
      }
      if (!input.operation) {
        delete preset.bindings[input.capabilityId]
      } else {
        resolveOperation(state, input.operation)
        preset.bindings[input.capabilityId] = input.operation
      }
      preset.revision += 1
    })
    return c.json({ ok: true })
  })
  app.get('/fixtures', (c) => {
    return c.json({ actors, scenes })
  })
  app.post('/simulate', sValidator('json', SimulationInputSchema), async (c) => {
    return c.json(
      await store.change((state) => {
        return simulate(state, c.req.valid('json'))
      })
    )
  })
  return { app, store }
}
