import { z } from 'zod'
import { join } from 'node:path'
import { revision } from '../../../settings/resolve'
import type { NativeResourceAdapter } from '../contracts'
import { ComfySubmitSchema, WorkflowSettingsSchema, ComfyResourceConfigurationSchema } from './contracts'
import {
  workflowDirectory,
  workflowNames,
  selectWorkflow,
  loadWorkflow,
  saveWorkflow,
  stepOverrides,
  writeJson
} from './workflows'
import { inspectModels } from './models'
import { loraCatalogue, scanRoots } from './lora-catalogue'
import { selectLoras, injectHints } from './lora-selection'
import { LoraControlSchema, LoraSelectionSchema } from './contracts'
import { compileNativeWorkflow } from './compile'
import { comfyResourceConnection } from './connection'
import { comfyResourceOwner, comfyResourceRuntime } from './runtime'
import { comfyRevision } from '../../../services/comfy/resources'
import { nativeDocument } from '../document'
import { unlink } from 'node:fs/promises'

const SelectionSchema = z.object({
  workflow: z.string().optional(),
  workflow_settings: WorkflowSettingsSchema.prefault({})
})
const ItemSchema = z
  .object({ item: z.number().int().nonnegative(), ticket: z.string().max(160).optional() })
  .strict()
export const comfyNativeAdapter: NativeResourceAdapter = {
  id: 'comfyui-http',
  validate(instance) {
    comfyResourceConnection(instance)
  },
  async record(instance, item, context, tx) {
    context.authorize()
    return comfyResourceRuntime(context).record(tx, comfyResourceOwner(instance, context), instance.id, item)
  },
  async invoke(instance, method, parameters, context) {
    const config = ComfyResourceConfigurationSchema.parse(instance.configuration)
    const service = comfyResourceConnection(instance, context.artifacts.maximumFileBytes)
    context.authorize()
    if (['submit', 'workflow_save', 'steps_save', 'cancel'].includes(method) && context.readOnly) {
      throw new Error('只读上下文不能修改 Comfy 资源')
    }
    if (['poll', 'recover', 'cancel', 'reconcile', 'peek'].includes(method)) {
      const input = ItemSchema.parse(parameters)
      const action = z.enum(['poll', 'recover', 'cancel', 'reconcile', 'peek']).parse(method)
      const value = await comfyResourceRuntime(context).inspect(
        comfyResourceOwner(instance, context, input.ticket),
        instance.id,
        input.item,
        action,
        context.artifacts,
        context.signal,
        (receipt) => {
          context.authorize()
          if (receipt.service.id !== service.id || receipt.serviceRevision !== comfyRevision(service)) {
            throw new Error('原生成资源配置已变化，未跨后端查询')
          }
        },
        action === 'reconcile'
      )
      return { value, artifactIds: value.artifactIds }
    }
    const directory = await workflowDirectory(instance, context)
    if (method === 'workflow_options') {
      return { value: { values: await workflowNames(directory) }, artifactIds: [] }
    }
    if (method === 'workflow_save') {
      const input = z
        .object({ filename: z.string().min(1), value: z.json() })
        .strict()
        .parse(parameters)
      const filename = await saveWorkflow(directory, input.filename, input.value, context.signal)
      context.optionsChanged?.(instance.id)
      return { value: { filename, files: await workflowNames(directory) }, artifactIds: [] }
    }
    const input = SelectionSchema.parse(parameters)
    if (method === 'catalogue') {
      let names = await workflowNames(directory)
      if (input.workflow) {
        names = [await selectWorkflow(directory, input.workflow, input.workflow_settings.json_file)]
      }
      const workflows = []
      for (const name of names) {
        context.signal.throwIfAborted()
        try {
          const graph = await loadWorkflow(directory, name)
          workflows.push({
            workflow: name,
            is_default: name === input.workflow_settings.json_file,
            ...inspectModels(graph),
            steps: await stepOverrides(directory, name)
          })
        } catch {
          workflows.push({ workflow: name, error: '工作流 JSON 不可读取或不是有效 API 图' })
        }
      }
      return nativeDocument(context, 'comfy-workflows.json', {
        default_workflow: input.workflow_settings.json_file,
        workflows
      })
    }
    const filename = await selectWorkflow(directory, input.workflow ?? '', input.workflow_settings.json_file)
    const graph = await loadWorkflow(directory, filename)
    if (method === 'steps_save') {
      const args = z
        .object({ overrides: z.record(z.string(), z.number().int().positive()) })
        .parse(parameters)
      const path = join(directory, filename.replace(/\.json$/u, '.steps.json'))
      if (Object.keys(args.overrides).length) {
        await writeJson(
          path,
          Object.fromEntries(
            Object.entries(args.overrides).map(([id, steps]) => {
              return [id, { steps }]
            })
          ),
          context.signal
        )
      } else {
        context.signal.throwIfAborted()
        await unlink(path).catch((error: unknown) => {
          if (!z.object({ code: z.literal('ENOENT') }).safeParse(error).success) {
            throw error
          }
        })
      }
      return { value: { workflow: filename, overrides: args.overrides }, artifactIds: [] }
    }
    if (method === 'steps') {
      return {
        value: {
          workflow: filename,
          overrides: await stepOverrides(directory, filename),
          nodes: Object.entries(graph)
            .filter(([, node]) => {
              return node.class_type === 'ParameterBreak'
            })
            .map(([id, node]) => {
              return { id, title: node._meta?.title ?? id }
            })
        },
        artifactIds: []
      }
    }
    if (method === 'lora_context' || method === 'lora_preview') {
      const roots = scanRoots(config.scan_directories)
      const catalogue = await loraCatalogue(graph, directory, filename, roots, context.signal)
      if (method === 'lora_context') {
        return nativeDocument(context, 'comfy-loras.json', { workflow: filename, ...catalogue })
      }
      const args = z
        .object({
          selections: z.array(LoraSelectionSchema),
          lora_control: LoraControlSchema.prefault({}),
          prompt: z.string().default('')
        })
        .parse(parameters)
      const selection = await selectLoras(catalogue, args.selections, args.lora_control, roots)
      return nativeDocument(context, 'comfy-lora-preview.json', {
        workflow: filename,
        ...catalogue,
        ...selection,
        ...injectHints(args.prompt, selection.selected, args.lora_control.inject_selected_prompt_hints)
      })
    }
    if (method === 'submit') {
      if (context.owner.phase === 'cancel' || context.owner.phase === 'reconcile') {
        throw new Error('取消或只读核对不能提交生成任务')
      }
      const args = ComfySubmitSchema.parse(parameters)
      const owner = comfyResourceOwner(instance, context)
      const value = await comfyResourceRuntime(context).submitNative(
        owner,
        instance.id,
        args.item,
        service,
        {
          id: filename,
          digest: revision({ filename, graph }),
          parameterDigest: revision(args),
          outputs: [args.workflow_settings.output_node_id],
          async prepare() {
            return (await compileNativeWorkflow(instance, directory, filename, graph, args, context.signal))
              .graph
          }
        },
        context.artifacts,
        context.signal,
        context.authorize
      )
      return {
        value: { ...value, ticket: context.owner.job ?? context.requestId },
        artifactIds: value.artifactIds
      }
    }
    throw new Error('未声明的 Comfy 资源方法')
  }
}
