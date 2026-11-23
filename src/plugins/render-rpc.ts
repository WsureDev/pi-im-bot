import { z } from 'zod'
import type { FileHandle } from 'node:fs/promises'
import { PluginPathSchema } from './manifest'
import type { PluginHostServices } from './rpc/services'
import type { ArtifactStore } from '../artifacts/store'
import { renderHtml } from '../services/render/html'

export function registerHtmlRender(
  host: PluginHostServices,
  openFile: (path: string) => Promise<FileHandle>,
  artifacts: ArtifactStore,
  pluginId: string,
  authorize: (grant: string) => void,
  render: typeof renderHtml = renderHtml
) {
  host.register(
    'render.html',
    'render.html',
    z.object({ path: PluginPathSchema, width: z.number().int().min(200).max(2048).default(500) }).strict(),
    async (input, context) => {
      authorize('render.html')
      authorize('artifact.write')
      const file = await openFile(input.path)
      let html: string
      try {
        if ((await file.stat()).size > 16 * 1024 * 1024) {
          throw new Error('HTML exceeds render budget')
        }
        const buffer = Buffer.alloc(16 * 1024 * 1024 + 1)
        const read = await file.read(buffer, 0, buffer.length, 0)
        if (read.bytesRead > 16 * 1024 * 1024) {
          throw new Error('HTML exceeds render budget')
        }
        html = buffer.subarray(0, read.bytesRead).toString('utf8')
      } finally {
        await file.close()
      }
      const png = await render(html, input.width, context.signal)
      authorize('render.html')
      authorize('artifact.write')
      const artifact = await artifacts.save('system-status.png', 'image/png', 'plugin:' + pluginId, png)
      return { id: artifact.id, name: artifact.name, mimeType: artifact.mimeType, bytes: artifact.bytes }
    }
  )
}
