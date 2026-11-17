import { z } from 'zod'
import { ProviderDeclarationSchema } from '../contracts/resources'
import type { PreviewProvider } from './contract'

export const httpProvider: PreviewProvider = {
  declaration: ProviderDeclarationSchema.parse({
    apiVersion: 2,
    id: 'provider-http.main',
    pluginId: 'provider-http',
    title: '普通 API 适配器',
    version: '1.0.0',
    description: '把一个业务查询 API 描述成标准操作。演示返回本地响应，不连接填写的地址。',
    display: { icon: 'mdi-server-network', columns: [{ key: 'method', title: 'HTTP 方法' }] },
    configurationSchema: {
      baseUrl: { type: 'string', description: '服务地址（模拟）', default: 'https://api.example.invalid' },
      apiKey: { type: 'string', description: 'API Key', secret: true, default: '' }
    },
    resourceSchema: { tenant: { type: 'string', description: '业务空间', default: 'demo' } },
    discovery: { mode: 'plugin-rpc', timeoutMs: 5000, maximumItems: 20 },
    operations: [
      {
        id: 'lookup',
        version: '1.0.0',
        title: '查询业务记录',
        description: '通过记录 ID 查询业务状态（模拟响应）。',
        inputSchema: {
          type: 'object',
          properties: { recordId: { type: 'string', pattern: '^[A-Z]-[0-9]{3}$' } },
          required: ['recordId'],
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          properties: {
            recordId: { type: 'string' },
            status: { type: 'string' },
            tenant: { type: 'string' }
          },
          required: ['recordId', 'status', 'tenant'],
          additionalProperties: false
        },
        inputUiSchema: {
          recordId: {
            type: 'string',
            description: '记录 ID',
            default: 'R-001',
            hint: '格式如 R-001',
            required: true
          }
        },
        example: { recordId: 'R-001' },
        effect: 'read',
        timeoutMs: 5000
      }
    ]
  }),
  async discover(_configuration, signal) {
    signal.throwIfAborted()
    return [
      {
        externalId: 'records',
        name: '业务查询 API',
        description: '普通 API 也可以作为资源，不需要 Bot 新增类型',
        attributes: { method: 'GET' },
        operationIds: ['lookup']
      }
    ]
  },
  async invoke(request, signal) {
    signal.throwIfAborted()
    const input = z.object({ recordId: z.string() }).parse(request.parameters)
    return {
      recordId: input.recordId,
      status: 'ready (demo)',
      tenant: String(request.resourceConfiguration.tenant)
    }
  }
}
