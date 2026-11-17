import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { bodyLimit } from 'hono/body-limit'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import { join } from 'node:path'
import type { Configuration } from '../config/load'
import type { Coordinator } from '../runtime/coordinator'
import type { Scheduler } from '../scheduler/service'
import type { OneBotAdapter } from '../channels/onebot/adapter'
import { RoomSchema } from '../domain/message'
import { ScheduleInputSchema } from '../scheduler/definition'
import { ProviderEditor, ProviderEditError } from '../providers/editor'
import { registerProviderRoutes } from './provider-routes'
import { executionStatus } from '../execution/config'
import { OneBotSettings, OneBotSettingsError } from '../channels/onebot/settings'
import { registerOneBotRoutes } from './onebot-routes'
import { FrameworkEditor, SettingsEditError } from '../settings/editor'
import { registerFrameworkRoutes } from './framework-routes'
import { SettingsPatchSchema } from '../settings/schema'
import { localIdentity, identityForRoom } from '../permissions/identity'
import { captureAuthority } from '../permissions/authorize'
import type { ResourceEditor } from '../resources/editor'
import { registerResourceRoutes } from './resource-routes'
import type { JobService } from '../jobs/service'
import { registerJobRoutes } from './job-routes'
import { registerArtifactRoutes } from './artifact-routes'
import { registerMediaRoutes } from './media-routes'
import type { MediaService } from '../media/service'
import { ReplyReferenceSchema } from '../media/schema'
import type { PluginEditor } from '../plugins/editor'
import { registerPluginRoutes } from './plugin-routes'
import { registerStorageRoutes } from './storage-routes'
import { registerPluginConfigRoutes } from './plugin-config-routes'
import { PluginConfigurationEditor } from '../plugins/configuration/editor'
import { PluginInstaller } from '../plugins/install/service'
import { PluginMarket } from '../plugins/market/service'
import { registerPluginInstallRoutes } from './plugin-install-routes'
import { PluginConfigValidationError } from '../plugins/configuration/values'
import type { PluginRuntimeEditor } from '../plugins/runtime/editor'
import { registerPluginRuntimeRoutes } from './plugin-runtime-routes'
import { controlApp } from '../control/routes'
import { rejectPluginConsoleAccess } from './plugin-origin'

export interface HttpServices {
  configuration(): Configuration
  reload(): Promise<void>
  coordinator: Coordinator
  scheduler: Scheduler
  onebot: OneBotAdapter
  onebotSettings: OneBotSettings
  providerEditor: ProviderEditor
  frameworkEditor: FrameworkEditor
  resourceEditor: ResourceEditor
  jobs: JobService
  media: MediaService
  pluginEditor: PluginEditor
  pluginInstaller?: PluginInstaller
  pluginRuntimeEditor?: PluginRuntimeEditor
}

