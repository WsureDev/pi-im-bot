import { z } from 'zod'
import { mkdir, open, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { PluginIdSchema } from '../manifest'
import { inspectImage } from '../../media/image'

export const ConfigFileTokenSchema = z.string().regex(/^upload:[a-f0-9]{64}\.(?:png|jpg|jpeg)$/u)
export function configFilePath(dataDir: string, instance: string, token: string) {
  PluginIdSchema.parse(instance)
  ConfigFileTokenSchema.parse(token)
  return join(dataDir, 'plugin-config-files', instance, token.slice(7))
}
export async function storeConfigImage(
  dataDir: string,
  instance: string,
  file: File,
  allowed: readonly string[]
) {
  if (file.size > 5 * 1024 * 1024 || !file.size) {
    throw new Error('配置图片必须为非空文件，且不超过 5 MiB')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const image = inspectImage(bytes)
  let extension = 'png'
  if (image.mimeType === 'image/jpeg') {
    extension = 'jpg'
  }
  if (
    !['image/png', 'image/jpeg'].includes(image.mimeType) ||
    !allowed.some((item) => {
      return item === extension || (extension === 'jpg' && item === 'jpeg')
    })
  ) {
    throw new Error('文件格式不在此配置字段允许的图片类型内')
  }
  const token = 'upload:' + createHash('sha256').update(bytes).digest('hex') + '.' + extension
  const path = configFilePath(dataDir, instance, token)
  await mkdir(join(dataDir, 'plugin-config-files', instance), { recursive: true, mode: 0o700 })
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
  } finally {
    await handle.close()
  }
  await writeFile(path + '.name.json', JSON.stringify({ name: file.name.slice(0, 240) }), { mode: 0o600 })
  return { token, name: file.name, bytes: bytes.length }
}

export async function configFileName(dataDir: string, instance: string, token: string) {
  const path = configFilePath(dataDir, instance, token)
  try {
    return z.object({ name: z.string() }).parse(JSON.parse(await readFile(path + '.name.json', 'utf8')))
  } catch {
    return { name: '背景图片' }
  }
}
export async function readConfigFile(
  dataDir: string,
  instance: string,
  token: string,
  offset: number,
  length: number
) {
  const handle = await open(
    configFilePath(dataDir, instance, token),
    constants.O_RDONLY | constants.O_NOFOLLOW
  )
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) {
      throw new Error('配置图片大小或类型无效')
    }
    const bytes = Buffer.alloc(Math.min(length, Math.max(0, stat.size - offset)))
    const read = await handle.read(bytes, 0, bytes.length, offset)
    let mimeType = 'image/png'
    if (/\.jpe?g$/u.test(token)) {
      mimeType = 'image/jpeg'
    }
    return { data: bytes.subarray(0, read.bytesRead).toString('base64'), total: stat.size, mimeType }
  } finally {
    await handle.close()
  }
}
