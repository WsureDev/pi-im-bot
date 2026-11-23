import type { NativeGraph } from './contracts'
import { z } from 'zod'
import { lexical } from './workflows'

const inputs: Record<string, Record<string, string>> = {
  CheckpointLoaderSimple: { ckpt_name: 'checkpoint' },
  CheckpointLoader: { ckpt_name: 'checkpoint' },
  UNETLoader: { unet_name: 'diffusion' },
  DiffusionModelLoader: { unet_name: 'diffusion' },
  CLIPLoader: { clip_name: 'text_encoder' },
  DualCLIPLoader: { clip_name1: 'text_encoder', clip_name2: 'text_encoder' },
  TripleCLIPLoader: { clip_name1: 'text_encoder', clip_name2: 'text_encoder', clip_name3: 'text_encoder' },
  VAELoader: { vae_name: 'vae' },
  UpscaleModelLoader: { model_name: 'upscale' },
  ControlNetLoader: { control_net_name: 'controlnet' },
  DiffControlNetLoader: { control_net_name: 'controlnet' },
  LoraLoader: { lora_name: 'lora' },
  LoraLoaderModelOnly: { lora_name: 'lora' }
}
export function inspectModels(graph: NativeGraph) {
  const models: Array<{
    node_id: string
    class_type: string
    role: string
    input: string
    filename: string
    encoder_type?: string
  }> = []
  const unresolved: Array<{
    node_id: string
    class_type: string
    input: string
    role?: string
    reason: string
    link?: unknown[]
  }> = []
  const unrecognized_loaders: Array<{ node_id: string; class_type: string }> = []
  let inactive_lora_count = 0
  for (const [node_id, node] of Object.entries(graph)) {
    const fields = inputs[node.class_type]
    for (const [input, role] of Object.entries(fields ?? {})) {
      const filename = node.inputs[input]
      if (typeof filename === 'string' && filename.trim()) {
        const entry = {
          node_id,
          class_type: node.class_type,
          role,
          input,
          filename,
          encoder_type: undefined as string | undefined
        }
        if (role === 'text_encoder' && typeof node.inputs.type === 'string') {
          entry.encoder_type = node.inputs.type
        }
        models.push(entry)
      } else {
        let link: unknown[] | undefined
        if (Array.isArray(filename) && filename.length === 2) {
          link = filename
        }
        unresolved.push({
          node_id,
          class_type: node.class_type,
          input,
          role,
          reason: '模型输入不是静态文件名，无法确定',
          link
        })
      }
    }
    const stack = z
      .object({
        __value__: z.array(z.json())
      })
      .safeParse(node.inputs.loras)
    if (stack.success) {
      for (const raw of stack.data.__value__) {
        const parsed = z.object({ name: z.json().optional(), active: z.json().optional() }).safeParse(raw)
        if (!parsed.success) {
          continue
        }
        const lora = parsed.data
        let active = Boolean(lora.active)
        if (Array.isArray(lora.active)) {
          active = lora.active.length > 0
        } else if (lora.active && typeof lora.active === 'object') {
          active = Object.keys(lora.active).length > 0
        }
        if (active && typeof lora.name === 'string' && lora.name.trim()) {
          models.push({
            node_id,
            class_type: node.class_type,
            role: 'lora',
            input: 'loras',
            filename: lora.name
          })
        } else if (!active) {
          inactive_lora_count += 1
        } else {
          unresolved.push({
            node_id,
            class_type: node.class_type,
            input: 'loras',
            reason: '启用的 LoRA 缺少文件名'
          })
        }
      }
    } else if (!fields && /load/iu.test(node.class_type)) {
      unrecognized_loaders.push({ node_id, class_type: node.class_type })
    }
  }
  return {
    models,
    unresolved_inputs: unresolved,
    unrecognized_loaders,
    inactive_lora_count,
    node_types: [
      ...new Set(
        Object.values(graph).map((node) => {
          return node.class_type
        })
      )
    ].sort(lexical)
  }
}
