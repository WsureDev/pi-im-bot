import { z } from 'zod'
import { ResourceProtocolSchema, ProviderDefinitionSchema, resourceInputSchema } from '../protocol'
import {
  ComfySubmitSchema,
  WorkflowSettingsSchema,
  LoraControlSchema,
  LoraSelectionSchema
} from '../native/comfy/contracts'

const SelectionSchema = z.object({
  workflow: z.string().optional(),
  workflow_settings: WorkflowSettingsSchema.prefault({})
})
const ItemSchema = z
  .object({ item: z.number().int().nonnegative(), ticket: z.string().max(160).optional() })
  .strict()
const ObjectOutput = { type: 'object' }
export const comfyWorkflowsProtocol = ResourceProtocolSchema.parse({
  id: 'pi.comfy-workflows@1',
  title: 'Comfy 工作流资源',
  description: '独立管理工作流、LoRA 元数据、原生图变换及持久任务回执；插件只负责政策、指令和消息组织。',
  methods: [
    {
      id: 'workflow_options',
      title: '工作流文件选项',
      effect: 'read',
      description: '列出资源工作流目录中的 API JSON，不返回 steps/lora/profile 辅助文件。',
      inputSchema: resourceInputSchema(z.object({}).strict()),
      outputSchema: z.toJSONSchema(z.object({ values: z.array(z.string()) }))
    },
    {
      id: 'catalogue',
      title: '工作流与模型声明',
      effect: 'read',
      description: '只读列出工作流和静态模型证据，不推测模型能力，不提交生成任务。',
      inputSchema: resourceInputSchema(SelectionSchema),
      outputSchema: ObjectOutput
    },
    {
      id: 'workflow_save',
      title: '保存工作流 JSON',
      effect: 'write',
      description: '向本资源目录保存原始工作流或 sidecar JSON，不允许路径逃逸。',
      inputSchema: resourceInputSchema(z.object({ filename: z.string().min(1), value: z.json() }).strict()),
      outputSchema: ObjectOutput
    },
    {
      id: 'steps',
      title: '工作流步数覆盖',
      effect: 'read',
      description: '读取按节点 ID 存储的步数 sidecar 和 ParameterBreak 节点。',
      inputSchema: resourceInputSchema(SelectionSchema),
      outputSchema: ObjectOutput
    },
    {
      id: 'steps_save',
      title: '保存步数覆盖',
      effect: 'write',
      description: '按原工作流文件写入步数配置，下次编译只替换引用这些 ParameterBreak 的 steps/steps_total。',
      inputSchema: resourceInputSchema(
        SelectionSchema.extend({ overrides: z.record(z.string(), z.number().int().positive()) })
      ),
      outputSchema: ObjectOutput
    },
    {
      id: 'lora_context',
      title: 'LoRA 元数据',
      effect: 'read',
      description: '合并工作流、配置目录和 sidecar 元数据，保留默认堆、别名、排除状态及完整触发词。',
      inputSchema: resourceInputSchema(SelectionSchema),
      outputSchema: ObjectOutput
    },
    {
      id: 'lora_preview',
      title: 'LoRA 选择预览',
      effect: 'read',
      description: '解析并预览选择和提示词注入，不提交 GPU 工作。',
      inputSchema: resourceInputSchema(
        SelectionSchema.extend({
          selections: z.array(LoraSelectionSchema),
          lora_control: LoraControlSchema.prefault({}),
          prompt: z.string().default('')
        })
      ),
      outputSchema: ObjectOutput
    },
    {
      id: 'submit',
      title: '提交已配置工作流',
      effect: 'write',
      description:
        '编译原 API 图并登记逐项持久回执；同一 Job/item 不重复提交。独立调用返回 ticket 供后续查询。',
      inputSchema: resourceInputSchema(ComfySubmitSchema),
      outputSchema: ObjectOutput
    },
    ...(['poll', 'recover', 'peek', 'reconcile', 'cancel'] as const).map((id) => {
      let effect = 'read'
      if (id === 'cancel') {
        effect = 'write'
      }
      return {
        id,
        title: id,
        effect,
        description: '只操作原任务回执；不重新提交，不使用全局 interrupt。',
        inputSchema: resourceInputSchema(ItemSchema),
        outputSchema: ObjectOutput
      }
    })
  ]
})
export const comfyWorkflowsProvider = ProviderDefinitionSchema.parse({
  id: 'comfyui-http',
  title: 'ComfyUI / Gateway 工作流',
  description: '原生 ComfyUI 工作流 API 及本地工作流资源；同样可连接兼容网关。',
  timeoutField: 'request_timeout_ms',
  operationTimeoutField: 'job_timeout_ms',
  optionIdentityFields: ['workflow_directory'],
  configuration: {
    server_address: {
      description: 'ComfyUI 服务端 IP、端口',
      type: 'string',
      hint: '请确保 ComfyUI 已启动并允许 API 访问',
      obvious_hint: true,
      default: '127.0.0.1:8188'
    },
    request_headers: { type: 'text', description: '请求 Header（JSON）', secret: true, default: '{}' },
    workflow_directory: {
      type: 'string',
      description: '工作流目录',
      default: '',
      hint: '留空使用本资源的独立持久目录，首次初始化复制原插件默认工作流。自定义目录只使用明确配置的已有目录。'
    },
    scan_directories: {
      type: 'text',
      description: 'LoRA 扫描目录',
      default: '',
      hint: '每行一个目录；只读模型文件名和 metadata.json，不加载或修改模型。'
    },
    default_negative: {
      type: 'text',
      description: '默认负面提示词',
      default: '',
      hint: '保留原 sub_config.negative_prompt；追加于工作流内置负面词之后、单次负面词之前。'
    },
    request_timeout_ms: {
      type: 'int',
      description: '单次 HTTP 请求预算（毫秒）',
      default: 300000,
      min: 1000
    },
    job_timeout_ms: {
      type: 'int',
      description: '后台等待预算（毫秒）',
      default: 0,
      min: 0,
      hint: '0 保留源批任务等待至终态的行为；取消和权限撤销仍立即生效。'
    }
  },
  mappings: comfyWorkflowsProtocol.methods.map((method) => {
    return {
      protocol: comfyWorkflowsProtocol.id,
      method: method.id,
      transport: { kind: 'registered', adapter: 'comfyui-http' }
    }
  })
})
