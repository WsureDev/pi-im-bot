import { mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Configuration } from '../config/load'
import type { PluginPackage } from '../plugins/config'
import type { ConfigDefinition, ConfigValues } from '../plugins/configuration/schema'
import { ConfigValuesSchema } from '../plugins/configuration/schema'
import { revision } from '../settings/resolve'
import { ArtifactStore } from '../artifacts/store'
import { callResource } from './service'
import { resolveResource } from './registry'
import { readConfigPath, writeConfigPath } from './projection'

const ValuesSchema = z.object({ values: z.array(z.union([z.string(), z.number()])) })
const CacheSchema = ValuesSchema.extend({ updatedAt: z.number(), error: z.string().optional() })
export class ResourceOptions {
  private readonly active = new Map<string, AbortController>()
  private readonly pending = new Set<Promise<void>>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private closed = false
  constructor(private readonly configuration: () => Configuration) {}
  private entries(id: string) {
    const config = this.configuration()
    const instance = config.resources.config.plugins.find((entry) => {
      return entry.id === id
    })
    const bundle = config.resources.pluginPackage(id)
    if (!instance || !bundle) {
      return []
    }
    return bundle.manifest.resources.flatMap((dependency) => {
      return dependency.options.flatMap((option) => {
        const resourceId = instance.resources[dependency.alias]
        if (!resourceId) {
          return []
        }
        try {
          const selected = resolveResource(
            config.resources.config,
            resourceId,
            dependency.protocol,
            option.method,
            false
          )
          if (selected.method.effect !== 'read') {
            return []
          }
          const parameters: ConfigValues = {}
          for (const [name, path] of Object.entries(option.parameters)) {
            const value = readConfigPath(instance.settings, path)
            if (value !== undefined) {
              writeConfigPath(parameters, name, value)
            }
          }
          let identity: ConfigValues = selected.instance.configuration
          if (selected.provider.optionIdentityFields.length) {
            identity = {}
            for (const path of selected.provider.optionIdentityFields) {
              const value = readConfigPath(selected.instance.configuration, path)
              if (value !== undefined) {
                writeConfigPath(identity, path, value)
              }
            }
          }
          const key = revision({
            resourceId,
            method: option.method,
            protocol: dependency.protocol,
            parameters,
            identity
          })
          const directory = join(config.dataDir, 'resource-options')
          return [
            {
              config,
              instance,
              option,
              resourceId,
              protocol: dependency.protocol,
              parameters,
              key,
              directory,
              path: join(directory, key + '.json')
            }
          ]
        } catch {
          return []
        }
      })
    })
  }
  resourceChanged(resourceId: string) {
    for (const plugin of this.configuration().resources.config.plugins) {
      if (Object.values(plugin.resources).includes(resourceId)) {
        this.request(plugin.id)
      }
    }
  }
  request(id: string) {
    this.active.get(id)?.abort()
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
    const config = this.configuration()
    const instance = config.resources.config.plugins.find((entry) => {
      return entry.id === id
    })
    if (this.closed || !config.bot.plugins.enabled || !instance?.enabled) {
      return
    }
    const controller = new AbortController()
    this.active.set(id, controller)
    const entries = this.entries(id)
    const done = (async () => {
      for (const entry of entries) {
        const previous = CacheSchema.safeParse(
          await Bun.file(entry.path)
            .json()
            .catch(() => null)
        )
        let cache = {
          values: [] as Array<string | number>,
          updatedAt: 0,
          error: undefined as string | undefined
        }
        if (previous.success) {
          cache = { ...previous.data, error: previous.data.error }
        }
        try {
          const result = await callResource(
            () => {
              return this.configuration().resources.config
            },
            {
              resourceId: entry.resourceId,
              protocol: entry.protocol,
              method: entry.option.method,
              parameters: entry.parameters
            },
            {
              requestId: crypto.randomUUID(),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
              authorize: () => {
                const current = this.configuration()
                if (
                  !current.bot.plugins.enabled ||
                  !current.resources.config.plugins.some((plugin) => {
                    return (
                      plugin.id === id &&
                      plugin.enabled &&
                      Object.values(plugin.resources).includes(entry.resourceId)
                    )
                  })
                ) {
                  throw new Error('配置刷新已停用')
                }
              },
              readOnly: true,
              host: {
                dataDir: entry.config.dataDir,
                artifacts: new ArtifactStore(entry.config.dataDir, 'resource-options:' + entry.resourceId),
                owner: {
                  scope: 'resource-options:' + entry.resourceId,
                  caller: 'configuration',
                  phase: 'execute'
                }
              }
            }
          )
          cache = { ...ValuesSchema.parse(result.value), updatedAt: Date.now(), error: undefined }
        } catch {
          cache.error = '最近刷新失败，保留上次成功列表和当前选择。'
        }
        if (controller.signal.aborted) {
          break
        }
        await mkdir(entry.directory, { recursive: true })
        const temp = entry.path + '.' + crypto.randomUUID() + '.tmp'
        try {
          await Bun.write(temp, JSON.stringify(cache), { mode: 0o600 })
          await rename(temp, entry.path)
        } finally {
          await unlink(temp).catch(() => {})
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        this.pending.delete(done)
        if (this.active.get(id) === controller) {
          this.active.delete(id)
          const intervals = entries.flatMap((entry) => {
            if (entry.option.refreshIntervalMs) {
              return [entry.option.refreshIntervalMs]
            }
            return []
          })
          if (!this.closed && intervals.length) {
            this.timers.set(
              id,
              setTimeout(
                () => {
                  this.request(id)
                },
                Math.min(...intervals)
              )
            )
          }
        }
      })
    this.pending.add(done)
  }
  async definition(
    id: string,
    bundle: PluginPackage,
    original: ConfigDefinition | undefined,
    values: ConfigValues
  ) {
    if (!original) {
      return original
    }
    const definition = structuredClone(original)
    for (const entry of this.entries(id)) {
      const cache = CacheSchema.safeParse(
        await Bun.file(entry.path)
          .json()
          .catch(() => null)
      )
      if (!cache.success) {
        continue
      }
      const keys = entry.option.field.split('.')
      let fields: ConfigDefinition | undefined = definition
      for (const key of keys.slice(0, -1)) {
        fields = fields?.[key]?.items
      }
      const field = fields?.[keys[keys.length - 1]]
      if (!field) {
        continue
      }
      const current = z.union([z.string(), z.number()]).safeParse(readConfigPath(values, entry.option.field))
      const options = [...cache.data.values]
      let missing = false
      if (current.success && !options.includes(current.data)) {
        options.push(current.data)
        missing = true
      }
      if (options.length) {
        field.options = options
      }
      if (missing || cache.data.error) {
        field.hint = (field.hint ?? '') + '\n' + (cache.data.error ?? '')
        if (missing) {
          field.hint += ' 当前选择未在服务列表中列出，保留原值。'
        }
      }
    }
    return definition
  }
  async close() {
    this.closed = true
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    for (const controller of this.active.values()) {
      controller.abort()
    }
    await Promise.allSettled(this.pending)
  }
}
