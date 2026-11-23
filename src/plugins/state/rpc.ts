import { z } from 'zod'
import type { PluginHostServices } from '../rpc/services'
import type { PluginInvocation } from '../invocation'
import type { PluginBinding } from '../registry'
import type { PluginManagedServices } from '../managed'
import { StateKeySchema, StateCompareSchema } from './store'
import { revision } from '../../settings/resolve'
import { resolveResource } from '../../resource-providers/registry'
import { nativeResourceAdapter } from '../../resource-providers/native/registry'
import { ArtifactStore } from '../../artifacts/store'
import { resourceCapability } from '../../resource-providers/protocol'
import type { Configuration } from '../../config/load'
export function registerPluginState(
  host: PluginHostServices,
  invocation: PluginInvocation,
  binding: PluginBinding,
  managed: PluginManagedServices | undefined,
  authorizeGrant: (grant: string) => void,
  current: () => Configuration
) {
  const epoch = revision({ release: binding.bundle.revision, activation: binding.instance.activation })
  function verifyEpoch(volatile?: boolean) {
    if (!volatile) {
      return
    }
    const instance = current().resources.config.plugins.find((entry) => {
      return entry.id === binding.instance.id
    })
    if (
      !instance ||
      revision({ release: binding.bundle.revision, activation: instance.activation }) !== epoch
    ) {
      throw new Error('插件已重新配置，旧调用不能重置当前临时状态')
    }
  }
  function scope(area: string) {
    if (area === 'operation') {
      if (!invocation.input.context.jobId || !invocation.input.context.jobRevision) {
        throw new Error('操作状态仅供持久 Job 使用')
      }
      return (
        invocation.room.id + ':' + invocation.input.context.jobId + ':' + invocation.input.context.jobRevision
      )
    }
    return invocation.room.id
  }
  host.register('state.read', 'state.read', StateKeySchema, async (input) => {
    if (!managed) {
      throw new Error('受管状态未配置')
    }
    verifyEpoch(input.volatile)
    return managed.state.read(binding.instance.id, scope(input.area), input, epoch)
  })
  host.register('state.compare', 'state.write', StateCompareSchema, async (input, context) => {
    if (!managed || invocation.readOnly) {
      throw new Error('此上下文不可修改受管状态')
    }
    verifyEpoch(input.volatile)
    const ref = input.comfyReceipt
    let record: Parameters<typeof managed.state.compare>[4]
    if (input.resourceReceipt) {
      const receipt = input.resourceReceipt
      const dependency = binding.bundle.manifest.resources.find((entry) => {
        return entry.alias === receipt.alias && entry.methods.includes(receipt.method)
      })
      const id = binding.instance.resources[receipt.alias]
      if (
        !dependency ||
        !id ||
        !invocation.input.context.jobId ||
        !invocation.input.context.jobRevision ||
        input.area !== 'scope'
      ) {
        throw new Error('资源回执必须属于本调用的已声明后台操作')
      }
      const selected = resolveResource(
        invocation.config.resources.config,
        id,
        dependency.protocol,
        receipt.method
      )
      if (selected.mapping.transport.kind !== 'registered') {
        throw new Error('此资源没有事务回执接口')
      }
      const adapter = nativeResourceAdapter(selected.mapping.transport.adapter)
      const recordResource = adapter.record
      if (!recordResource) {
        throw new Error('此资源没有事务回执接口')
      }
      const grant = 'resource:' + receipt.alias
      const authorize = () => {
        authorizeGrant(grant)
        invocation.services.authorize(resourceCapability(id, dependency.protocol, receipt.method))
      }
      record = (tx) => {
        return recordResource(
          selected.instance,
          receipt.item,
          {
            dataDir: invocation.config.dataDir,
            artifacts: new ArtifactStore(invocation.config.dataDir, invocation.room.id),
            durable: managed.resources,
            owner: {
              scope: invocation.room.id,
              caller: binding.instance.id,
              job: invocation.input.context.jobId,
              jobRevision: invocation.input.context.jobRevision,
              phase: 'execute'
            },
            requestId: context.invocation.id,
            signal: context.signal,
            authorize
          },
          tx
        )
      }
    }
    if (ref) {
      if (
        input.area !== 'scope' ||
        input.key !== 'comfy.records' ||
        !invocation.input.context.jobId ||
        !invocation.input.context.jobRevision
      ) {
        throw new Error('回执登记必须属于本Job的comfy.records范围状态')
      }
      authorizeGrant('service:' + ref.alias)
      const owner = {
        instance: binding.instance.id,
        room: invocation.room.id,
        job: invocation.input.context.jobId,
        revision: invocation.input.context.jobRevision
      }
      record = (tx) => {
        return managed.comfy.record(tx, owner, ref.alias, ref.item)
      }
    }
    return managed.state.compare(
      binding.instance.id,
      scope(input.area),
      input,
      () => {
        context.signal.throwIfAborted()
        authorizeGrant('state.write')
        verifyEpoch(input.volatile)
      },
      record,
      epoch
    )
  })
  host.register(
    'authorization.inspect',
    'authorization.inspect',
    z
      .object({ capabilities: z.array(z.enum(['comfy_manage', 'comfy_generate', 'comfy_catalog'])).max(3) })
      .strict(),
    async (input) => {
      return {
        allowed: input.capabilities.filter((capability) => {
          try {
            invocation.services.authorize(capability)
            return true
          } catch {
            return false
          }
        })
      }
    }
  )
}
