import { ConfigDefinitionSchema } from '../../plugins/configuration/schema'

export function connectionDefinition(endpoint: string) {
  return ConfigDefinitionSchema.parse({
    endpoint: { type: 'string', description: '服务地址', required: true, default: endpoint },
    headers: {
      type: 'text',
      description: '请求 Headers（JSON）',
      secret: true,
      default: '{}',
      editor_mode: true,
      editor_language: 'json'
    },
    timeoutMs: { type: 'int', description: '调用超时（毫秒）', default: 30000, min: 1000, max: 300000 }
  })
}
