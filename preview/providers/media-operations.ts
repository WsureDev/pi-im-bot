import { OperationSchema } from '../contracts/operations'

// These are provider-owned examples, not Bot capability categories.
export const speechOperation = OperationSchema.parse({
  id: 'synthesize',
  version: '1.0.0',
  title: '合成语音',
  description: '模拟适配器返回处理说明，不调用真实语音服务。',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', minLength: 1, maxLength: 1000 } },
    required: ['text'],
    additionalProperties: false
  },
  outputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false
  },
  inputUiSchema: {
    text: { type: 'text', description: '合成文本', default: '你好，这是操作演示', required: true }
  },
  example: { text: '你好，这是操作演示' },
  effect: 'write',
  timeoutMs: 5000
})
export const renderOperation = OperationSchema.parse({
  id: 'render',
  version: '1.0.0',
  title: '执行工作流',
  description: '模拟工作流执行，不提交 GPU 任务。',
  inputSchema: {
    type: 'object',
    properties: { prompt: { type: 'string', minLength: 1, maxLength: 5000 } },
    required: ['prompt'],
    additionalProperties: false
  },
  outputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false
  },
  inputUiSchema: { prompt: { type: 'text', description: '提示词', default: '窗边的一只猫', required: true } },
  example: { prompt: '窗边的一只猫' },
  effect: 'write',
  timeoutMs: 5000
})
