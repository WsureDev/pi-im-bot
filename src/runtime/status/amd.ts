import { readFile, readdir, realpath } from 'node:fs/promises'
import type { GpuStatus } from './schema'

async function number(path: string) {
  const text = await readFile(path, 'utf8').catch(() => {
    return ''
  })
  if (!text.trim()) {
    return null
  }
  const value = Number(text.trim())
  if (!Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}
const names = new Map<string, string>()
async function deviceName(root: string, card: string) {
  const address = (await realpath(root)).split('/').at(-1) ?? ''
  if (names.has(address)) {
    return names.get(address)!
  }
  let name = 'AMD GPU (' + card + ')'
  if (/^[a-f0-9]{4}:[a-f0-9]{2}:[a-f0-9]{2}\.[0-7]$/iu.test(address)) {
    try {
      const child = Bun.spawn(['/usr/bin/lspci', '-mm', '-s', address], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'ignore',
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }
      })
      const timeout = setTimeout(() => {
        return child.kill('SIGKILL')
      }, 1000)
      try {
        const output = await new Response(child.stdout).text()
        const fields = [...output.matchAll(/"([^"]*)"/gu)].map((match) => {
          return match[1]
        })
        if ((await child.exited) === 0 && fields[2]) {
          name = fields[2].slice(0, 300)
        }
      } finally {
        clearTimeout(timeout)
      }
    } catch {}
  }
  names.set(address, name)
  return name
}
export async function probeAmdGpu(): Promise<GpuStatus | undefined> {
  const devices: GpuStatus['devices'] = []
  const cards = await readdir('/sys/class/drm').catch(() => {
    return []
  })
  for (const card of cards
    .filter((name) => {
      return /^card\d+$/u.test(name)
    })
    .slice(0, 16)) {
    const root = '/sys/class/drm/' + card + '/device'
    if (
      (
        await readFile(root + '/vendor', 'utf8').catch(() => {
          return ''
        })
      ).trim() !== '0x1002'
    ) {
      continue
    }
    const total = await number(root + '/mem_info_vram_total')
    const used = await number(root + '/mem_info_vram_used')
    if (total === null || used === null) {
      continue
    }
    let temperatureC: number | null = null
    let powerWatts: number | null = null
    for (const monitor of (
      await readdir(root + '/hwmon').catch(() => {
        return []
      })
    ).slice(0, 4)) {
      const temp = await number(root + '/hwmon/' + monitor + '/temp1_input')
      const power = await number(root + '/hwmon/' + monitor + '/power1_average')
      if (temp !== null) {
        temperatureC = temp / 1000
      }
      if (power !== null) {
        powerWatts = power / 1000000
      }
    }
    devices.push({
      index: Number(card.slice(4)),
      id: 'amd:' + card,
      name: await deviceName(root, card),
      memoryTotalBytes: total,
      memoryUsedBytes: used,
      utilizationPercent: await number(root + '/gpu_busy_percent'),
      temperatureC,
      powerWatts
    })
  }
  if (!devices.length) {
    return undefined
  }
  return { provider: 'amd', source: 'sysfs', devices }
}
