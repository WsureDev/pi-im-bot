import type { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'
import type { HttpServices } from './app'
import { StateKeySchema } from '../plugins/state/store'
const TargetSchema = z
  .object({
    area: z.enum(['scope', 'instance']),
    key: StateKeySchema.shape.key,
    scope: z.string().min(1).optional()
  })
  .strict()
const ImportSchema = TargetSchema.extend({
  version: z.number().int().nonnegative(),
  value: z.json()
}).strict()
/** Console-only migration entry; the global plugin-origin middleware also covers these routes. */
export function registerPluginStateRoutes(app: Hono, services: HttpServices) {
  function target(id: string, input: z.infer<typeof TargetSchema>, writing = false) {
    const instance = services.configuration().resources.config.plugins.find((entry) => {
      return entry.id === id
    })
    if (!instance) {
      throw new Error('插件实例不存在')
    }
    if (writing && instance.enabled) {
      throw new Error('请先停用目标插件，再导入已审阅的持久状态')
    }
    let scope = 'instance'
    if (input.area === 'scope') {
      if (!input.scope) {
        throw new Error('范围状态必须明确指定 Pi 聊天范围 ID')
      }
      services.coordinator.requireRoom(input.scope)
      scope = input.scope
    }
    const state = services.coordinator.plugins?.managed?.state
    if (!state) {
      throw new Error('持久状态服务不可用')
    }
    return { state, scope }
  }
  app.post('/api/plugins/:id/state/read', sValidator('json', TargetSchema), async (c) => {
    const input = c.req.valid('json')
    const id = c.req.param('id')
    const { state, scope } = target(id, input)
    return c.json(await state.read(id, scope, { area: input.area, key: input.key }))
  })
  app.post('/api/plugins/:id/state/import', sValidator('json', ImportSchema), async (c) => {
    const input = c.req.valid('json')
    const id = c.req.param('id')
    const { state, scope } = target(id, input, true)
    const result = await state.compare(
      id,
      scope,
      { area: input.area, key: input.key, value: input.value, version: input.version },
      () => {
        target(id, input, true)
      }
    )
    if (!result.applied) {
      return c.json({ error: '状态版本已变化，请重新导出并审阅' }, 409)
    }
    return c.json(result)
  })
}
