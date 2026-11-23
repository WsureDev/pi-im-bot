import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import { ConfigValuesSchema } from '../../../plugins/configuration/schema'
import { type NativeGraph, type LoraEntry, LoraEntrySchema } from './contracts'
import { readJson, lexical } from './workflows'
import {
  loraKey,
  promptKey,
  makeLora,
  loraLookup,
  lookupKeys,
  mergeLora,
  splitTriggerOptions,
  strength
} from './lora-values'

const StringListSchema = z.array(z.coerce.string()).catch([])
const TextSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .nullish()
  .catch(undefined)
  .transform((value) => {
    if (!value) {
      return ''
    }
    return String(value)
  })
const MetadataSchema = z.object({
  file_name: TextSchema,
  model_name: TextSchema,
  notes: TextSchema,
  base_model: TextSchema,
  tags: StringListSchema,
  civitai: z
    .object({
      trainedWords: StringListSchema,
      model: z.object({ tags: StringListSchema, name: TextSchema }).catch({ tags: [], name: '' })
    })
    .catch({ trainedWords: [], model: { tags: [], name: '' } }),
  exclude: z.union([z.boolean(), z.string(), z.number()]).catch(false)
})
const SidecarSchema = z.object({
  aliases: StringListSchema,
  trigger_words: StringListSchema,
  prompt_hints: StringListSchema,
  description: TextSchema,
  strength: z.union([z.number(), z.string()]).nullish(),
  clip_strength: z.union([z.number(), z.string()]).nullish()
})
const scanCache = new Map<string, { at: number; entries: LoraEntry[] }>()
export function scanRoots(value: string) {
  return [
    ...new Set(
      value
        .split(/[\r\n]+/u)
        .map((text) => {
          let clean = text.trim().replace(/^["']+|["']+$/gu, '')
          if (clean.startsWith('~/')) {
            clean = join(homedir(), clean.slice(2))
          }
          if (!clean) {
            return ''
          }
          return resolve(clean)
        })
        .filter(Boolean)
    )
  ]
}
function excludedValue(value: unknown) {
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  }
  return Boolean(value)
}
export async function excludedFile(name: string, roots: readonly string[]) {
  const paths = roots.map((root) => {
    return join(root, name.replaceAll('\\', '/'))
  })
  if (isAbsolute(name)) {
    paths.unshift(name)
  }
  for (const path of paths) {
    if (!(await stat(path).catch(() => undefined))?.isFile()) {
      continue
    }
    const actual = await realpath(path)
    const metadata = z
      .object({ exclude: z.unknown().optional() })
      .safeParse(
        await readJson(actual.slice(0, -extname(actual).length) + '.metadata.json').catch(() => ({}))
      )
    return metadata.success && excludedValue(metadata.data.exclude)
  }
  return false
}
async function scanned(roots: string[], signal: AbortSignal) {
  const key = JSON.stringify(roots)
  const cached = scanCache.get(key)
  if (cached && Date.now() - cached.at < 60000) {
    return structuredClone(cached.entries)
  }
  const entries: LoraEntry[] = []
  const seen = new Set<string>()
  async function visit(root: string, folder: string) {
    for (const item of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      signal.throwIfAborted()
      const path = join(folder, item.name)
      if (item.isDirectory()) {
        await visit(root, path)
        continue
      }
      if (
        !['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.pt2', '.pkl', '.sft'].includes(
          extname(item.name).toLowerCase()
        )
      ) {
        continue
      }
      if (!(await stat(path).catch(() => undefined))?.isFile()) {
        continue
      }
      const actual = await realpath(path)
      if (seen.has(actual)) {
        continue
      }
      seen.add(actual)
      const metadata = MetadataSchema.parse(
        await readJson(path.slice(0, -extname(path).length) + '.metadata.json').catch(() => ({}))
      )
      const stem = basename(path, extname(path))
      const loader = relative(root, path).replaceAll('\\', '/')
      const name = metadata.file_name.trim() || stem
      const tags = [
        ...new Set(
          [...metadata.tags, ...metadata.civitai.model.tags]
            .map((value) => {
              return value.trim()
            })
            .filter(Boolean)
        )
      ]
      const options: string[] = []
      const normalized = new Set<string>()
      for (const text of metadata.civitai.trainedWords.flatMap(splitTriggerOptions)) {
        const key = promptKey(text)
        if (key && !normalized.has(key)) {
          options.push(text)
          normalized.add(key)
        }
      }
      entries.push(
        makeLora(name, {
          loader_name: loader,
          aliases: [...new Set([stem, metadata.model_name, loader].filter(Boolean))],
          description: metadata.notes || metadata.model_name || metadata.civitai.model.name,
          model_name: metadata.model_name,
          base_model: metadata.base_model,
          tags,
          trigger_options: options,
          is_style_lora:
            tags.map(promptKey).includes('style') || promptKey(metadata.model_name).endsWith('/ style')
        })
      )
    }
  }
  for (const root of roots) {
    await visit(root, root)
  }
  scanCache.set(key, { at: Date.now(), entries: structuredClone(entries) })
  return entries
}
export function loraStacks(graph: NativeGraph) {
  return Object.entries(graph).flatMap(([id, node]) => {
    const container = ConfigValuesSchema.safeParse(node.inputs.loras)
    if (!container.success) {
      return []
    }
    const entries = z.array(ConfigValuesSchema).safeParse(container.data.__value__)
    if (
      !entries.success ||
      !entries.data.some((entry) => {
        return typeof entry.name === 'string' && entry.name.trim()
      })
    ) {
      return []
    }
    container.data.__value__ = entries.data
    node.inputs.loras = container.data
    return [{ id, node, container: container.data, entries: entries.data }]
  })
}
const contexts = new Map<string, { at: number; value: Awaited<ReturnType<typeof buildLoraCatalogue>> }>()
export async function loraCatalogue(
  graph: NativeGraph,
  directory: string,
  filename: string,
  roots: string[],
  signal: AbortSignal
) {
  const key = JSON.stringify([directory, filename, roots, graph])
  const cached = contexts.get(key)
  signal.throwIfAborted()
  if (cached && Date.now() - cached.at < 5000) {
    return structuredClone(cached.value)
  }
  for (const [id, entry] of contexts) {
    if (Date.now() - entry.at >= 5000) {
      contexts.delete(id)
    }
  }
  const value = await buildLoraCatalogue(graph, directory, filename, roots, signal)
  contexts.set(key, { at: Date.now(), value: structuredClone(value) })
  return value
}
async function buildLoraCatalogue(
  graph: NativeGraph,
  directory: string,
  filename: string,
  roots: string[],
  signal: AbortSignal
) {
  const catalog: Record<string, LoraEntry> = {}
  const stacks = loraStacks(graph)
  for (const stack of stacks) {
    for (const item of stack.entries) {
      const parsed = z.string().safeParse(item.name)
      if (!parsed.success || !parsed.data.trim()) {
        continue
      }
      const name = parsed.data.trim()
      const entry =
        catalog[name] ??
        makeLora(name, {
          workflow_name: name,
          default_strength: strength(item.strength),
          default_clip_strength: strength(item.clipStrength, strength(item.strength)),
          default_active: Boolean(item.active)
        })
      entry.default_active ||= Boolean(item.active)
      if (!entry.source_nodes.includes(stack.id)) {
        entry.source_nodes.push(stack.id)
      }
      catalog[name] = entry
    }
  }
  for (const entry of await scanned(roots, signal)) {
    const lookup = loraLookup(catalog)
    const match = [...lookupKeys(entry)]
      .map((key) => {
        return lookup.get(key)
      })
      .find(Boolean)
    if (match) {
      mergeLora(catalog[match], entry)
    } else {
      const initial = entry.loader_name || entry.display_name
      let key = initial
      let suffix = 1
      while (catalog[key]) {
        suffix += 1
        key = initial + '#' + suffix
      }
      catalog[key] = entry
    }
  }
  const raw = await readJson(join(directory, filename.replace(/\.json$/u, '.lora.json'))).catch(() => ({}))
  const wrapper = z.object({ loras: z.record(z.string(), z.unknown()) }).safeParse(raw)
  let source = z.record(z.string(), z.unknown()).catch({}).parse(raw)
  if (wrapper.success) {
    source = wrapper.data.loras
  }
  for (const [name, value] of Object.entries(source)) {
    const meta = SidecarSchema.safeParse(value)
    if (!meta.success || !name.trim()) {
      continue
    }
    const key = loraLookup(catalog).get(loraKey(name)) ?? name.trim()
    const entry = catalog[key] ?? makeLora(name.trim())
    mergeLora(
      entry,
      makeLora(entry.display_name, {
        default_strength: strength(meta.data.strength, entry.default_strength ?? 1),
        default_clip_strength: strength(meta.data.clip_strength, entry.default_clip_strength ?? 1),
        aliases: meta.data.aliases,
        description: meta.data.description,
        trigger_words: meta.data.trigger_words,
        prompt_hints: meta.data.prompt_hints,
        trigger_options: meta.data.trigger_words
      })
    )
    catalog[key] = entry
  }
  for (const [key, entry] of Object.entries(catalog)) {
    for (const name of [
      entry.loader_name,
      entry.workflow_name,
      entry.name,
      entry.display_name,
      ...entry.aliases
    ]) {
      if (name && (await excludedFile(name, roots))) {
        delete catalog[key]
        break
      }
    }
    entry.default_strength = entry.default_strength ?? 1
    entry.default_clip_strength = entry.default_clip_strength ?? entry.default_strength
  }
  const ordered = Object.entries(catalog).sort((left, right) => {
    if (left[1].default_active !== right[1].default_active) {
      return Number(right[1].default_active) - Number(left[1].default_active)
    }
    return lexical(loraKey(left[1].display_name), loraKey(right[1].display_name))
  })
  return {
    supported: stacks.length > 0,
    catalog: Object.fromEntries(ordered),
    loader_node_ids: stacks.map((entry) => {
      return entry.id
    }),
    default_active_loras: ordered
      .map((entry) => {
        return entry[1]
      })
      .filter((entry) => {
        return entry.default_active
      }),
    scan_roots: roots
  }
}
