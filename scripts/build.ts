import { resolve, join } from 'node:path'

const projectDir = resolve(import.meta.dir, '..')
const outdir = resolve(process.env.BOT_WEB_DIR ?? join(projectDir, 'dist'))
const child = Bun.spawn([process.execPath, 'run', 'build'], {
  cwd: join(projectDir, 'dashboard'),
  env: { ...process.env, BOT_WEB_DIR: outdir },
  stdout: 'inherit',
  stderr: 'inherit'
})
const code = await child.exited
if (code !== 0) {
  process.exit(code)
}
console.log('Built Pi Vue dashboard: ' + outdir)
