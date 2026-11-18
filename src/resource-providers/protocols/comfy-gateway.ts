import { z } from 'zod'
import { ResourceProtocolSchema, ProviderDefinitionSchema } from '../protocol'
import { connectionDefinition } from './configuration'

const EmptySchema = z.object({}).strict()
const IdSchema = z.object({ id: z.string().min(1).max(128) }).strict()
const GraphSchema = z.record(
  z.string(),
  z
    .object({
      class_type: z.string(),
      inputs: z.record(z.string(), z.json()),
      _meta: z.record(z.string(), z.json()).optional()
    })
    .passthrough()
)
export const comfyGatewayProtocol = ResourceProtocolSchema.parse({
  id: 'pi.comfy-gateway@1',
  title: 'Comfy 网关',
  description:
    '网关管理原生 API prompt 图和持久任务；提交返回 prompt_id，仅代表受理。用同一 ID 查询和取消，不重建任务。网关不提供命名工作流模板目录。',
  methods: [
    {
      id: 'models',
      title: '注册模型',
      effect: 'read',
      description: '读取网关注册模型及其可运行 worker。',
      inputSchema: z.toJSONSchema(EmptySchema),
      outputSchema: { type: 'object', properties: { models: { type: 'array' } }, required: ['models'] }
    },
    {
      id: 'inventory',
      title: '模型与节点清单',
      effect: 'read',
      description: '读取 worker 实际可用节点和模型，不触发扫描或生成。',
      inputSchema: z.toJSONSchema(EmptySchema),
      outputSchema: { type: 'object' }
    },
    {
      id: 'submit',
      title: '提交生成任务',
      effect: 'write',
      description:
        '提交原生 API 格式 prompt 图；X-Idempotency-Key 使用本次调用 ID。返回受理 ID，网络异常时结果未确认，不自动重试。',
      inputSchema: z.toJSONSchema(
        z
          .object({
            prompt: GraphSchema,
            client_id: z.string().optional(),
            extra_data: z.record(z.string(), z.json()).optional()
          })
          .strict()
      ),
      outputSchema: {
        type: 'object',
        properties: {
          prompt_id: { type: 'string' },
          number: { type: 'number' },
          node_errors: { type: 'object' }
        },
        required: ['prompt_id']
      }
    },
    {
      id: 'status',
      title: '查询任务',
      effect: 'read',
      description: '按原 prompt_id 查询持久任务；未找到时返回失败，不重新提交。',
      inputSchema: z.toJSONSchema(IdSchema),
      outputSchema: { type: 'object' }
    },
    {
      id: 'history',
      title: '查询结果',
      effect: 'read',
      description: '按原 prompt_id 获取 Comfy history；空对象表示暂无 history，不表示失败或可以重提。',
      inputSchema: z.toJSONSchema(IdSchema),
      outputSchema: { type: 'object' }
    },
    {
      id: 'cancel',
      title: '取消指定任务',
      effect: 'write',
      description: '精确取消原任务，绝不使用全局中断或清空队列。',
      inputSchema: z.toJSONSchema(IdSchema),
      outputSchema: { type: 'object' }
    }
  ]
})
export const comfyGatewayProvider = ProviderDefinitionSchema.parse({
  id: 'comfy-gateway',
  title: 'Comfy Gateway',
  description: '通过现有网关 API 接入模型查询、生成任务、状态、结果和精确取消。',
  configuration: connectionDefinition('http://localhost:19189'),
  mappings: [
    {
      protocol: comfyGatewayProtocol.id,
      method: 'models',
      transport: { kind: 'http', method: 'GET', path: '/gateway/v1/models' }
    },
    {
      protocol: comfyGatewayProtocol.id,
      method: 'inventory',
      transport: { kind: 'http', method: 'GET', path: '/gateway/v1/model-inventory' }
    },
    {
      protocol: comfyGatewayProtocol.id,
      method: 'submit',
      transport: { kind: 'http', method: 'POST', path: '/prompt', idempotencyHeader: 'X-Idempotency-Key' }
    },
    {
      protocol: comfyGatewayProtocol.id,
      method: 'status',
      transport: { kind: 'http', method: 'GET', path: '/gateway/v1/jobs/{id}' }
    },
    {
      protocol: comfyGatewayProtocol.id,
      method: 'history',
      transport: { kind: 'http', method: 'GET', path: '/history/{id}' },
      files: {
        itemsPath: '/*/outputs/*/images/*',
        path: '/view',
        query: { filename: 'filename', subfolder: 'subfolder', type: 'type' }
      }
    },
    {
      protocol: comfyGatewayProtocol.id,
      method: 'cancel',
      transport: { kind: 'http', method: 'POST', path: '/gateway/v1/jobs/{id}/cancel' }
    }
  ]
})
