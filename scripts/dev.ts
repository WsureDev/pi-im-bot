import { resolve, join } from 'node:path'
import { runDevelopment } from './development'

const project = resolve(import.meta.dir, '..')
process.exitCode = await runDevelopment([
  { cmd: [process.execPath, '--watch', 'src/main.ts'], cwd: project },
  {
    cmd: [process.execPath, 'node_modules/vite/bin/vite.js', '--host', '0.0.0.0'],
    cwd: join(project, 'dashboard')
  }
])
