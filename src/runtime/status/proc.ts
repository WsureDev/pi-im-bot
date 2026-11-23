import { open } from 'node:fs/promises'

/** procfs can return short reads before EOF; consume every chunk within a fixed budget. */
export async function readMetricText(path: string) {
  const file = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(512 * 1024 + 1)
    let used = 0
    while (used < bytes.length) {
      const result = await file.read(bytes, used, bytes.length - used, null)
      if (!result.bytesRead) {
        break
      }
      used += result.bytesRead
    }
    if (used > 512 * 1024) {
      throw new Error('Metric exceeds read budget')
    }
    return bytes.subarray(0, used).toString('utf8')
  } finally {
    await file.close()
  }
}
