import type { MiddlewareHandler } from 'hono'
export const pluginOriginHeader = 'x-pi-plugin-request'
// A configured HTTP transport must not turn an isolated plugin into a console administrator.
export const rejectPluginConsoleAccess: MiddlewareHandler = async (c, next) => {
  if (c.req.header(pluginOriginHeader)) {
    return c.json({ error: '插件不能通过管理 HTTP 接口绕过有范围的宿主 RPC' }, 403)
  }
  await next()
}
