import { namedService, serviceRevision } from '../services/resources'
import { registerHtmlRender } from './render-rpc'
import { registerConfigFiles } from './configuration/file-rpc'
import { readConfigPath } from '../resource-providers/projection'
import { registerModelAnalysis } from './model-rpc'
import { registerPluginState } from './state/rpc'
import { registerComfy } from './comfy-rpc'
import type { PluginManagedServices } from './managed'
import type { PluginAction } from './rpc/protocol'
import { z } from 'zod'
import { ArtifactStore } from '../artifacts/store'
import { PluginHostServices } from './rpc/services'
import type { PluginInvocation } from './invocation'
import type { PluginBinding } from './registry'
import { pluginArtifactStoreOwner } from './result'
import { registerPluginConnectors } from './connectors'
import { registerPluginOperations, type PluginOperationCallSchema } from './operations-rpc'
import { PluginPathSchema } from './manifest'
import type { FileHandle } from 'node:fs/promises'
import { registerPluginPoints } from './points'
import { collectRuntimeStatus } from '../runtime/status/collect'
import { registerPluginMedia } from './media-rpc'
import { registerPluginServices } from './service-rpc'
import { gsviExecutionRevision } from '../services/gsvi/identity'
import { reserveMediaSources } from '../media/dependencies'
import type { ArtifactAccess } from '../artifacts/access'
import { SendMessageInputSchema, logicalMessages } from '../domain/logical-message'
import { sendLogicalSequence } from '../runtime/logical-send'
import { ResourceHttpRequestSchema, resourceHttpRequest } from '../resource-providers/http'
import { mergeConfig } from './configuration/values'
import { registerResourceBindings } from '../resource-providers/plugin-rpc'
import type { Configuration } from '../config/load'

