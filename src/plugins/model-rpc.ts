import { z } from 'zod'
import { normalizeContext, type UserMessage } from '@earendil-works/pi-ai'
import type { PluginHostServices } from './rpc/services'
import type { PluginInvocation } from './invocation'
import type { ArtifactStore } from '../artifacts/store'
import { ProviderCatalog } from '../providers/catalog'
import { createResponsesStream } from '../providers/responses'
import { projectImage } from '../media/image'

export function registerModelAnalysis(
  host: PluginHostServices,
  invocation: PluginInvocation,
  artifacts: ArtifactStore,
  pluginId: string,
  authorize: (grant: string) => void
) {
  let requests = 0
  host.register(
    'model.analyze',
    'model.analyze',
    z
      .object({
        prompt: z.string().max(32000),
        provider: z.string().max(500).default(''),
        imageArtifactId: z.uuid().optional(),
        vision: z.boolean().default(false)
      })
      .strict(),
    async (input, context) => {
      if (invocation.readOnly || ++requests > 2) {
        throw new Error('此操作最多允许两次受管模型分析')
      }
      authorize('model.analyze')
      invocation.services.assertActive?.()
      const catalog = invocation.config.catalog
      let provider = input.provider
      if (!provider && input.vision) {
        provider = invocation.input.context.effective.settings.preferences.visionProvider
      }
      let candidates = catalog.forGroup(invocation.input.context.effective.settings.preferences.providerGroup)
      if (provider) {
        candidates = [...catalog.candidates.values()].filter((candidate) => {
          return candidate.key === provider
        })
      }
      if (input.vision) {
        candidates = candidates.filter((candidate) => {
          return candidate.config.images
        })
      }
      if (!candidates.length) {
        return { available: false, text: '' }
      }
      const config = structuredClone(catalog.config)
      const group = 'plugin-analysis-' + crypto.randomUUID()
      config.groups.push({
        id: group,
        name: 'Plugin analysis',
        cooldownMs: 0,
        candidates: candidates.map((candidate) => {
          return { provider: candidate.provider.id, model: candidate.model.id }
        })
      })
      const isolated = await ProviderCatalog.create(config)
      const content: Exclude<UserMessage['content'], string> = [{ type: 'text', text: input.prompt }]
      if (input.imageArtifactId) {
        authorize('artifact.read')
        const artifact = await artifacts.content(input.imageArtifactId)
        if (artifact.metadata.source !== 'plugin:' + pluginId) {
          throw new Error('图片分析仅允许此插件生成的产物')
        }
        if (!artifact.metadata.mimeType.startsWith('image/') || artifact.metadata.bytes > 8 * 1024 * 1024) {
          throw new Error('分析只接受当前范围内不超过8MiB的图片产物')
        }
        const image = await projectImage(
          new Uint8Array(await artifact.file.arrayBuffer()),
          2048,
          8 * 1024 * 1024
        )
        content.push({ type: 'image', data: image.data, mimeType: image.mimeType })
      }
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(60000)])
      const stream = createResponsesStream(isolated, group, { preview() {}, attempt() {} })
      const result = await stream(
        candidates[0].model,
        normalizeContext({ messages: [{ role: 'user', content, timestamp: Date.now() }] }),
        { signal }
      ).result()
      signal.throwIfAborted()
      authorize('model.analyze')
      if (result.stopReason === 'error' || result.stopReason === 'aborted') {
        throw new Error('受管状态分析未完成')
      }
      return {
        available: true,
        text: result.content
          .flatMap((part) => {
            if (part.type === 'text') {
              return [part.text]
            }
            return []
          })
          .join('')
      }
    }
  )
}
