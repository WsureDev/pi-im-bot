import type { Configuration } from '../config/load'
import type { PluginOperationEntry } from './registry'
import { resourceDefinitions } from '../resource-providers/registry'
import { z } from 'zod'
/** Only the reviewed native GSVI projection may derive an async deadline from its bound service. */
export function serviceOperationBudget(config: Configuration, entry: PluginOperationEntry) {
  const resourceAlias = entry.operation.resourceTimeout
  if (resourceAlias) {
    if (
      entry.operation.execution !== 'background' ||
      !entry.operation.grants.includes('resource:' + resourceAlias) ||
      !entry.instance.grants.includes('resource:' + resourceAlias)
    ) {
      throw new Error('操作未获资源预算授权')
    }
    const instance = config.resources.config.providers.find((item) => {
      return item.id === entry.instance.resources[resourceAlias]
    })
    const definition = resourceDefinitions(config.resources.config).providers.find((item) => {
      return item.id === instance?.provider
    })
    if (!instance?.enabled || !definition) {
      throw new Error('预算资源未绑定或停用')
    }
    const field = definition.operationTimeoutField ?? definition.timeoutField
    const duration = z
      .number()
      .int()
      .nonnegative()
      .parse(
        instance.configuration[field] ?? definition.configuration[field]?.default ?? entry.operation.timeoutMs
      )
    if (duration === 0) {
      return 8640000000000000 - Date.now()
    }
    return duration
  }
  const alias = entry.operation.serviceTimeout
  if (!alias) {
    return undefined
  }
  if (
    entry.bundle.manifest.configurationProjection !== 'gsvi@1' ||
    entry.operation.execution !== 'background' ||
    !entry.instance.grants.includes('service:' + alias)
  ) {
    throw new Error('操作未获受管GSVI服务期限授权')
  }
  const service = config.resources.config.services.find(
    (value) => value.id === entry.instance.services[alias]
  )
  if (!service?.enabled) {
    throw new Error('操作期限所用服务已停用或未绑定')
  }
  return service.timeoutMs
}
