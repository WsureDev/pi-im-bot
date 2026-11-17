import type { ResourceLibrary } from '../resources/library'
import { z } from 'zod'
import type { HttpServices } from '../http/app'
import { revision } from '../settings/resolve'
import { PluginConfigurationEditor } from '../plugins/configuration/editor'
import { publicConfig, applyConfigSecrets } from '../plugins/configuration/secrets'
import {
  configurationSecretValues,
  type ReadConfigSecretsSchema
} from '../plugins/configuration/secret-editor'
import { fillConfigDefaults, validateConfig, validateConfigReadonly } from '../plugins/configuration/values'
import { ControlError } from '../control/error'
import {
  ResourceRegistryViewSchema,
  ResourceConfigViewSchema,
  type SaveResourceConfigSchema
} from './contracts'
import { operationView } from './presentation'
import { type ProvidedResource, DiscoveryResultSchema } from './definition'
import { pluginOperationId } from '../plugins/identity'

export class ResourceProviderCatalog {
  readonly editor: PluginConfigurationEditor
  constructor(readonly host: HttpServices) {
    this.editor = new PluginConfigurationEditor(host.pluginEditor, host.frameworkEditor, host.coordinator)
  }
  provider(id: string) {
    const config = this.host.configuration()
    const instance = config.resources.config.plugins.find((entry) => {
      return entry.id === id
    })
    const bundle = config.resources.pluginPackage(id)
    if (!instance || !bundle || !bundle.manifest.operations.length) {
      throw new ControlError('资源提供者不存在或未安装', 404)
    }
    return { instance, bundle }
  }
  async read() {
    const config = this.host.configuration()
    const view = await this.host.resourceEditor.read()
    return resourceDirectory(
      config.resources,
      view.revision,
      Boolean(this.host.coordinator.plugins?.available())
    )
  }
  async resolve(resourceId: string, operationId: string) {
    const view = await this.read()
    const resource = view.resources.find((entry) => {
      return entry.id === resourceId
    })
    if (!resource) {
      throw new ControlError('资源不存在', 404)
    }
    if (!resource.available) {
      throw new ControlError('资源、插件或执行环境未启用', 409)
    }
    const operation = resource.operations.find((entry) => {
      return entry.id === operationId
    })
    if (!operation) {
      throw new ControlError('资源没有声明此操作', 404)
    }
    return { view, resource, operation, capability: pluginOperationId(resource.providerId, operation.id) }
  }
  async acceptDiscovery(providerId: string, expected: string, raw: unknown) {
    if ((await this.read()).revision !== expected) {
      throw new ControlError('发现期间配置已变化，结果未登记', 409)
    }
    const { instance, bundle } = this.provider(providerId)
    const definition = bundle.manifest.resourceProvider?.resourceSchema ?? {}
    const result = DiscoveryResultSchema.parse(raw)
    if (
      new Set(
        result.resources.map((entry) => {
          return entry.externalId
        })
      ).size !== result.resources.length
    ) {
      throw new ControlError('发现结果包含重复 ID')
    }
    const allowed = new Set(
      bundle.manifest.operations.map((entry) => {
        return entry.id
      })
    )
    for (const resource of result.resources) {
      if (
        resource.operationIds.some((id) => {
          return !allowed.has(id)
        })
      ) {
        throw new ControlError('发现结果引用未声明操作')
      }
    }
    const snapshot = await this.host.resourceEditor.read()
    await this.host.resourceEditor.updateProvided(snapshot.revision, (existing) => {
      const records = structuredClone(existing)
      for (const record of records) {
        if (record.providerId === instance.id) {
          record.state = 'stale'
        }
      }
      for (const found of result.resources) {
        const id = instance.id + ':' + encodeURIComponent(found.externalId)
        const previous = records.find((entry) => {
          return entry.id === id
        })
        if (previous) {
          Object.assign(previous, found, { state: 'ready', discoveredAt: Date.now() })
        } else {
          records.push({
            ...found,
            id,
            providerId: instance.id,
            state: 'ready',
            enabled: true,
            configuration: fillConfigDefaults(definition, {}),
            discoveredAt: Date.now()
          })
        }
      }
      return records
    })
  }
  async configuration(subject: 'provider' | 'resource', id: string) {
    if (subject === 'provider') {
      const { instance } = this.provider(id)
      return ResourceConfigViewSchema.parse({
        ...(await this.editor.read(id, { level: 'instance' })),
        subject,
        subjectId: id,
        title: instance.name,
        ownerPluginId: id
      })
    }
    const resource = this.host.configuration().resources.config.provided.find((entry) => {
      return entry.id === id
    })
    if (!resource) {
      throw new ControlError('此资源使用提供者配置，请打开连接配置', 404)
    }
    const { bundle } = this.provider(resource.providerId)
    const definition = bundle.manifest.resourceProvider?.resourceSchema ?? {}
    const view = await this.host.resourceEditor.read()
    return ResourceConfigViewSchema.parse({
      subject,
      subjectId: id,
      title: resource.name,
      ownerPluginId: resource.providerId,
      revision: view.revision,
      release: bundle.revision,
      target: { level: 'instance' },
      targets: [],
      definition,
      ...publicConfig(definition, resource.configuration),
      inherited: {},
      issues: [],
      bindings: [],
      choices: { select_mcp: [], select_provider: [], select_model_group: [], select_persona: [] }
    })
  }
  async secrets(
    subject: 'provider' | 'resource',
    id: string,
    input: z.infer<typeof ReadConfigSecretsSchema>
  ) {
    if (input.target.level !== 'instance') {
      throw new ControlError('资源连接只在实例范围配置')
    }
    if (subject === 'provider') {
      return this.editor.readSecrets(id, input)
    }
    const view = await this.configuration(subject, id)
    if (
      view.revision !== input.revision ||
      view.release !== input.release ||
      input.target.level !== 'instance'
    ) {
      throw new ControlError('配置已变化，请刷新', 409)
    }
    const resource = this.host.configuration().resources.config.provided.find((entry) => {
      return entry.id === id
    })!
    return configurationSecretValues(view.definition ?? {}, resource.configuration)
  }
  async save(subject: 'provider' | 'resource', id: string, input: z.infer<typeof SaveResourceConfigSchema>) {
    if (input.target.level !== 'instance') {
      throw new ControlError('资源连接只在实例范围配置')
    }
    if (subject === 'provider') {
      await this.editor.save(id, input)
      return this.configuration(subject, id)
    }
    const view = await this.configuration(subject, id)
    if (
      view.revision !== input.revision ||
      view.release !== input.release ||
      input.target.level !== 'instance'
    ) {
      throw new ControlError('配置已变化，请刷新', 409)
    }
    const definition = view.definition ?? {}
    await this.host.resourceEditor.updateProvided(input.revision, (records) => {
      const resource = records.find((entry) => {
        return entry.id === id
      })!
      const value = fillConfigDefaults(
        definition,
        applyConfigSecrets(definition, input.values, resource.configuration, input.secrets)
      )
      validateConfig(definition, value)
      validateConfigReadonly(definition, resource.configuration, value)
      resource.configuration = value
      return records
    })
    return this.configuration(subject, id)
  }
}

