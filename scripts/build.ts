import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const outdir = process.env.BOT_WEB_DIR ?? 'dist'
await mkdir(outdir, { recursive: true })
const result = await Bun.build({
  entrypoints: ['web/app.ts'],
  outdir,
  target: 'browser',
  minify: true,
  sourcemap: 'external'
})
if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}
await Bun.write(join(outdir, 'index.html'), await Bun.file('web/index.html').text())
await Bun.write(join(outdir, 'styles.css'), await Bun.file('web/styles.css').text())
await Bun.write(join(outdir, 'providers.css'), await Bun.file('web/providers/styles.css').text())
await Bun.write(join(outdir, 'plugins.css'), await Bun.file('web/plugins/styles.css').text())
console.log('Built Mock chat UI')
