import { expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, unlink } from 'node:fs/promises'
import { pngImage } from './image-fixture'
import {
  configFilePath,
  configFileName,
  storeConfigImage,
  readConfigFile
} from '../src/plugins/configuration/files'

test('configuration uploads preserve image bytes and names while remaining instance scoped', async () => {
  const root = await mkdtemp('/tmp/pi-config-file-')
  try {
    const bytes = pngImage(32, 32)
    const file = await storeConfigImage(root, 'status', new File([bytes], '自定义背景.png'), ['png'])
    expect(await configFileName(root, 'status', file.token)).toEqual({ name: '自定义背景.png' })
    const first = await readConfigFile(root, 'status', file.token, 0, 40)
    const second = await readConfigFile(root, 'status', file.token, 40, 65536)
    expect(Buffer.concat([Buffer.from(first.data, 'base64'), Buffer.from(second.data, 'base64')])).toEqual(
      bytes
    )
    await expect(readConfigFile(root, 'another-plugin', file.token, 0, 40)).rejects.toThrow()
    await expect(storeConfigImage(root, 'status', new File([bytes], 'fake.jpg'), ['jpg'])).rejects.toThrow(
      '类型'
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('configuration file paths and symlink substitutions cannot escape stored images', async () => {
  const root = await mkdtemp('/tmp/pi-config-symlink-')
  try {
    expect(() => configFilePath(root, '../other', 'upload:' + 'a'.repeat(64) + '.png')).toThrow()
    expect(() => configFilePath(root, 'status', '../../other')).toThrow()
    const saved = await storeConfigImage(root, 'status', new File([pngImage()], 'image.png'), ['png'])
    const path = configFilePath(root, 'status', saved.token)
    await Bun.write(root + '/outside', 'private sentinel')
    await unlink(path)
    await symlink(root + '/outside', path)
    await expect(readConfigFile(root, 'status', saved.token, 0, 40)).rejects.toThrow()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
