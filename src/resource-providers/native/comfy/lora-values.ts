import { basename, extname } from 'node:path'
import { pythonCasefold, pythonStrip } from '../../../services/gsvi/unicode'
import { LoraEntrySchema, type LoraEntry } from './contracts'

export function loraKey(value: string) {
  return pythonCasefold(value.replaceAll('\\', '/').replace(/\s+/gu, ''))
}
export function promptKey(value: string) {
  return pythonCasefold(pythonStrip(value).replace(/\s+/gu, ' '))
}
export function strength(value: unknown, fallback = 1) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const result = Number(value)
  if (!Number.isFinite(result)) {
    return fallback
  }
  return result
}
/** Round the exact binary float to four decimal places, with Python's ties-to-even rule. */
export function formatStrength(value: number) {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  const bits = view.getBigUint64(0)
  const negative = bits >> 63n !== 0n
  const exponent = Number((bits >> 52n) & 2047n)
  let mantissa = bits & ((1n << 52n) - 1n)
  let shift = -1074
  if (exponent) {
    mantissa += 1n << 52n
    shift = exponent - 1075
  }
  let numerator = mantissa * 10000n
  let denominator = 1n
  if (shift >= 0) {
    numerator <<= BigInt(shift)
  } else {
    denominator <<= BigInt(-shift)
  }
  let rounded = numerator / denominator
  const remainder = numerator % denominator
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n !== 0n)) {
    rounded += 1n
  }
  const raw = rounded.toString().padStart(5, '0')
  let result = (raw.slice(0, -4) + '.' + raw.slice(-4)).replace(/0+$/u, '').replace(/\.$/u, '')
  if (negative) {
    result = '-' + result
  }
  return result
}
export function makeLora(name: string, properties: Partial<LoraEntry> = {}) {
  return LoraEntrySchema.parse({ name, display_name: name, ...properties })
}
export function lookupKeys(entry: LoraEntry) {
  const result = new Set<string>()
  for (const value of [
    entry.display_name,
    entry.name,
    entry.workflow_name,
    entry.loader_name,
    entry.model_name,
    ...entry.aliases
  ]) {
    if (!value) {
      continue
    }
    const file = basename(value.replaceAll('\\', '/'))
    for (const text of [value, file, file.slice(0, file.length - extname(file).length)]) {
      if (text) {
        result.add(loraKey(text))
      }
    }
  }
  return result
}
export function loraLookup(catalogue: Record<string, LoraEntry>) {
  const lookup = new Map<string, string>()
  for (const [key, entry] of Object.entries(catalogue)) {
    for (const alias of lookupKeys(entry)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, key)
      }
    }
  }
  return lookup
}
export function mergeLora(base: LoraEntry, incoming: LoraEntry) {
  for (const key of ['workflow_name', 'loader_name', 'description', 'model_name', 'base_model'] as const) {
    if (!base[key] && incoming[key]) {
      base[key] = incoming[key]
    }
  }
  if (incoming.default_active) {
    base.default_active = true
  }
  if (incoming.default_strength !== null) {
    base.default_strength = incoming.default_strength
  }
  if (incoming.default_clip_strength !== null) {
    base.default_clip_strength = incoming.default_clip_strength
  }
  for (const key of [
    'aliases',
    'trigger_words',
    'prompt_hints',
    'trigger_options',
    'source_nodes',
    'tags'
  ] as const) {
    base[key] = [...new Set([...base[key], ...incoming[key]].map(pythonStrip).filter(Boolean))]
  }
  base.is_style_lora ||= incoming.is_style_lora
  return base
}
export function splitTriggerOptions(value: string) {
  const text = pythonStrip(value)
    .replace(/\s+/gu, ' ')
    .replace(/^[,; ]+|[,; ]+$/gu, '')
  if (!text) {
    return []
  }
  const parts: string[] = []
  for (const pattern of [/“([^”]+)”/gu, /"([^"]+)"/gu, /'([^']+)'/gu]) {
    for (const match of text.matchAll(pattern)) {
      const part = pythonStrip(match[1])
      if (part) {
        parts.push(part)
      }
    }
  }
  if (parts.length) {
    return parts
  }
  return [text]
}
