import type { ConfigValues } from '../../src/plugins/configuration/schema'
import { z } from 'zod'
import { ProviderDeclarationSchema } from '../contracts/resources'
import type { PreviewProvider } from './contract'

const InputSchema = z.object({ text: z.string() })
export const filesProvider: PreviewProvider = {
  declaration: ProviderDeclarationSchema.parse({
    apiVersion: 2,
    id: 'provider-files.main',
    pluginId: 'provider-files',
    title: '文本处理后端',
    version: '1.0.0',
    description: '提供文本整理与统计操作；类型和字段完全由此适配器声明。只处理提交的文本，不读写宿主文件。',
    display: { icon: 'mdi-file-document-outline', columns: [{ key: 'backend', title: '后端' }] },
    configurationSchema: { label: { type: 'string', description: '后端名称', default: '本地演示处理器' } },
    resourceSchema: { prefix: { type: 'string', description: '输出前缀', default: '' } },
    discovery: { mode: 'plugin-rpc', timeoutMs: 5000, maximumItems: 20 },
    operations: [
      {
        id: 'normalize',
        version: '1.0.0',
        title: '整理文本',
        description: '修剪每行空白并去除空行，返回整理后的内容。',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', maxLength: 10000 } },
          required: ['text'],
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          properties: { content: { type: 'string' }, lineCount: { type: 'integer', minimum: 0 } },
          required: ['content', 'lineCount'],
          additionalProperties: false
        },
        inputUiSchema: {
          text: { type: 'text', description: '待处理文本', default: '  Hello  \n\n  World  ' }
        },
        example: { text: '  Hello  \n\n  World  ' },
        timeoutMs: 3000,
        effect: 'read'
      },
      {
        id: 'statistics',
        version: '1.0.0',
        title: '统计文本',
        description: '返回文本字符数与行数。',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', maxLength: 10000 } },
          required: ['text'],
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          properties: { characters: { type: 'integer' }, lines: { type: 'integer' } },
          required: ['characters', 'lines'],
          additionalProperties: false
        },
        inputUiSchema: { text: { type: 'text', description: '待统计文本', default: 'Hello\nWorld' } },
        example: { text: 'Hello\nWorld' },
        timeoutMs: 3000,
        effect: 'read'
      }
    ]
  }),
  async discover(configuration, signal) {
    signal.throwIfAborted()
    return [
      {
        externalId: 'documents',
        name: '文档处理实例',
        description: '一个资源暴露两项不同的操作',
        attributes: { backend: String(configuration.label) },
        operationIds: ['normalize', 'statistics']
      }
    ]
  },
  async invoke(request, signal): Promise<ConfigValues> {
    signal.throwIfAborted()
    const { text } = InputSchema.parse(request.parameters)
    if (request.operationId === 'statistics') {
      return { characters: [...text].length, lines: text.split('\n').length }
    }
    const lines = text
      .split('\n')
      .map((line) => {
        return line.trim()
      })
      .filter(Boolean)
    return {
      content: String(request.resourceConfiguration.prefix) + lines.join('\n'),
      lineCount: lines.length
    }
  }
}
