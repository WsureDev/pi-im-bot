import type { Configuration } from '../config/load'
import type { Room } from '../domain/message'
import type { PreparedRunInput } from '../domain/run'
import type { HostToolServices } from '../agent/services'
import type { PluginOperationEntry, PluginBinding } from './registry'
import { pluginOperationId, pluginToolName } from './identity'
import { revision } from '../settings/resolve'
import { PluginInvocationViewSchema, type PluginInvocationView } from './rpc/protocol'
import { mergeConfig, validateConfig } from './configuration/values'
import { gsviWorkerDefinition, gsviBusinessValues } from '../services/gsvi/plugin-config/definition'
import { triggerRoles } from '../permissions/capability-policy'
import { resourceWorkerDefinition, resourceWorkerValues } from '../resource-providers/projection'

export interface PluginInvocation {
  invokedCapabilities?: readonly string[]
  deadlineAt?: number
  readOnly?: boolean
  origin?: PluginInvocationView['origin']
  config: Configuration
  room: Room
  input: PreparedRunInput
  services: Pick<
    HostToolServices,
    | 'configuredDelivery'
    | 'identity'
    | 'authorize'
    | 'history'
    | 'send'
    | 'assertActive'
    | 'recall'
    | 'mediaSources'
  > & {
    media?: {
      content: NonNullable<HostToolServices['media']>['content']
      require(id: string): unknown
    }
  }
}

export function pluginOperations(config: Configuration, input: PreparedRunInput): PluginOperationEntry[] {
  return config.resources.plugins(input.context.effective.settings).flatMap((binding) => {
    return binding.bundle.manifest.operations.map((operation) => {
      return {
        ...binding,
        operation,
        capabilityId: pluginOperationId(binding.instance.id, operation.id),
        modelName: pluginToolName(binding.instance.id, operation.id)
      }
    })
  })
}

export function pluginInvocationView(
  invocation: PluginInvocation,
  binding: PluginBinding,
  input: unknown,
  grants: string[],
  timeoutMs: number,
  callId: string
) {
  const context = invocation.input.context
  let resource: PluginInvocationView['resource']
  if (context.resourceId) {
    const stored = invocation.config.resources.config.provided.find((entry) => {
      return entry.id === context.resourceId && entry.providerId === binding.instance.id
    })
    if (stored) {
      resource = {
        id: stored.id,
        externalId: stored.externalId,
        configuration: structuredClone(stored.configuration)
      }
    }
  }
  const settings = mergeConfig(
    binding.instance.settings,
    context.effective.settings.extensions.settings[binding.instance.id] ?? {},
    binding.bundle.configuration
  )
  if (binding.bundle.configuration) {
    validateConfig(
      resourceWorkerDefinition(binding.bundle, gsviWorkerDefinition(binding.bundle)) ?? {},
      resourceWorkerValues(binding.bundle, gsviBusinessValues(binding.bundle, settings))
    )
  }
  let job: PluginInvocationView['job']
  if (context.jobId && context.jobRevision) {
    job = { id: context.jobId, revision: context.jobRevision }
  }
  return PluginInvocationViewSchema.parse({
    id: crypto.randomUUID(),
    parentId: callId,
    job,
    instanceId: binding.instance.id,
    generation: binding.bundle.revision,
    scope: { id: invocation.room.id, address: invocation.room.address },
    conversationId: context.conversationId,
    conversationEpoch: context.conversationEpoch,
    origin: invocation.origin ?? invocation.input.source,
    entrySurface: context.entrySurface,
    actors: context.authority.identities.map((identity) => {
      return {
        id: identity.actorId,
        name: identity.actorName,
        origin: identity.origin,
        role: identity.role,
        chatKind: identity.chatKind,
        chatId: identity.chatId,
        roles: triggerRoles(context.effective.settings, identity)
      }
    }),
    settings: resourceWorkerValues(binding.bundle, gsviBusinessValues(binding.bundle, settings)),
    resources: Object.fromEntries(
      binding.bundle.manifest.resources.flatMap((dependency) => {
        const id = binding.instance.resources[dependency.alias]
        if (!id) {
          return []
        }
        return [[dependency.alias, { id, protocol: dependency.protocol, methods: dependency.methods }]]
      })
    ),
    resource,
    inputRevision: revision(input),
    grants,
    deadlineAt: Date.now() + timeoutMs
  })
}