export function pluginHostServices(
  invocation: PluginInvocation,
  binding: PluginBinding,
  callId: string,
  authorizeGrant: (grant: string) => void,
  operations?: {
    grants: readonly string[]
    invoke(
      grant: string,
      input: z.infer<typeof PluginOperationCallSchema>,
      signal: AbortSignal
    ): Promise<unknown>
  },
  openFile?: (path: string) => Promise<FileHandle>,
  point?: (
    grant: string,
    value: Record<string, z.infer<ReturnType<typeof z.json>>>,
    sequence: number,
    signal: AbortSignal
  ) => Promise<unknown>,
  managed?: PluginManagedServices,
  phase: PluginAction['phase'] = 'execute',
  current: () => Configuration = () => {
    return invocation.config
  }
) {
  const host = new PluginHostServices()
  host.register(
    'configuration.patch',
    'configuration.write',
    z.object({ values: z.record(z.string(), z.json()) }).strict(),
    async (input) => {
      if (invocation.readOnly || !managed?.configuration) {
        throw new Error('此上下文不允许修改插件配置')
      }
      authorizeGrant('configuration.write')
      await managed.configuration.patch(binding.instance.id, binding.bundle.revision, input.values)
      return { saved: true }
    }
  )
  const verifyResources = registerResourceBindings(
    host,
    invocation,
    binding,
    callId,
    authorizeGrant,
    current,
    managed?.resources,
    phase
  )
  const http = binding.bundle.manifest.resourceProvider?.http
  if (http) {
    host.register('resource.http', 'resource.http', ResourceHttpRequestSchema, async (input, context) => {
      if (invocation.readOnly && input.method !== 'GET') {
        throw new Error('只读调用仅允许资源 HTTP GET')
      }
      checkGrant('resource.http')
      invocation.services.assertActive?.()
      const settings = mergeConfig(
        binding.instance.settings,
        invocation.input.context.effective.settings.extensions.settings[binding.instance.id] ?? {},
        binding.bundle.configuration
      )
      const selected = invocation.config.resources.config.provided.find((entry) => {
        return entry.id === invocation.input.context.resourceId && entry.providerId === binding.instance.id
      })
      let configuration = settings
      if (selected) {
        configuration = mergeConfig(
          settings,
          selected.configuration,
          binding.bundle.manifest.resourceProvider?.resourceSchema
        )
      }
      const result = await resourceHttpRequest(http, configuration, input, context.signal)
      checkGrant('resource.http')
      return result
    })
  }
  const sources = invocation.services.mediaSources ?? new Set<string>()
  const usedCapabilities = new Set<string>()
  const usedGrants = new Set<string>()
  const access = () => {
    const services: NonNullable<ArtifactAccess['plugin']>['services'] = {}
    for (const capability of usedCapabilities) {
      invocation.services.authorize(capability)
    }
    for (const grant of usedGrants) {
      authorizeGrant(grant)
      if (grant.startsWith('service:')) {
        const alias = grant.slice(8)
        const id = binding.instance.services[alias]
        const service = namedService(invocation.config, id)
        if (!service) {
          throw new Error('具名服务已不可用')
        }
        services[alias] = { id, revision: serviceRevision(service) }
      }
    }
    for (const id of sources) {
      invocation.services.authorize('media_read')
      const media = invocation.services.media
      if (!media) {
        throw new Error('入站媒体服务未配置')
      }
      media.require(id)
    }
    const capabilities = new Set(usedCapabilities)
    if (sources.size) {
      capabilities.add('media_read')
    }
    return {
      mediaIds: [...sources],
      capabilities: [...capabilities],
      plugin: { instanceId: binding.instance.id, grants: [...usedGrants], services }
    }
  }
  host.validateResult = () => {
    verifyResources()
    access()
  }
  host.register('system.status', 'system.status', z.object({}).strict(), async (_input, context) => {
    invocation.services.authorize('runtime_status')
    const snapshot = await collectRuntimeStatus(invocation.config)
    const identity = await invocation.services.identity?.().catch(() => {
      return undefined
    })
    snapshot.bot.name = identity || invocation.room.address.accountId || snapshot.bot.name
    context.signal.throwIfAborted()
    authorizeGrant('system.status')
    invocation.services.authorize('runtime_status')
    usedGrants.add('system.status')
    usedCapabilities.add('runtime_status')
    return snapshot
  })
  registerPluginState(host, invocation, binding, managed, authorizeGrant, current)
  const artifacts = new ArtifactStore(
    invocation.config.dataDir,
    invocation.room.id,
    pluginArtifactStoreOwner(invocation.input.context),
    'plugin:' + binding.instance.id,
    access,
    (dependency) => {
      if (dependency.mediaIds.length) {
        checkGrant('media.read')
        reserveMediaSources(sources, dependency.mediaIds)
        access()
      }
    }
  )
  const checkGrant = (grant: string) => {
    authorizeGrant(grant)
    usedGrants.add(grant)
  }
  host.register(
    'delivery.configured',
    'delivery.configured',
    z
      .object({ field: z.string().max(200), text: z.string().max(12000), key: z.string().min(1).max(150) })
      .strict(),
    async (input, context) => {
      checkGrant('delivery.configured')
      if (
        invocation.readOnly ||
        !binding.bundle.manifest.deliveryTargets.includes(input.field) ||
        !invocation.services.configuredDelivery
      ) {
        throw new Error('未声明或不可用的配置目标交付')
      }
      const settings = mergeConfig(
        binding.instance.settings,
        invocation.input.context.effective.settings.extensions.settings[binding.instance.id] ?? {},
        binding.bundle.configuration
      )
      const target = z.string().min(1).parse(readConfigPath(settings, input.field))
      context.signal.throwIfAborted()
      await invocation.services.configuredDelivery(binding.instance.id, target, input.text, input.key)
      checkGrant('delivery.configured')
      return { delivered: true }
    }
  )
  registerConfigFiles(host, invocation, binding, checkGrant)
  registerModelAnalysis(host, invocation, artifacts, binding.instance.id, checkGrant)
  registerPluginMedia(
    host,
    invocation,
    () => {
      invocation.services.authorize('media_read')
      checkGrant('media.read')
      usedCapabilities.add('media_read')
    },
    sources
  )
  registerComfy(host, invocation, binding, artifacts, checkGrant, usedCapabilities, managed, phase)
  registerPluginServices(host, invocation, binding, artifacts, checkGrant, usedCapabilities, phase)
  registerPluginConnectors(host, invocation, binding, artifacts, callId)
  if (operations) {
    registerPluginOperations(host, operations.grants, operations.invoke)
    if (point) {
      registerPluginPoints(host, operations.grants, point)
    }
  }
  let publishedBytes = 0
  let publishedCount = 0
  host.register(
    'history.read',
    'history.read',
    z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
    async (input) => {
      invocation.services.authorize('chat_history')
      return invocation.services.history(input.limit)
    }
  )
  host.register(
    'artifact.read',
    'artifact.read',
    z
      .object({
        id: z.uuid(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(196608).default(65536)
      })
      .strict(),
    async (input, context) => {
      checkGrant('artifact.read')
      invocation.services.authorize('artifact_read')
      usedCapabilities.add('artifact_read')
      const artifact = await artifacts.content(input.id)
      const bytes = new Uint8Array(
        await artifact.file.slice(input.offset, input.offset + input.limit).arrayBuffer()
      )
      context.signal.throwIfAborted()
      access()
      return {
        id: input.id,
        mimeType: artifact.metadata.mimeType,
        bytes: artifact.metadata.bytes,
        offset: input.offset,
        base64: Buffer.from(bytes).toString('base64'),
        hasMore: input.offset + bytes.length < artifact.metadata.bytes
      }
    }
  )
  host.register(
    'artifact.write',
    'artifact.write',
    z
      .object({
        name: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(100),
        encoding: z.enum(['text', 'base64']),
        data: z.string().max(300000)
      })
      .strict(),
    async (input, context) => {
      checkGrant('artifact.write')
      let bytes = Buffer.from(input.data)
      if (input.encoding === 'base64') {
        bytes = Buffer.from(input.data, 'base64')
      }
      publishedBytes += bytes.length
      publishedCount += 1
      if (publishedBytes > 8 * 1024 * 1024 || publishedCount > 12) {
        throw new Error('插件本次产物额度已用完')
      }
      context.signal.throwIfAborted()
      const artifact = await artifacts.save(
        input.name,
        input.mimeType,
        'plugin:' + binding.instance.id,
        bytes
      )
      return { id: artifact.id, name: artifact.name, mimeType: artifact.mimeType, bytes: artifact.bytes }
    }
  )
  let sends = 0
  if (openFile) {
    registerHtmlRender(host, openFile, artifacts, binding.instance.id, checkGrant, managed?.renderHtml)
    host.register(
      'artifact.publish',
      'artifact.write',
      z
        .object({
          path: PluginPathSchema,
          name: z.string().min(1).max(240).optional(),
          mimeType: z.string().min(1).max(100).default('application/octet-stream')
        })
        .strict(),
      async (input, context) => {
        checkGrant('artifact.write')
        context.signal.throwIfAborted()
        const file = await openFile(input.path)
        try {
          const artifact = await artifacts.saveFile(
            input.name ?? input.path.split('/').at(-1)!,
            input.mimeType,
            'plugin:' + binding.instance.id,
            file,
            context.signal
          )
          return {
            id: artifact.id,
            name: artifact.name,
            mimeType: artifact.mimeType,
            bytes: artifact.bytes,
            sha256: artifact.sha256
          }
        } finally {
          await file.close()
        }
      }
    )
  }
  if (invocation.services.recall) {
    const recall = invocation.services.recall
    host.register(
      'delivery.recall',
      'delivery.recall',
      z.object({ messageId: z.uuid(), delayMs: z.number().int().min(0).max(86400000).default(0) }).strict(),
      async (input, context) => {
        context.signal.throwIfAborted()
        invocation.services.authorize('message_recall')
        return recall(input.messageId, input.delayMs)
      }
    )
  }
  host.register('delivery.send', 'delivery.send', SendMessageInputSchema, async (input, context) => {
    invocation.services.authorize('chat_send')
    context.signal.throwIfAborted()
    const parts = logicalMessages(input)
    const first = sends
    sends += parts.length
    if (sends > 8) {
      throw new Error('插件本次直接消息额度已用完')
    }
    const check = () => {
      context.signal.throwIfAborted()
      authorizeGrant('delivery.send')
      invocation.services.authorize('chat_send')
    }
    const send = (part: (typeof parts)[number], index: number) => {
      return invocation.services.send(
        part.text,
        callId + ':plugin:' + (first + index + 1),
        part.artifactIds,
        check,
        { signal: context.signal, deadlineAt: context.invocation.deadlineAt }
      )
    }
    if ('messages' in input) {
      return sendLogicalSequence(parts, send, check)
    }
    const message = await send(parts[0], 0)
    return { id: message.id, platformMessageIds: message.platformMessageIds }
  })
  return host
}
