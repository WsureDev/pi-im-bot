import type { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import type { OneBotAdapter } from '../channels/onebot/adapter'
import { QQIdSchema } from '../channels/onebot/config'
import { OneBotSettingsInputSchema } from '../channels/onebot/status'
import type { OneBotSettings } from '../channels/onebot/settings'

export function registerOneBotRoutes(app: Hono, settings: OneBotSettings, adapter: OneBotAdapter) {
  app.post(
    '/api/onebot/settings/token',
    sValidator('json', z.object({ version: z.string() }).strict()),
    async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(await settings.readToken(c.req.valid('json').version))
    }
  )
  app.get('/api/onebot/settings', async (c) => {
    return c.json(await settings.read())
  })
  app.put('/api/onebot/settings', sValidator('json', OneBotSettingsInputSchema), async (c) => {
    return c.json(await settings.save(c.req.valid('json')))
  })
  app.post('/api/onebot/groups/refresh', sValidator('json', z.object({ selfId: QQIdSchema })), async (c) => {
    return c.json(await adapter.refreshGroups(c.req.valid('json').selfId))
  })
}