export function createHttpApp(services: HttpServices) {
  const app = new Hono()
  const { coordinator, scheduler, onebot } = services
  const store = coordinator.store
  app.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  app.use('/api/*', rejectPluginConsoleAccess)
  app.use('/api/*', (c, next) => {
    let maxSize = 128 * 1024
    if (c.req.method === 'POST' && c.req.path === '/api/resources/workflows') {
      maxSize = 600 * 1024
    }
    if (c.req.method === 'POST' && /^\/api\/rooms\/[^/]+\/media$/u.test(c.req.path)) {
      maxSize = 9 * 1024 * 1024
    }
    if (c.req.method === 'POST' && c.req.path === '/api/plugins/install/upload') {
      maxSize = 33 * 1024 * 1024
    }
    return bodyLimit({ maxSize })(c, next)
  })
  app.onError((error, c) => {
    if (error instanceof PluginConfigValidationError) {
      return c.json({ error: error.message, issues: error.issues }, 400)
    }
    if (error instanceof ProviderEditError) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof OneBotSettingsError) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof SettingsEditError) {
      return c.json({ error: error.message }, error.status)
    }
    return c.json({ error: services.configuration().catalog.redact(error.message) }, 400)
  })
  registerProviderRoutes(app, services.providerEditor, () => {
    coordinator.events.emit({ type: 'config' })
  })
  registerOneBotRoutes(app, services.onebotSettings, onebot)
  registerFrameworkRoutes(app, services.frameworkEditor, coordinator, services.configuration)
  registerResourceRoutes(app, services.resourceEditor, () => {
    coordinator.events.emit({ type: 'config' })
  })
  if (services.pluginRuntimeEditor) {
    registerPluginRuntimeRoutes(app, services.pluginRuntimeEditor, () => {
      coordinator.events.emit({ type: 'config' })
    })
  }
  registerJobRoutes(app, services.jobs, coordinator)
  const pluginInstaller =
    services.pluginInstaller ??
    new PluginInstaller(services.pluginEditor, () => {
      coordinator.events.emit({ type: 'config' })
    })
  registerPluginInstallRoutes(app, pluginInstaller, new PluginMarket(pluginInstaller), () => {
    coordinator.events.emit({ type: 'config' })
  })
  registerPluginConfigRoutes(
    app,
    new PluginConfigurationEditor(services.pluginEditor, services.frameworkEditor, coordinator),
    () => {
      coordinator.events.emit({ type: 'config' })
    }
  )
  // Reserve console endpoints before the single-instance PUT route.
  registerPluginRoutes(
    app,
    services.pluginEditor,
    () => {
      coordinator.events.emit({ type: 'config' })
    },
    coordinator.observations
  )
  if (coordinator.plugins) {
    registerStorageRoutes(app, services.configuration, coordinator.plugins)
  }
  registerArtifactRoutes(app, coordinator, services.configuration)
  registerMediaRoutes(app, coordinator, services.media)
  app.get('/health', (c) => {
    return c.json({ ok: true, service: 'pi-im-bot' })
  })
  app.get('/api/state', async (c) => {
    const config = services.configuration()
    return c.json({
      version: '0.1.0',
      execution: executionStatus(config.bot.agent.execution),
      agentRuntime: 'pi-durable',
      rooms: store.listRooms(),
      runs: store.listRuns(),
      schedules: store.listSchedules(),
      jobs: await services.jobs.repository.list(),
      providers: config.catalog.publicStatus(),
      onebot: onebot.status(),
      onebotSettings: await services.onebotSettings.read(),
      configFiles: {
        bot: join(config.configDir, 'bot.json'),
        providers: join(config.configDir, 'providers.json'),
        framework: join(config.configDir, 'framework.json')
      }
    })
  })
  app.post('/api/config/reload', async (c) => {
    await services.reload()
    coordinator.events.emit({ type: 'config' })
    return c.json({ ok: true })
  })
  app.post(
    '/api/rooms',
    sValidator(
      'json',
      z.object({ name: z.string().min(1).max(80), kind: z.enum(['group', 'direct']).default('group') })
    ),
    (c) => {
      const input = c.req.valid('json')
      return c.json(coordinator.createMockRoom(input.name, input.kind), 201)
    }
  )
  app.get('/api/rooms/:id', (c) => {
    const room = coordinator.requireRoom(c.req.param('id'))
    return c.json({
      room,
      messages: store.listMessages(room.id),
      runs: store.listRuns(room.id),
      traces: store.listTraces(room.id),
      outbound: store.listOutbound(room.id).map((operation) => {
        const { render: _render, renderAdmission: _admission, ...view } = operation
        return view
      }),
      conversations: store.listConversations(room.id),
      effective: coordinator.effective(room.id)
    })
  })
  app.patch(
    '/api/rooms/:id',
    sValidator(
      'json',
      z.object({
        name: z.string().min(1).max(80).optional(),
        mode: z.enum(['demo', 'live']).optional(),
        settings: SettingsPatchSchema.optional(),
        revision: z.number().int()
      })
    ),
    async (c) => {
      return services.frameworkEditor.exclusive(async () => {
        const room = coordinator.requireRoom(c.req.param('id'))
        const update = c.req.valid('json')
        if (update.revision !== room.revision) {
          throw new SettingsEditError('聊天设置已变化，请刷新后重试。', 409)
        }
        const next = RoomSchema.parse({
          ...room,
          ...update,
          revision: room.revision + 1,
          updatedAt: Date.now()
        })
        services.frameworkEditor.validate(services.configuration().framework, next)
        if (next.mode !== room.mode) {
          coordinator.stop(room.id)
        }
        store.saveRoom(next)
        coordinator.events.emit({ type: 'room', room: next })
        coordinator.events.emit({ type: 'config' })
        return c.json(next)
      })
    }
  )
  app.post(
    '/api/rooms/:id/messages',
    sValidator(
      'json',
      z
        .object({
          text: z.string().trim().max(20000).default(''),
          mediaIds: z.array(z.uuid()).max(12).default([]),
          replyTo: ReplyReferenceSchema.optional(),
          actorId: z.string().min(1).max(80).default('developer'),
          actorName: z.string().min(1).max(80).default('开发者')
        })
        .refine((input) => {
          return input.text.length > 0 || input.mediaIds.length > 0
        }, '消息和附件不能同时为空')
    ),
    async (c) => {
      const input = c.req.valid('json')
      const run = await coordinator.receive(
        c.req.param('id'),
        input.text,
        input.actorId,
        input.actorName,
        input.mediaIds,
        input.replyTo
      )
      return c.json({ run }, 202)
    }
  )
  app.post('/api/rooms/:id/stop', (c) => {
    return c.json({ cancelled: coordinator.stop(c.req.param('id')) })
  })
  app.post('/api/rooms/:id/new', async (c) => {
    await coordinator.receive(c.req.param('id'), '/new')
    return c.json({ ok: true })
  })
  app.post('/api/rooms/:id/recall', sValidator('json', z.object({ messageId: z.string() })), async (c) => {
    await coordinator.delivery.recall(
      coordinator.requireRoom(c.req.param('id')),
      c.req.valid('json').messageId
    )
    return c.json({ ok: true })
  })
  app.post('/api/schedules', sValidator('json', ScheduleInputSchema), (c) => {
    const input = c.req.valid('json')
    const room = coordinator.requireRoom(input.roomId)
    const effective = coordinator.effective(room.id)
    const authority = captureAuthority(
      effective,
      [identityForRoom(localIdentity('web', 'operator'), room.address)],
      undefined,
      services.configuration().resources.capabilityIds(effective.settings)
    )
    return c.json(scheduler.save(input, authority), 201)
  })
  app.post('/api/schedules/:id/run', async (c) => {
    return c.json(await scheduler.run(c.req.param('id')), 202)
  })
  app.patch(
    '/api/schedules/:id',
    sValidator('json', z.object({ enabled: z.boolean(), revision: z.number().int().positive() })),
    (c) => {
      const input = c.req.valid('json')
      return c.json(scheduler.setEnabled(c.req.param('id'), input.enabled, input.revision))
    }
  )
  app.post('/api/schedules/:id/stop', async (c) => {
    await scheduler.stopOccurrence(c.req.param('id'))
    return c.json({ ok: true }, 202)
  })
  app.post('/api/schedules/:id/authorize', (c) => {
    const schedule = store.listSchedules().find((item) => {
      return item.id === c.req.param('id')
    })
    if (!schedule) {
      throw new Error('计划任务不存在')
    }
    const effective = coordinator.effective(schedule.roomId)
    schedule.authority = captureAuthority(
      effective,
      [identityForRoom(localIdentity('web', 'operator'), coordinator.requireRoom(schedule.roomId).address)],
      undefined,
      services.configuration().resources.capabilityIds(effective.settings)
    )
    schedule.revision += 1
    store.saveSchedule(schedule)
    coordinator.events.emit({ type: 'schedules', schedules: store.listSchedules() })
    return c.json(schedule)
  })
  app.delete('/api/schedules/:id', async (c) => {
    await scheduler.remove(c.req.param('id'))
    return c.json({ ok: true })
  })
  app.route('/api/control', controlApp(services))
  const webRoot = process.env.BOT_WEB_DIR ?? './dist'
  app.use('/*', serveStatic({ root: webRoot }))
  app.get('/', serveStatic({ path: join(webRoot, 'index.html') }))
  return app
}
