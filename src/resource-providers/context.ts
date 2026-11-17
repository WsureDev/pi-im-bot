import type { Configuration } from '../config/load'
import { revision } from '../settings/resolve'
import type { ProvidedResource } from './definition'

export function providedResource(config: Pick<Configuration, 'resources'>, id: string) {
  const resource = config.resources.config.provided.find((entry) => {
    return entry.id === id
  })
  if (!resource || !resource.enabled || resource.state !== 'ready') {
    throw new Error('资源不存在、已停用或发现结果失效')
  }
  const plugin = config.resources.config.plugins.find((entry) => {
    return entry.id === resource.providerId
  })
  if (!plugin?.enabled) {
    throw new Error('资源提供者已停用')
  }
  return resource
}
export function providedResourceRevision(resource: ProvidedResource) {
  return revision({
    id: resource.id,
    providerId: resource.providerId,
    externalId: resource.externalId,
    operationIds: [...new Set(resource.operationIds)].sort(),
    configuration: resource.configuration,
    enabled: resource.enabled,
    state: resource.state
  })
}
export function assertResourceContext(
  config: Pick<Configuration, 'resources'>,
  context: { resourceId?: string; resourceRevision?: string }
) {
  if (!context.resourceId) {
    return
  }
  const resource = providedResource(config, context.resourceId)
  if (providedResourceRevision(resource) !== context.resourceRevision) {
    throw new Error('资源配置已变化，本次调用不能继续使用旧资源')
  }
}
export function assertResourceToolExport(config: Pick<Configuration, 'resources'>, capability: string) {
  if (!capability.startsWith('plugin:')) {
    return
  }
  const [id, operation] = capability.slice(7).split('/')
  const provider = config.resources.pluginPackage(id)?.manifest.resourceProvider
  if (provider && !provider.tools.includes(operation)) {
    throw new Error('该资源操作未声明为模型入口')
  }
}
