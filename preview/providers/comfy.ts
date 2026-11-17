import { renderOperation } from './media-operations'
import { ProviderDeclarationSchema } from '../contracts/resources'
import type { PreviewProvider } from './contract'

export const comfyProvider: PreviewProvider = {
  declaration: ProviderDeclarationSchema.parse({
    apiVersion: 2,
    id: 'provider-comfy.main',
    pluginId: 'provider-comfy',
    title: 'ComfyUI 图像提供者',
    version: '1.0.0',
    description: '工作流发现与执行适配由插件实现，Bot 不写死 ComfyUI 资源页。',
    operations: [renderOperation],
    display: {
      icon: 'mdi-image-outline',
      columns: [
        { key: 'model', title: '模型系列' },
        { key: 'mode', title: '模式' }
      ]
    },
    discovery: { mode: 'plugin-rpc', timeoutMs: 10000, maximumItems: 100 },
    configurationSchema: {
      endpoint: {
        type: 'string',
        description: '服务地址（Demo 不会连接）',
        default: 'https://comfy.example.invalid',
        required: true
      },
      token: { type: 'string', description: '服务凭据', secret: true, default: '' },
      collection: {
        type: 'string',
        description: '发现目录',
        default: 'reviewed',
        options: ['reviewed', 'all-examples']
      }
    },
    resourceSchema: {
      width: {
        type: 'int',
        description: '图片宽度',
        default: 1024,
        slider: { min: 512, max: 1536, step: 64 }
      },
      height: {
        type: 'int',
        description: '图片高度',
        default: 1024,
        slider: { min: 512, max: 1536, step: 64 }
      },
      steps: { type: 'int', description: '采样步数', default: 24, min: 1, max: 80 },
      negative: { type: 'text', description: '负面提示词', default: '' }
    }
  }),
  async invoke(request, signal) {
    signal.throwIfAborted()
    return { summary: '模拟操作 ' + request.operationId + ' / ' + request.externalId + '；未调用上游服务' }
  },
  async discover(configuration, signal) {
    signal.throwIfAborted()
    const resources = [
      {
        operationIds: ['render'],
        externalId: 'text2image',
        name: '通用文生图',
        description: '本地模拟工作流；不会提交 GPU 任务',
        attributes: { model: '示例图像模型', mode: '文生图' }
      }
    ]
    if (configuration.collection === 'all-examples') {
      resources.push({
        operationIds: ['render'],
        externalId: 'illustration',
        name: '插画工作流',
        description: '改变提供者配置后，发现目录增加此项',
        attributes: { model: '示例插画模型', mode: '文生图' }
      })
    }
    return resources
  }
}
