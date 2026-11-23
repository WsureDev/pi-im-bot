import { z } from 'zod'
import { ComfySubmitSchema, type NativeGraph } from './contracts'
import { applySteps, stepOverrides } from './workflows'
import { loraCatalogue, scanRoots } from './lora-catalogue'
import { selectLoras, applyLoras, injectHints } from './lora-selection'
import { ComfyResourceConfigurationSchema } from './contracts'
import type { ResourceInstance } from '../../protocol'

export async function compileNativeWorkflow(
  instance: ResourceInstance,
  directory: string,
  filename: string,
  graph: NativeGraph,
  args: z.infer<typeof ComfySubmitSchema>,
  signal: AbortSignal
) {
  const config = ComfyResourceConfigurationSchema.parse(instance.configuration)
  const roots = scanRoots(config.scan_directories)
  const catalogue = await loraCatalogue(graph, directory, filename, roots, signal)
  const selected = await selectLoras(catalogue, args.selections, args.lora_control, roots)
  const hints = injectHints(args.prompt, selected.selected, args.lora_control.inject_selected_prompt_hints)
  const node = graph[args.workflow_settings.input_node_id]
  if (!node) {
    return { graph, selected, hints }
  }
  for (const key of ['text', 'opt_text', 'string', 'text_positive', 'positive', 'prompt', 'wildcard_text']) {
    if (Object.hasOwn(node.inputs, key)) {
      node.inputs[key] = hints.prompt
      break
    }
  }
  const negative = graph[args.workflow_settings.neg_node_id]
  if (negative && (config.default_negative.trim() || args.negative_prompt?.trim())) {
    for (const key of ['text', 'string', 'negative', 'text_negative', 'prompt']) {
      if (Object.hasOwn(negative.inputs, key)) {
        const parts = [
          String(negative.inputs[key] ?? '').trim(),
          config.default_negative.trim(),
          args.negative_prompt?.trim() ?? ''
        ].filter(Boolean)
        negative.inputs[key] = parts.join(', ')
        break
      }
    }
  }
  await applyLoras(graph, selected.selected, selected.clear, args.lora_control, roots)
  applySteps(graph, await stepOverrides(directory, filename))
  let seed = args.seed
  if (seed === undefined) {
    const bits = crypto.getRandomValues(new Uint32Array(2))
    seed = Number(((BigInt(bits[0]) << 32n) | BigInt(bits[1])) % 999999999999999n) + 1
  }
  let offset = 0
  for (const current of Object.values(graph)) {
    for (const key of ['seed', 'noise_seed']) {
      if (Object.hasOwn(current.inputs, key)) {
        current.inputs[key] = seed + offset
        offset += 1
      }
    }
  }
  signal.throwIfAborted()
  return { graph, selected, hints }
}
