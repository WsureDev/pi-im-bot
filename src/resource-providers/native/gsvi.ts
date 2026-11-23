import { z } from 'zod'
import { callGsvi } from '../../services/gsvi/client'
import {
  GsviInputSchema,
  GsviServiceSchema,
  GsviNativeHeadersSchema,
  GsviVersionSchema
} from '../../services/gsvi/schema'
import { pythonCompare } from '../../services/gsvi/unicode'
import type { ResourceInstance } from '../protocol'
import type { NativeResourceAdapter } from './contracts'
import { storeVoiceCatalogue, readVoiceCatalogue } from './catalogue'
import { UncertainHostResult } from '../../plugins/rpc/uncertain'
import { createHash } from 'node:crypto'

const ConfigurationSchema = z.object({
  api_base: z.string(),
  api_key: z.string().default(''),
  request_headers: z.string().default('{}'),
  download_headers: z.string().default('{}'),
  timeout_ms: z.coerce.number().int().min(1000).default(180000),
  refresh_voices: z.boolean().default(false)
})
export function gsviResourceConnection(instance: ResourceInstance) {
  const input = ConfigurationSchema.parse(instance.configuration)
  return GsviServiceSchema.parse({
    id: 'r_' + createHash('sha256').update(instance.id).digest('hex').slice(0, 30),
    name: instance.name,
    kind: 'gsvi',
    enabled: instance.enabled,
    url: input.api_base,
    apiKey: input.api_key,
    timeoutMs: input.timeout_ms,
    nativeRequestHeaders: GsviNativeHeadersSchema.parse(JSON.parse(input.request_headers || '{}')),
    nativeDownloadHeaders: GsviNativeHeadersSchema.parse(JSON.parse(input.download_headers || '{}')),
    sourceCompatibleDownloads: true
  })
}
export const gsviNativeAdapter: NativeResourceAdapter = {
  id: 'gsvi-http',
  validate(instance) {
    gsviResourceConnection(instance)
  },
  async invoke(instance, method, parameters, context) {
    const service = gsviResourceConnection(instance)
    if (method === 'catalogue_read') {
      return { value: await readVoiceCatalogue(instance, parameters, context), artifactIds: [] }
    }
    if (['catalogue', 'voice_options'].includes(method)) {
      const { version } = z
        .object({ version: GsviVersionSchema.default('v4') })
        .strict()
        .parse(parameters)
      const result = await callGsvi(
        service,
        { action: 'voices', version },
        context.artifacts,
        context.signal,
        context.authorize
      )
      if (result.status !== 'voices') {
        throw new Error('GSVI 实时音色查询失败')
      }
      if (method === 'voice_options') {
        return { value: { values: Object.keys(result.models).sort(pythonCompare) }, artifactIds: [] }
      }
      const value = await storeVoiceCatalogue(instance, result.models, version, context)
      return { value, artifactIds: [value.reference, value.listReference] }
    }
    if (method === 'synthesize') {
      if (context.readOnly) {
        throw new Error('只读资源调用不能合成')
      }
      const result = await callGsvi(
        service,
        GsviInputSchema.parse({ ...parameters, action: 'synthesize' }),
        context.artifacts,
        context.signal,
        context.authorize
      )
      if (result.status === 'unknown') {
        throw new UncertainHostResult(result.message)
      }
      const artifactIds: string[] = []
      if (result.status === 'audio') {
        artifactIds.push(result.artifactId)
      }
      return { value: result, artifactIds }
    }
    throw new Error('GSVI 资源未声明该方法')
  }
}
