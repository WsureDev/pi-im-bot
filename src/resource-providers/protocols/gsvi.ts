import { z } from 'zod'
import configuration from '../native/gsvi-configuration.json'
import { ResourceProtocolSchema, ProviderDefinitionSchema, resourceInputSchema } from '../protocol'
import {
  GsviCatalogueSchema,
  GsviCatalogueReadSchema,
  GsviCatalogueMatchSchema,
  GsviCataloguePageSchema
} from '../../services/gsvi/catalogue-contract'
import { GsviResultSchema, GsviVersionSchema } from '../../services/gsvi/schema'

const VersionSchema = z.object({ version: GsviVersionSchema.default('v4') }).strict()
const SynthesisSchema = z
  .object({
    version: GsviVersionSchema.default('v4'),
    text: z.string().min(1),
    voice: z.string().min(1),
    textLang: z.string().min(1).default('中文'),
    emotion: z.string().min(1).default('默认'),
    promptTextLang: z.string().default('')
  })
  .strict()
export const gsviProtocol = ResourceProtocolSchema.parse({
  id: 'pi.gsvi@1',
  title: 'GSVI 语音服务',
  description:
    'GSVI 版本化音色目录和 WAV 合成。完整目录通过受管引用读取，未知提交不重放，凭据只由资源适配器使用。',
  methods: [
    {
      id: 'catalogue',
      title: '实时音色目录',
      effect: 'read',
      description: '查询当前版本全部角色/语言/情绪，返回完整 JSON 和有序角色列表的产物引用，不截断目录。',
      inputSchema: resourceInputSchema(VersionSchema),
      outputSchema: z.toJSONSchema(GsviCatalogueSchema),
      example: { version: 'v4' }
    },
    {
      id: 'catalogue_read',
      title: '读取或校验音色目录',
      effect: 'read',
      description: '分页读取原资源版本的完整目录，或精确验证角色及情绪。',
      inputSchema: resourceInputSchema(GsviCatalogueReadSchema),
      outputSchema: z.toJSONSchema(z.union([GsviCataloguePageSchema, GsviCatalogueMatchSchema]))
    },
    {
      id: 'voice_options',
      title: '配置页音色选项',
      effect: 'read',
      description: '后台刷新配置页选项，失败由宿主保留上次成功列表和当前选择。',
      inputSchema: resourceInputSchema(VersionSchema),
      outputSchema: z.toJSONSchema(z.object({ values: z.array(z.string()) }).strict()),
      example: { version: 'v4' }
    },
    {
      id: 'synthesize',
      title: '合成 WAV',
      effect: 'write',
      description: '合成、按源认证下载及产物保存共享预算，返回音频产物；失败保留文字，未确认提交不自动重试。',
      inputSchema: resourceInputSchema(SynthesisSchema),
      outputSchema: z.toJSONSchema(GsviResultSchema)
    }
  ]
})
export const gsviProvider = ProviderDefinitionSchema.parse({
  id: 'gsvi-http',
  title: 'GSVI HTTP',
  description: '直接接入 GSVI 后端，独立于自动短文本语音插件。',
  configuration,
  timeoutField: 'timeout_ms',
  optionIdentityFields: ['api_base'],
  mappings: gsviProtocol.methods.map((method) => {
    return {
      protocol: gsviProtocol.id,
      method: method.id,
      transport: { kind: 'registered', adapter: 'gsvi-http' }
    }
  })
})
