import { resolve, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { loadConfiguration } from './config/load'
import { StateStore } from './storage/state'
import { EventHub } from './runtime/events'
import { ChannelRegistry } from './channels/registry'
import { createMockAdapter } from './channels/mock'
import { OneBotAdapter } from './channels/onebot/adapter'
import { DeliveryService } from './runtime/delivery'
import { Coordinator } from './runtime/coordinator'
import { Scheduler } from './scheduler/service'
import { createHttpApp } from './http/app'
import { addressKey } from './domain/message'
import { ProviderEditor } from './providers/editor'
import { OneBotSettings } from './channels/onebot/settings'
import { extractPrompt } from './runtime/trigger'
import { FrameworkEditor, providerReferences } from './settings/editor'
import { ConfigurationMutations } from './config/mutations'
import { ResourceEditor } from './resources/editor'
import { resourceReferences } from './resources/references'
import { RuntimeOwner } from './storage/owner'
import { DurableAgentRuntime } from './agent/durable/runtime'
import { BunSqliteDatabase } from './storage/durable-sqlite'
import { SqliteStorage } from '@earendil-works/pi-durable/storage/sqlite'
import { JobService } from './jobs/service'
import { ArtifactStore } from './artifacts/store'
import { MediaService } from './media/service'
import { PluginWorkerManager } from './plugins/runtime/manager'
import { PluginService } from './plugins/service'
import { PluginTimers } from './plugins/timers'
import { PluginEditor } from './plugins/editor'
import { revision } from './settings/resolve'
import { configureArtifacts } from './artifacts/quota'
import { PluginInstaller } from './plugins/install/service'
import { PluginRuntimeEditor } from './plugins/runtime/editor'
import { pluginOriginHeader } from './http/plugin-origin'

interface UiSocketData {
  kind: 'ui'
  unsubscribe?: () => void
}
interface OneBotSocketData {
  kind: 'onebot'
  selfId: string
  revision: string
}
type SocketData = UiSocketData | OneBotSocketData

const projectDir = resolve(import.meta.dir, '..')
const webDir = resolve(process.env.BOT_WEB_DIR ?? join(projectDir, 'dist'))
if (!(await Bun.file(join(webDir, 'index.html')).exists())) {
  throw new Error('Dashboard assets are missing. Run bun run build before starting the Bot.')
}
process.env.BOT_WEB_DIR = webDir
const dataDir = resolve(process.env.BOT_DATA_DIR ?? join(projectDir, 'data'))
await mkdir(dataDir, { recursive: true })
const owner = new RuntimeOwner(dataDir)
let configuration = await loadConfiguration(projectDir)
configureArtifacts(configuration.dataDir, configuration.bot.artifacts)
process.env.PI_CODING_AGENT_DIR = join(configuration.dataDir, 'pi-agent')
const store = new StateStore(configuration.dataDir)
const events = new EventHub()
const channels = new ChannelRegistry()
channels.register(createMockAdapter())
const delivery = new DeliveryService(channels, store, events, (roomId) => {
  return new ArtifactStore(configuration.dataDir, roomId)
})
const coordinator = new Coordinator(
  () => {
    return configuration
  },
  store,
  events,
  delivery
)
const media = new MediaService(configuration.dataDir, store, channels)
const pluginWorkers = new PluginWorkerManager(
  projectDir,
  configuration.bot.plugins,
  undefined,
  configuration.dataDir
)
await pluginWorkers.start()
coordinator.plugins = new PluginService(() => {
  return configuration
}, pluginWorkers)
coordinator.attachMedia(media)
const scheduler = new Scheduler(store, coordinator)
coordinator.attachScheduler(scheduler)
const onebot = new OneBotAdapter(
  () => {
    return configuration.bot.onebot
  },
  events,
  async (message) => {
    const room = store.listRooms().find((candidate) => {
      return addressKey(candidate.address) === addressKey(message.address)
    })
    if (!room) {
      return 'unmatched'
    }
    return coordinator.receiveIncoming(
      room.id,
      message,
      extractPrompt(message.text, configuration.bot.onebot.commandPrefix, message.address.accountId)
    )
  },
  (address, platformId) => {
    coordinator.receiveRecall(address, platformId)
  }
)
channels.register(onebot)
coordinator.syncOneBotRooms()
coordinator.ensureMockRoom()
const durable = new DurableAgentRuntime(() => {
  return configuration.bot.agent.maxConcurrentRuns
})
coordinator.attachDurable(durable)
const jobs = new JobService(durable, coordinator)
coordinator.attachJobs(jobs)
await coordinator.prepareRecovery()
await durable.open(
  await SqliteStorage.open(new BunSqliteDatabase(join(configuration.dataDir, 'agent.sqlite')))
)
coordinator.resumeRecovery()
scheduler.start()
const pluginTimers = new PluginTimers(
  () => {
    return configuration
  },
  coordinator.plugins,
  coordinator
)
pluginTimers.start()
const configMutations = new ConfigurationMutations()
const providerEditor = new ProviderEditor(
  {
    configuration: () => {
      return configuration
    },
    apply(catalog) {
      configuration = { ...configuration, catalog }
    },
    groupUsage() {
      return providerReferences(configuration.framework, store.listRooms(), store.listConversations())
    }
  },
  configMutations
)
const frameworkEditor = new FrameworkEditor(
  () => {
    return configuration
  },
  store,
  (framework) => {
    configuration = { ...configuration, framework }
  },
  configMutations
)
frameworkEditor.validate(configuration.framework)
const resourceEditor = new ResourceEditor(
  () => {
    return configuration
  },
  (resources) => {
    configuration = { ...configuration, resources }
    coordinator.plugins?.configurationChanged()
  },
  configMutations,
  (kind, id) => {
    return resourceReferences(configuration, store, kind, id)
  }
)
const onebotSettings = new OneBotSettings(configuration.configDir, (bot) => {
  const previous = configuration.bot.onebot
  configuration = { ...configuration, bot }
  configureArtifacts(configuration.dataDir, bot.artifacts)
  onebot.reconfigure(previous)
  coordinator.syncOneBotRooms()
  events.emit({ type: 'config' })
})
const pluginEditor = new PluginEditor(
  () => {
    return configuration
  },
  (resources) => {
    configuration = { ...configuration, resources }
    coordinator.plugins?.configurationChanged()
  },
  configMutations,
  (resources) => {
    frameworkEditor.validate(configuration.framework, undefined, undefined, configuration.catalog, resources)
  },
  (id) => {
    return resourceReferences(configuration, store, 'plugin', id)
  }
)
if (coordinator.plugins?.managed) {
  if (coordinator.plugins.managed.resources) {
    coordinator.plugins.managed.resources.optionsChanged = (id) => {
      pluginEditor.resourceOptions.resourceChanged(id)
    }
  }
  coordinator.plugins.managed.configuration = {
    patch: (id, release, patch) => {
      return pluginEditor.patchOwnSettings(id, release, patch)
    }
  }
}
const pluginInstaller = new PluginInstaller(pluginEditor, () => {
  events.emit({ type: 'config' })
})
await pluginEditor.initializeGsviConfiguration()
const app = createHttpApp({
  configuration: () => {
    return configuration
  },
  coordinator,
  scheduler,
  onebot,
  onebotSettings,
  providerEditor,
  frameworkEditor,
  resourceEditor,
  pluginEditor,
  pluginInstaller,
  pluginRuntimeEditor: new PluginRuntimeEditor(
    () => {
      return configuration
    },
    coordinator.plugins,
    configMutations
  ),
  jobs,
  media,
  async reload() {
    await onebotSettings.exclusive(async () => {
      await configMutations.exclusive(async () => {
        const previous = configuration.bot.onebot
        const next = await loadConfiguration(projectDir)
        if (revision(next.bot.plugins) !== revision(configuration.bot.plugins)) {
          throw new Error('插件执行后端配置已变化，需要重启 Bot 后应用')
        }
        frameworkEditor.validate(next.framework, undefined, undefined, next.catalog, next.resources)
        configuration = next
        configureArtifacts(configuration.dataDir, configuration.bot.artifacts)
        coordinator.plugins?.configurationChanged()
        onebot.reconfigure(previous)
        coordinator.syncOneBotRooms()
      })
    })
  }
})

let research: Awaited<ReturnType<typeof import('../preview/server/routes').createResearchApp>> | undefined
if (process.env.BOT_PREVIEW_RESEARCH === '1') {
  const { createResearchApp } = await import('../preview/server/routes')
  research = await createResearchApp(join(configuration.dataDir, 'research-state.json'))
}

const server = Bun.serve<SocketData>({
  hostname: configuration.bot.server.host,
  port: configuration.bot.server.port,
  idleTimeout: 120,
  fetch(request, server) {
    if (request.headers.has(pluginOriginHeader)) {
      return Response.json({ error: '插件管理请求必须使用有范围的 RPC' }, { status: 403 })
    }
    const path = new URL(request.url).pathname
    if (research && path.startsWith('/api/research/')) {
      return research.app.fetch(request)
    }
    if (path === '/api/events') {
      if (server.upgrade(request, { data: { kind: 'ui' } })) {
        return
      }
      return new Response('WebSocket upgrade required', { status: 426 })
    }
    if (path === configuration.bot.onebot.path) {
      const auth = onebot.authorize(request)
      if (!auth.ok) {
        return new Response(auth.reason, { status: auth.status })
      }
      if (
        server.upgrade(request, { data: { kind: 'onebot', selfId: auth.selfId, revision: auth.revision } })
      ) {
        return
      }
      return new Response('WebSocket upgrade required', { status: 426 })
    }
    return app.fetch(request)
  },
  websocket: {
    maxPayloadLength: 1024 * 1024,
    open(socket) {
      if (socket.data.kind === 'onebot') {
        onebot.connect(socket.data.selfId, socket, socket.data.revision)
      } else {
        socket.data.unsubscribe = events.subscribe((event) => {
          if (socket.getBufferedAmount() > 1024 * 1024) {
            socket.close(1013, 'Client too slow')
            return
          }
          socket.send(JSON.stringify(event))
        })
      }
    },
    message(socket, data) {
      if (socket.data.kind === 'onebot') {
        void onebot.message(socket.data.selfId, String(data), socket).catch((error) => {
          console.warn('OneBot event rejected:', configuration.catalog.redact(String(error)))
        })
      }
    },
    close(socket) {
      if (socket.data.kind === 'onebot') {
        onebot.disconnect(socket.data.selfId, socket)
      } else {
        socket.data.unsubscribe?.()
      }
    }
  }
})
console.log(`Pi IM Bot listening: ${configuration.bot.server.host}:${server.port}`)
console.log(`Local workbench: http://localhost:${server.port}`)
console.log(`Provider configuration: ${join(configuration.configDir, 'providers.json')}`)
let closing = false
async function shutdown() {
  if (closing) {
    return
  }
  closing = true
  await pluginTimers.close()
  await scheduler.stop()
  onebot.close()
  await coordinator.shutdown()
  await pluginInstaller.close()
  await pluginEditor.gsviRefresh.close()
  await pluginEditor.resourceOptions.close()
  await coordinator.plugins?.manager.close()
  await server.stop(true)
  store.close()
  owner.close()
  process.exit(0)
}
process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})
