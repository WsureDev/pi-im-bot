import { Hono } from 'hono'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const project = resolve(import.meta.dir, '..')
const source = join(project, 'docs/prototypes/plugin-center')
const outdir = await mkdtemp('/tmp/pi-plugin-center-preview-')
const result = await Bun.build({
  entrypoints: [join(source, 'app.ts')],
  outdir,
  target: 'browser',
  minify: true
})
if (!result.success) {
  throw new Error(result.logs.join('\n'))
}
const app = new Hono()
app.get('/', () => {
  return new Response(Bun.file(join(source, 'index.html')))
})
app.get('/styles.css', () => {
  return new Response(Bun.file(join(source, 'styles.css')))
})
app.get('/app.js', () => {
  return new Response(Bun.file(join(outdir, 'app.js')))
})
app.get('/health', (context) => {
  return context.json({ ok: true, kind: 'plugin-design-preview' })
})
const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.PLUGIN_PREVIEW_PORT ?? 19336)
const server = Bun.serve({ hostname: '0.0.0.0', port, fetch: app.fetch })
console.log('监听：0.0.0.0:' + server.port)
console.log('插件中心交互设计预览：http://localhost:' + server.port)
console.log('仅使用示例数据，操作保存在浏览器，不连接正式 Bot。')
async function shutdown() {
  await server.stop(true)
  process.exit(0)
}
process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})
