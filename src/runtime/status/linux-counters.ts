/** Linux sources and units follow Cockpit 337's internal metric sampler.
 * Independently implemented; sectors in /proc/diskstats are always 512 bytes.
 */
export function cpuCounters(text: string) {
  return text
    .split('\n')
    .filter((line) => {
      return /^cpu\d*\s/u.test(line)
    })
    .map((line) => {
      const [name, ...raw] = line.trim().split(/\s+/u)
      const values = raw.map(Number)
      // guest/guest_nice are already included in user/nice: never add twice.
      const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = values
      return {
        name,
        user,
        nice,
        system,
        idle,
        iowait,
        total: user + nice + system + idle + iowait + irq + softirq + steal
      }
    })
}
export function networkCounters(text: string) {
  return text.split('\n').flatMap((line) => {
    const match = /^\s*([^:]+):\s*(.+)$/u.exec(line)
    if (!match) {
      return []
    }
    const v = match[2].trim().split(/\s+/u).map(Number)
    if (v.length < 16 || !v.every(Number.isFinite)) {
      return []
    }
    return [
      {
        name: match[1].trim(),
        receivedBytes: v[0],
        sentBytes: v[8],
        receiveErrors: v[2],
        transmitErrors: v[10],
        receiveDrops: v[3],
        transmitDrops: v[11]
      }
    ]
  })
}
export function diskCounters(text: string) {
  return text
    .trim()
    .split('\n')
    .flatMap((line) => {
      const [major, , name, ...raw] = line.trim().split(/\s+/u)
      const v = raw.map(Number)
      if (!name || v.length < 11 || !v.every(Number.isFinite)) {
        return []
      }
      // Same physical-device aggregation policy as Cockpit; omit virtual loops too.
      if (
        major === '9' ||
        /^(dm-|loop|ram)/u.test(name) ||
        /^(sd|hd|vd).*\d$/u.test(name) ||
        /^nvme.*p\d+$/u.test(name) ||
        /^mmcblk.*p\d+$/u.test(name)
      ) {
        return []
      }
      return [
        { name, reads: v[0], readBytes: v[2] * 512, writes: v[4], writtenBytes: v[6] * 512, busyMs: v[9] }
      ]
    })
}
export function counterRate(before: number | undefined, after: number, elapsedMs: number): number | null {
  if (before === undefined || after < before || elapsedMs <= 0) {
    return null
  }
  return ((after - before) * 1000) / elapsedMs
}
