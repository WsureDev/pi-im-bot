import { speechOperation } from './media-operations'
import { ProviderDeclarationSchema } from '../contracts/resources'
import type { PreviewProvider } from './contract'

export const gsviProvider: PreviewProvider = {
  declaration: ProviderDeclarationSchema.parse({
    apiVersion: 2,
    id: 'provider-gsvi.main',
    pluginId: 'provider-gsvi',
    title: 'GSVI 语音提供者',
    version: '1.0.0',
    description: 'Provider 插件负责连接和发现；操作和数据结构由本插件声明。发现结果为本地样例。',
    operations: [speechOperation],
    display: {
      icon: 'mdi-microphone',
      columns: [
        { key: 'language', title: '语言' },
        { key: 'version', title: '接口版本' }
      ]
    },
    discovery: { mode: 'plugin-rpc', timeoutMs: 10000, maximumItems: 100 },
    configurationSchema: {
      endpoint: {
        type: 'string',
        description: '服务地址（Demo 不会连接）',
        default: 'https://gsvi.example.invalid',
        required: true
      },
      apiKey: { type: 'string', description: 'API Key', secret: true, default: '' },
      version: { type: 'string', description: '接口版本', default: 'v4', options: ['v2', 'v4'] }
    },
    resourceSchema: {
      language: {
        type: 'string',
        description: '合成语言',
        default: '中文',
        options: ['中文', '日语', '英语']
      },
      speed: { type: 'float', description: '语速', default: 1, slider: { min: 0.5, max: 2, step: 0.1 } },
      maxCharacters: { type: 'int', description: '单次字数', default: 120, min: 1, max: 1000 }
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
        externalId: 'hana',
        name: '花音 · 中文',
        description: '演示音色，未请求任何真实语音服务',
        attributes: { language: '中文', version: String(configuration.version) }
      },
      {
        operationIds: ['synthesize'],
        externalId: 'nagi',
        name: '凪 · 日语',
        description: '由同一个 Provider 动态登记的第二项资源',
        attributes: { language: '日语', version: String(configuration.version) }
      }
    ]
  }
}
