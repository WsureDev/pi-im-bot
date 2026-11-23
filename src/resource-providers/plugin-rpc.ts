import { z } from 'zod'
import type { Configuration } from '../config/load'
import type { PluginHostServices } from '../plugins/rpc/services'
import type { PluginInvocation } from '../plugins/invocation'
import type { PluginBinding } from '../plugins/registry'
import { ConfigValuesSchema } from '../plugins/configuration/schema'
import { callResource } from './service'
import { resolveResource } from './registry'
import { resourceCapability } from './protocol'
import { materializeResourceFiles } from './files'
import { ArtifactStore } from '../artifacts/store'
import { createHash } from 'node:crypto'
import type { ResourceNativeContext } from './native/contracts'
import type { PluginAction } from '../plugins/rpc/protocol'
import { resourceModels } from './native/model'

const CallSchema = z
  .object({
    method: z.string(),
    parameters: ConfigValuesSchema.default({}),
    publishFiles: z.boolean().default(false),
    key: z
      .string()
      .regex(/^[a-zA-Z0-9_.:-]{1,160}$/u)
      .optional(),
    timeoutMs: z.number().int().positive().optional()
  })
  .strict()
export function registerResourceBindings(
  host: PluginHostServices,
  invocation: PluginInvocation,
  binding: PluginBinding,
  callId: string,
  authorizeGrant: (grant: string) => void,
  current: () => Configuration,
  durable?: ResourceNativeContext['durable'],
  phase: PluginAction['phase'] = 'execute'
) {
  const used: Array<() => void> = []
  for (const dependency of binding.bundle.manifest.resources) {
    const id = binding.instance.resources[dependency.alias]
    if (!id) {
      continue
    }
    const grant = 'resource:' + dependency.alias
    host.register(grant, grant, CallSchema, async (input, context) => {
      if (!dependency.methods.includes(input.method)) {
        throw new Error('插件未声明此资源方法')
      }
      const captured = resolveResource(
        invocation.config.resources.config,
        id,
        dependency.protocol,
        input.method
      ).revision
      function authorize(capability: string) {
        authorizeGrant(grant)
        const now = current().resources.config
        const instance = now.plugins.find((entry) => {
          return entry.id === binding.instance.id
        })
        if (
          instance?.resources[dependency.alias] !== id ||
          resolveResource(now, id, dependency.protocol, input.method).revision !== captured
        ) {
          throw new Error('插件资源绑定或配置已变更')
        }
        invocation.services.authorize(capability)
      }
      const capability = resourceCapability(id, dependency.protocol, input.method)
      const check = () => {
        authorize(capability)
      }
      used.push(check)
      let requestKey = callId + ':' + crypto.randomUUID()
      if (input.key) {
        requestKey = JSON.stringify([
          invocation.input.context.jobId ?? callId,
          invocation.input.context.jobRevision,
          binding.instance.id,
          binding.bundle.revision,
          id,
          input.method,
          input.key
        ])
      }
      let signal = context.signal
      if (input.timeoutMs) {
        signal = AbortSignal.any([signal, AbortSignal.timeout(Math.min(input.timeoutMs, 2147483647))])
      }
      const artifacts = new ArtifactStore(
        invocation.config.dataDir,
        invocation.room.id,
        undefined,
        'resource:' + id,
        () => {
          check()
          return {
            capabilities: [capability],
            mediaIds: [],
            plugin: {
              instanceId: binding.instance.id,
              grants: [grant],
              services: {},
              resources: {
                [dependency.alias]: {
                  id,
                  protocol: dependency.protocol,
                  method: input.method,
                  revision: captured
                }
              }
            }
          }
        }
      )
      const result = await callResource(
        () => {
          return current().resources.config
        },
        { resourceId: id, protocol: dependency.protocol, method: input.method, parameters: input.parameters },
        {
          requestId: createHash('sha256').update(requestKey).digest('hex'),
          signal,
          authorize,
          readOnly: invocation.readOnly,
          host: {
            optionsChanged: durable?.optionsChanged,
            dataDir: invocation.config.dataDir,
            artifacts,
            durable,
            models: resourceModels(
              () => {
                return current().catalog
              },
              invocation.input.context.effective.settings.preferences.providerGroup,
              invocation.input.context.effective.persona.prompt
            ),
            owner: {
              scope: invocation.room.id,
              caller: binding.instance.id,
              job: invocation.input.context.jobId,
              jobRevision: invocation.input.context.jobRevision,
              phase
            }
          }
        }
      )
      if (input.publishFiles && result.files.length) {
        const instance = resolveResource(
          current().resources.config,
          id,
          dependency.protocol,
          input.method
        ).instance
        const artifacts = new ArtifactStore(
          invocation.config.dataDir,
          invocation.room.id,
          undefined,
          'resource:' + id,
          () => {
            check()
            return { capabilities: [capability], mediaIds: [] }
          }
        )
        result.artifactIds = await materializeResourceFiles(
          instance,
          result,
          artifacts,
          context.signal,
          check
        )
      }
      check()
      return result
    })
  }
  return () => {
    for (const check of used) {
      check()
    }
  }
}