export function resourceDirectory(
  library: ResourceLibrary,
  configurationRevision: string,
  runtimeReady: boolean
) {
  const providers = []
  const resources = []
  for (const instance of library.config.plugins) {
    const bundle = library.pluginPackage(instance.id)
    if (!bundle || !bundle.manifest.operations.length) {
      continue
    }
    const meta = bundle.manifest.resourceProvider
    let rows: ProvidedResource[] = library.config.provided.filter((entry) => {
      return entry.providerId === instance.id
    })
    if (!meta?.discover) {
      rows = [
        {
          id: instance.id + ':default',
          providerId: instance.id,
          externalId: 'default',
          name: instance.name,
          description: bundle.manifest.description,
          enabled: true,
          state: 'ready',
          configuration: {},
          attributes: {},
          operationIds: bundle.manifest.operations.map((op) => {
            return op.id
          }),
          discoveredAt: 0
        }
      ]
    }
    const ready = runtimeReady
    providers.push({
      id: instance.id,
      title: meta?.title ?? instance.name,
      description: meta?.description ?? bundle.manifest.description,
      version: bundle.revision,
      active: instance.enabled,
      runtimeReady: ready,
      discoverable: Boolean(meta?.discover),
      resourceCount: rows.length,
      operationCount: bundle.manifest.operations.length,
      icon: meta?.icon ?? 'mdi-puzzle-outline'
    })
    for (const row of rows) {
      resources.push({
        id: row.id,
        providerId: instance.id,
        name: row.name,
        description: row.description,
        externalId: row.externalId,
        enabled: row.enabled,
        state: row.state,
        available: ready && instance.enabled && row.enabled && row.state === 'ready',
        base: !meta?.discover,
        attributes: row.attributes,
        operations: bundle.manifest.operations
          .filter((op) => {
            return row.operationIds.includes(op.id)
          })
          .map((op) => {
            return operationView(op, bundle.revision)
          })
      })
    }
  }
  return ResourceRegistryViewSchema.parse({
    revision: revision({ resources: configurationRevision, plugins: runtimeReady }),
    providers,
    resources
  })
}
