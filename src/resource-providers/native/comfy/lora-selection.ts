import { z } from 'zod'
import type { NativeGraph, LoraEntry } from './contracts'
import { LoraControlSchema, LoraSelectionSchema } from './contracts'
import { loraStacks, excludedFile } from './lora-catalogue'
import { loraKey, loraLookup, promptKey, strength, formatStrength } from './lora-values'
import { pythonStrip } from '../../../services/gsvi/unicode'

export interface ResolvedLora extends LoraEntry {
  requested_name: string
  strength: number
  clip_strength: number
  trigger_indexes: number[]
  selected_prompt_hints: string[]
}
export async function selectLoras(
  catalogue: { supported: boolean; catalog: Record<string, LoraEntry> },
  selections: z.infer<typeof LoraSelectionSchema>[],
  control: z.infer<typeof LoraControlSchema>,
  roots: string[]
) {
  const selected: ResolvedLora[] = []
  let clear = false
  if (!control.enabled || !catalogue.supported || !Object.keys(catalogue.catalog).length) {
    return { selected, clear }
  }
  const lookup = loraLookup(catalogue.catalog)
  const seen = new Set<string>()
  for (const choice of selections) {
    const normalized = loraKey(choice.name)
    if (choice.control === 'clear_defaults' || normalized === '!clear_defaults') {
      clear = true
      continue
    }
    const key = lookup.get(normalized)
    if (!key || seen.has(key)) {
      continue
    }
    const entry = catalogue.catalog[key]
    let excluded = false
    for (const name of [
      entry.loader_name,
      entry.workflow_name,
      entry.name,
      entry.display_name,
      ...entry.aliases
    ]) {
      if (name && (await excludedFile(name, roots))) {
        excluded = true
        break
      }
    }
    if (excluded) {
      continue
    }
    const indexes = choice.trigger_indexes.filter((index) => {
      return index > 0 && index <= entry.trigger_options.length
    })
    let hints = indexes.map((index) => {
      return entry.trigger_options[index - 1]
    })
    if (!hints.length) {
      hints = [...entry.prompt_hints]
      if (!hints.length && entry.trigger_options.length === 1) {
        hints = [...entry.trigger_options]
      }
    }
    selected.push({
      ...entry,
      name: entry.workflow_name || entry.loader_name || entry.display_name,
      requested_name: choice.name,
      strength: strength(choice.strength, entry.default_strength ?? 1),
      clip_strength: strength(
        choice.clip_strength,
        entry.default_clip_strength ?? strength(choice.strength, entry.default_strength ?? 1)
      ),
      trigger_indexes: indexes,
      selected_prompt_hints: hints
    })
    seen.add(key)
    if (selected.length >= Math.max(1, control.max_lora_count || 4)) {
      break
    }
  }
  return { selected, clear }
}
function stackText(entries: Array<Record<string, z.infer<ReturnType<typeof z.json>>>>) {
  return entries
    .flatMap((entry) => {
      if (!entry.active || typeof entry.name !== 'string' || !entry.name.trim()) {
        return []
      }
      const model = formatStrength(strength(entry.strength))
      const clip = formatStrength(strength(entry.clipStrength, strength(entry.strength)))
      let value = '<lora:' + entry.name.trim() + ':' + model
      if (model !== clip) {
        value += ':' + clip
      }
      return [value + '>']
    })
    .join(', ')
}
export async function applyLoras(
  graph: NativeGraph,
  selected: ResolvedLora[],
  clear: boolean,
  control: z.infer<typeof LoraControlSchema>,
  roots: string[]
) {
  const applied: string[] = []
  const lookup = new Map<string, ResolvedLora>()
  for (const selection of selected) {
    for (const name of [
      selection.name,
      selection.workflow_name,
      selection.loader_name,
      selection.display_name,
      selection.requested_name
    ]) {
      if (name && !lookup.has(loraKey(name))) {
        lookup.set(loraKey(name), selection)
      }
    }
  }
  for (const stack of loraStacks(graph)) {
    const used = new Set<string>()
    for (const item of stack.entries) {
      if (typeof item.name !== 'string' || !item.name.trim()) {
        continue
      }
      if (await excludedFile(item.name, roots)) {
        item.active = false
      }
      if (!control.enabled || (!selected.length && !clear)) {
        continue
      }
      const selection = lookup.get(loraKey(item.name))
      if (selection) {
        item.active = true
        item.strength = formatStrength(selection.strength)
        item.clipStrength = formatStrength(selection.clip_strength)
        used.add(loraKey(selection.name))
        applied.push(selection.display_name)
      } else if (clear || !control.keep_workflow_defaults_when_selected) {
        item.active = false
      }
    }
    if (control.enabled && (selected.length || clear)) {
      for (const selection of selected) {
        if (used.has(loraKey(selection.name))) {
          continue
        }
        const name = selection.loader_name || selection.workflow_name || selection.name
        stack.entries.push({
          name,
          strength: formatStrength(selection.strength),
          clipStrength: formatStrength(selection.clip_strength),
          active: true,
          expanded: false
        })
        used.add(loraKey(selection.name))
        applied.push(selection.display_name)
      }
    }
    stack.node.inputs.text = stackText(stack.entries)
  }
  return [...new Set(applied)]
}
export function injectHints(prompt: string, selected: ResolvedLora[], enabled: boolean) {
  const injected: string[] = []
  if (!enabled) {
    return { prompt, injected }
  }
  const seen = new Set(prompt.split(',').map(promptKey).filter(Boolean))
  for (const entry of selected) {
    let hints = entry.selected_prompt_hints
    if (!hints.length) {
      hints = entry.prompt_hints
    }
    for (const hint of hints.flatMap((value) => {
      return value.split(/[,;\n，；]+/u)
    })) {
      const text = pythonStrip(hint)
        .replace(/\s+/gu, ' ')
        .replace(/^[,; ]+|[,; ]+$/gu, '')
      const key = promptKey(text)
      if (key && !seen.has(key)) {
        injected.push(text)
        seen.add(key)
      }
    }
  }
  if (!injected.length) {
    return { prompt, injected }
  }
  return { prompt: (injected.join(', ') + ', ' + prompt.trim()).replace(/^[, ]+|[, ]+$/gu, ''), injected }
}
