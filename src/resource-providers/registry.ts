import { compile } from '@earendil-works/pi-schema'
import type { ResourceInstance, ResourceProtocol, ProviderDefinition } from './protocol'
import { imageLibraryProtocol, xImageProvider } from './protocols/image-library'
import { comfyGatewayProtocol, comfyGatewayProvider } from './protocols/comfy-gateway'
import { gsviProtocol, gsviProvider } from './protocols/gsvi'
import { comfyWorkflowsProtocol, comfyWorkflowsProvider } from './protocols/comfy-workflows'
import { modelProtocol, modelProvider } from './protocols/model'
import { revision } from '../settings/resolve'

export interface ResourceDefinitions {
  providers: ResourceInstance[]
  resourceProtocols: ResourceProtocol[]
  providerDefinitions: ProviderDefinition[]
}
export function resourceExecutionRevision(
  instance: ResourceInstance,
  provider: ProviderDefinition,
  protocol: ResourceProtocol | undefined
) {
  const { name: _name, ...execution } = instance
  return revision({ instance: execution, provider, protocol })
}
export function resourceDefinitions(config: ResourceDefinitions) {
  const protocols = [
    imageLibraryProtocol,
    comfyGatewayProtocol,
    gsviProtocol,
    comfyWorkflowsProtocol,
    modelProtocol,
    ...config.resourceProtocols
  ]
  const providers = [
    xImageProvider,
    comfyGatewayProvider,
    gsviProvider,
    comfyWorkflowsProvider,
    modelProvider,
    ...config.providerDefinitions
  ]
  for (const entries of [protocols, providers, config.providers]) {
    if (
      new Set(
        entries.map((item) => {
          return item.id
        })
      ).size !== entries.length
    ) {
      throw new Error('资源、协议或 Provider ID 重复')
    }
  }
  for (const protocol of protocols) {
    if (
      new Set(
        protocol.methods.map((method) => {
          return method.id
        })
      ).size !== protocol.methods.length
    ) {
      throw new Error('协议方法 ID 重复')
    }
    for (const method of protocol.methods) {
      compile(method.inputSchema)
      compile(method.outputSchema)
    }
  }
  for (const provider of providers) {
    const keys = new Set<string>()
    for (const mapping of provider.mappings) {
      const method = protocols
        .find((entry) => {
          return entry.id === mapping.protocol
        })
        ?.methods.find((entry) => {
          return entry.id === mapping.method
        })
      const key = mapping.protocol + '/' + mapping.method
      if (!method || keys.has(key)) {
        throw new Error('Provider 映射不存在或重复')
      }
      keys.add(key)
    }
  }
  return { protocols, providers }
}
export function resolveResource(
  config: ResourceDefinitions,
  id: string,
  protocolId: string,
  methodId: string,
  requireEnabled = true
) {
  const definitions = resourceDefinitions(config)
  const instance = config.providers.find((item) => {
    return item.id === id
  })
  const provider = definitions.providers.find((item) => {
    return item.id === instance?.provider
  })
  const protocol = definitions.protocols.find((item) => {
    return item.id === protocolId
  })
  const method = protocol?.methods.find((item) => {
    return item.id === methodId
  })
  const mapping = provider?.mappings.find((item) => {
    return item.protocol === protocolId && item.method === methodId
  })
  if (!instance || (requireEnabled && !instance.enabled) || !provider || !protocol || !method || !mapping) {
    throw new Error('资源未启用、未绑定或不支持所需协议方法')
  }
  return {
    instance,
    provider,
    protocol,
    method,
    mapping,
    revision: resourceExecutionRevision(instance, provider, protocol)
  }
}
