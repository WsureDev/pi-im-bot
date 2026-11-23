import { z } from 'zod'
import { ResourceProtocolSchema, ProviderDefinitionSchema, resourceInputSchema } from '../protocol'
import { ResourceCompletionSchema } from '../native/model'
export const modelProtocol = ResourceProtocolSchema.parse({
  id: 'pi.text-generation@1',
  title: '受管文本生成',
  description: '复用框架当前模型组和请求级 fallback，仅执行无工具的单次文本请求，不创建第二个 Agent 循环。',
  methods: [
    {
      id: 'complete',
      title: '生成文本',
      description: '在原人格与调用取消信号下完成文本请求，连接凭据留在框架。',
      effect: 'write',
      inputSchema: resourceInputSchema(ResourceCompletionSchema),
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' } },
        required: ['text', 'provider', 'model']
      }
    }
  ]
})
export const modelProvider = ProviderDefinitionSchema.parse({
  id: 'framework-model',
  title: '框架模型组引用',
  description: '插件可复用当前聊天范围的模型组或明确选择的模型组；不重复保存 API Key。',
  configuration: {
    group: {
      type: 'string',
      description: '模型组 ID',
      default: '',
      hint: '留空使用调用范围的当前模型组；管理台调用使用全局默认模型组。'
    },
    timeoutMs: { type: 'int', description: '请求预算（毫秒）', default: 300000, min: 1000 }
  },
  mappings: [
    {
      protocol: modelProtocol.id,
      method: 'complete',
      transport: { kind: 'registered', adapter: 'framework-model' }
    }
  ]
})
