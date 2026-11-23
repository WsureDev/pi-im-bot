import { readMetricText as readMetric } from './proc'
import { open, readFile, readdir, statfs } from 'node:fs/promises'
import { LinuxMetricsSchema, type LinuxMetrics } from './linux-schema'
import { cpuCounters, networkCounters, diskCounters, counterRate } from './linux-counters'

async function counters(warnings: Set<string>) {
  const names = ['/proc/stat', '/proc/net/dev', '/proc/diskstats']
  const values = await Promise.all(
    names.map(async (path) => {
      try {
        return await readMetric(path)
      } catch {
        warnings.add(path + ': unavailable')
        return ''
      }
    })
  )
  return {
    at: performance.now(),
    cpu: cpuCounters(values[0]),
    network: networkCounters(values[1]),
    disk: diskCounters(values[2])
  }
}
async function temperatures(): Promise<LinuxMetrics['temperatures']> {
  const result: LinuxMetrics['temperatures'] = []
  for (const directory of (await readdir('/sys/class/hwmon')).slice(0, 64)) {
    const root = '/sys/class/hwmon/' + directory
    const name = (
      await readFile(root + '/name', 'utf8').catch(() => {
        return directory
      })
    ).trim()
    for (const file of (await readdir(root))
      .filter((name) => {
        return /^temp\d+_input$/u.test(name)
      })
      .slice(0, 32)) {
      const value =
        Number(
          (
            await readFile(root + '/' + file, 'utf8').catch(() => {
              return ''
            })
          ).trim()
        ) / 1000
      const label = (
        await readFile(root + '/' + file.replace('_input', '_label'), 'utf8').catch(() => {
          return file.replace('_input', '')
        })
      ).trim()
      if (Number.isFinite(value) && value > -100 && value < 250) {
        result.push({ name, label, celsius: value })
      }
    }
  }
  return result.slice(0, 256)
}
async function mounts(): Promise<LinuxMetrics['mounts']> {
  const entries = (await readMetric('/proc/mounts'))
    .split('\n')
    .flatMap((line) => {
      const [device, encoded, filesystem, options] = line.split(' ')
      if (
        !device?.startsWith('/') ||
        !encoded ||
        (device.includes('/loop') && options?.split(',').includes('ro'))
      ) {
        return []
      }
      return [
        {
          device,
          path: encoded.replace(/\\([0-7]{3})/gu, (_match, octal: string) => {
            return String.fromCharCode(Number.parseInt(octal, 8))
          }),
          filesystem
        }
      ]
    })
    .slice(0, 256)
  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const info = await statfs(entry.path)
      return {
        ...entry,
        totalBytes: info.blocks * info.bsize,
        usedBytes: (info.blocks - info.bfree) * info.bsize,
        availableBytes: info.bavail * info.bsize
      }
    })
  )
  return results.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value]
    }
    return []
  })
}
async function sample(): Promise<LinuxMetrics> {
  const warnings = new Set<string>()
  const before = await counters(warnings)
  await Bun.sleep(250)
  const after = await counters(warnings)
  const elapsed = Math.max(1, after.at - before.at)
  const cpu = after.cpu.map((value) => {
    const previous = before.cpu.find((entry) => {
      return entry.name === value.name
    })
    const total = value.total - (previous?.total ?? value.total)
    function ratio(current: number, old: number | undefined) {
      if (old === undefined || total <= 0 || current < old) {
        return null
      }
      return Math.min(100, (100 * (current - old)) / total)
    }
    const idle = ratio(value.idle + value.iowait, previous && previous.idle + previous.iowait)
    let usagePercent: number | null = null
    if (idle !== null) {
      usagePercent = 100 - idle
    }
    return {
      name: value.name,
      userPercent: ratio(value.user, previous?.user),
      nicePercent: ratio(value.nice, previous?.nice),
      systemPercent: ratio(value.system, previous?.system),
      ioWaitPercent: ratio(value.iowait, previous?.iowait),
      usagePercent
    }
  })
  const disks = after.disk.map((value) => {
    const previous = before.disk.find((entry) => {
      return entry.name === value.name
    })
    let busyPercent = counterRate(previous?.busyMs, value.busyMs, elapsed)
    if (busyPercent !== null) {
      busyPercent = Math.min(100, busyPercent / 10)
    }
    return {
      name: value.name,
      readBytes: value.readBytes,
      writtenBytes: value.writtenBytes,
      readBytesPerSecond: counterRate(previous?.readBytes, value.readBytes, elapsed),
      writtenBytesPerSecond: counterRate(previous?.writtenBytes, value.writtenBytes, elapsed),
      readsPerSecond: counterRate(previous?.reads, value.reads, elapsed),
      writesPerSecond: counterRate(previous?.writes, value.writes, elapsed),
      busyPercent
    }
  })
  const interfaces = after.network.map((value) => {
    const previous = before.network.find((entry) => {
      return entry.name === value.name
    })
    return {
      ...value,
      receivedBytesPerSecond: counterRate(previous?.receivedBytes, value.receivedBytes, elapsed),
      sentBytesPerSecond: counterRate(previous?.sentBytes, value.sentBytes, elapsed)
    }
  })
  let memory: LinuxMetrics['memory'] = null
  try {
    const values = new Map(
      [...(await readMetric('/proc/meminfo')).matchAll(/^(\w+):\s+(\d+) kB/gmu)].map((match) => {
        return [match[1], Number(match[2]) * 1024]
      })
    )
    memory = {
      freeBytes: values.get('MemFree') ?? 0,
      cachedBytes: values.get('Cached') ?? 0,
      buffersBytes: values.get('Buffers') ?? 0
    }
  } catch {
    warnings.add('memory detail unavailable')
  }
  const pressure: LinuxMetrics['pressure'] = []
  for (const resource of ['cpu', 'memory', 'io'] as const) {
    try {
      const text = await readMetric('/proc/pressure/' + resource)
      for (const match of text.matchAll(/^(some|full) avg10=([\d.]+) avg60=([\d.]+) avg300=([\d.]+)/gmu)) {
        let kind: 'some' | 'full' = 'some'
        if (match[1] === 'full') {
          kind = 'full'
        }
        pressure.push({
          resource,
          kind,
          avg10: Number(match[2]),
          avg60: Number(match[3]),
          avg300: Number(match[4])
        })
      }
    } catch {
      warnings.add(resource + ' pressure unavailable')
    }
  }
  return LinuxMetricsSchema.parse({
    source: 'procfs-sysfs',
    sampleMs: elapsed,
    cpu,
    memory,
    disks,
    interfaces,
    pressure,
    mounts: await mounts().catch(() => {
      warnings.add('mounts unavailable')
      return []
    }),
    temperatures: await temperatures().catch(() => {
      warnings.add('temperatures unavailable')
      return []
    }),
    warnings: [...warnings]
  })
}
let cached: { at: number; value: Promise<LinuxMetrics> } | undefined
export function collectLinuxMetrics() {
  if (!cached || Date.now() - cached.at > 1000) {
    cached = { at: Date.now(), value: sample() }
  }
  return cached.value
}
