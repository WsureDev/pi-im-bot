import { speechOperation } from './media-operations'
import { ProviderDeclarationSchema } from '../contracts/resources'
import type { PreviewProvider } from './contract'

export const labProvider: PreviewProvider = {
  declaration: ProviderDeclarationSchema.parse({
    apiVersion: 2,
    id: 'provider-lab.main',
    pluginId: 'provider-lab',
    title: '实验室语音提供者',
    version: '1.0.0',
    description: '第三个实现：注册后自动出现配置表单和资源，无需给 Bot 新增供应商分支。',
    operations: [speechOperation],
    display: {
      icon: 'mdi-microphone',
      columns: [
        { key: 'language', title: '语言' },
        { key: 'quality', title: '音质' }
      ]
    },
    discovery: { mode: 'plugin-rpc', timeoutMs: 5000, maximumItems: 20 },
    configurationSchema: {
      region: { type: 'string', description: '资源区域', default: 'east', options: ['east', 'west'] },
      accessKey: { type: 'string', description: '访问凭据', secret: true, default: '' }
    },
    resourceSchema: {
      quality: {
        type: 'string',
        description: '输出音质',
        default: 'standard',
        options: ['standard', 'high']
      },
      sampleRate: { type: 'int', description: '采样率', default: 24000, options: [16000, 24000, 48000] }
    }
  }),
  async invoke(request, signal) {
    signal.throwIfAborted()
    return { summary: '模拟操作 ' + request.operationId + ' / ' + request.externalId + '；未调用上游服务' }
  },
  async discover(configuration, signal) {
    signal.throwIfAborted()
    return [
      {
        operationIds: ['synthesize'],
        externalId: 'studio-' + String(configuration.region),
        name: '实验室播音 · ' + String(configuration.region),
        description: '动态注册示例的模拟音色',
        attributes: { language: '中文', quality: 'standard' }
      }
    ]
  }
}
