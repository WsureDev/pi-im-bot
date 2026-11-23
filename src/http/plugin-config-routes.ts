import { z } from 'zod'
import { storeConfigImage, readConfigFile, configFileName } from '../plugins/configuration/files'
import type { ConfigField } from '../plugins/configuration/schema'
import type { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import type { PluginConfigurationEditor } from '../plugins/configuration/editor'
import { PluginConfigTargetSchema, SavePluginConfigSchema } from '../plugins/configuration/contracts'
import { PluginOrderEditor } from '../plugins/configuration/order'
import { SavePluginOrderSchema } from '../plugins/configuration/order-contracts'
import { PluginPipelineEditor } from '../plugins/pipeline/editor'
import { SavePipelineSchema } from '../plugins/pipeline/contracts'
import { ReadConfigSecretsSchema } from '../plugins/configuration/secret-editor'

export function registerPluginConfigRoutes(
  app: Hono,
  editor: PluginConfigurationEditor,
  changed: () => void
) {
  app.post('/api/plugins/:id/configuration/files', async (c) => {
    const form = await c.req.formData()
    const pointer = z.string().startsWith('/').max(2000).parse(form.get('field'))
    const file = z.instanceof(File).parse(form.get('file'))
    const state = await editor.prepare(c.req.param('id'), { level: 'instance' })
    let fields = state.definition
    let selected: ConfigField | undefined
    for (const encoded of pointer.slice(1).split('/')) {
      const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
      selected = fields?.[key]
      fields = selected?.items
    }
    if (!selected || selected.type !== 'file' || selected.readonly) {
      throw new Error('此配置字段不接受文件')
    }
    const result = await storeConfigImage(
      editor.plugins.configuration().dataDir,
      c.req.param('id'),
      file,
      selected.file_types ?? ['png', 'jpg', 'jpeg']
    )
    return c.json(result, 201)
  })
  const order = new PluginOrderEditor(editor)
  app.get('/api/plugins/:id/configuration/files/:token/name', async (c) => {
    await editor.prepare(c.req.param('id'), { level: 'instance' })
    return c.json(
      await configFileName(editor.plugins.configuration().dataDir, c.req.param('id'), c.req.param('token'))
    )
  })
  app.get('/api/plugins/:id/configuration/files/:token', async (c) => {
    await editor.prepare(c.req.param('id'), { level: 'instance' })
    const file = await readConfigFile(
      editor.plugins.configuration().dataDir,
      c.req.param('id'),
      c.req.param('token'),
      0,
      5 * 1024 * 1024
    )
    return new Response(Buffer.from(file.data, 'base64'), {
      headers: { 'content-type': file.mimeType, 'cache-control': 'no-store' }
    })
  })
  const pipeline = new PluginPipelineEditor(editor)
  app.post(
    '/api/plugins/:id/configuration/secrets',
    sValidator('json', ReadConfigSecretsSchema),
    async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(await editor.readSecrets(c.req.param('id'), c.req.valid('json')))
    }
  )
  app.get('/api/plugins/pipeline', async (c) => {
    return c.json(await pipeline.read())
  })
  app.put('/api/plugins/pipeline', sValidator('json', SavePipelineSchema), async (c) => {
    const result = await pipeline.save(c.req.valid('json'))
    changed()
    return c.json(result)
  })
  app.get('/api/plugins/:id/order', async (c) => {
    let target: unknown = c.req.query()
    if (!Object.keys(c.req.query()).length) {
      target = { level: 'instance' }
    }
    return c.json(await order.read(c.req.param('id'), PluginConfigTargetSchema.parse(target)))
  })
  app.put('/api/plugins/:id/order', sValidator('json', SavePluginOrderSchema), async (c) => {
    const result = await order.save(c.req.param('id'), c.req.valid('json'))
    changed()
    return c.json(result)
  })
  app.get('/api/plugins/:id/configuration', async (c) => {
    let query: unknown = c.req.query()
    if (Object.keys(c.req.query()).length === 0) {
      query = { level: 'instance' }
    }
    return c.json(await editor.read(c.req.param('id'), PluginConfigTargetSchema.parse(query)))
  })
  app.put('/api/plugins/:id/configuration', sValidator('json', SavePluginConfigSchema), async (c) => {
    const value = await editor.save(c.req.param('id'), c.req.valid('json'))
    changed()
    return c.json(value)
  })
}
