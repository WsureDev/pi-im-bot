import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { runDevelopment } from '../scripts/development'

test('a failed development child stops its peer and preserves its exit status', async () => {
  const root = await mkdtemp('/tmp/pi-development-')
  const pidFile = root + '/peer.pid'
  try {
    const code = await runDevelopment([
      {
        cmd: [
          process.execPath,
          '-e',
          'await Bun.write(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)',
          pidFile
        ],
        cwd: root
      },
      {
        cmd: [
          process.execPath,
          '-e',
          'const deadline = Date.now() + 2000; while (!(await Bun.file(process.argv[1]).exists())) { if (Date.now() > deadline) process.exit(2); await Bun.sleep(10) } process.exit(7)',
          pidFile
        ],
        cwd: root
      }
    ])
    expect(code).toBe(7)
    const pid = Number(await Bun.file(pidFile).text())
    expect(() => process.kill(pid, 0)).toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
