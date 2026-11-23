import { z } from 'zod'
import { revision } from '../../settings/resolve'
import { pythonCompare } from '../../services/gsvi/unicode'
import { GsviModelsSchema } from '../../services/gsvi/schema'
import { GsviCatalogueReadSchema } from '../../services/gsvi/catalogue-contract'
import type { ResourceInstance } from '../protocol'
import type { ResourceNativeContext } from './contracts'

function source(instance: ResourceInstance) {
  return 'resource-catalogue:' + instance.id + ':' + revision(instance.configuration) + ':'
}
export async function storeVoiceCatalogue(
  instance: ResourceInstance,
  models: z.infer<typeof GsviModelsSchema>['models'],
  version: string,
  context: ResourceNativeContext
) {
  context.authorize()
  const names = Object.keys(models).sort(pythonCompare)
  const base = source(instance) + version
  const owner = base + ':' + revision(models)
  const store = context.artifacts.forOwner(owner)
  const files = await store.owned(owner)
  let model = files.find((entry) => {
    return entry.source === base + ':models'
  })
  let list = files.find((entry) => {
    return entry.source === base + ':names'
  })
  if (!model) {
    model = await store.save(
      'gsvi-models-' + version + '.json',
      'application/json',
      base + ':models',
      JSON.stringify({ models })
    )
  }
  if (!list) {
    list = await store.save(
      'gsvi-voices-' + version + '.txt',
      'text/plain',
      base + ':names',
      names.join('\n')
    )
  }
  context.authorize()
  return { status: 'catalogue', reference: model.id, listReference: list.id, count: names.length, version }
}
export async function readVoiceCatalogue(
  instance: ResourceInstance,
  raw: unknown,
  context: ResourceNativeContext
) {
  const input = GsviCatalogueReadSchema.parse(raw)
  context.authorize()
  const { metadata, file } = await context.artifacts.content(input.reference)
  if (!metadata.source.startsWith(source(instance))) {
    throw new Error('目录不属于原资源版本')
  }
  if (input.action === 'page') {
    if (input.offset > metadata.bytes) {
      throw new Error('目录偏移超出范围')
    }
    const bytes = Buffer.from(await file.slice(input.offset, input.offset + 49152).arrayBuffer())
    context.authorize()
    return {
      offset: input.offset,
      nextOffset: input.offset + bytes.length,
      bytes: metadata.bytes,
      base64: bytes.toString('base64'),
      hasMore: input.offset + bytes.length < metadata.bytes
    }
  }
  if (!metadata.source.endsWith(':models')) {
    throw new Error('此引用不是模型目录')
  }
  const { models } = GsviModelsSchema.parse(JSON.parse(await file.text()))
  context.authorize()
  const model = models[input.voice]
  return {
    exists: model !== undefined,
    emotion:
      model !== undefined &&
      Object.values(model).some((entry) => {
        return entry.includes(input.emotion)
      })
  }
}
