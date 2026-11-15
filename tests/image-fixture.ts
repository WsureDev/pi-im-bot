import { deflateSync } from 'node:zlib'

function chunk(type: string, bytes: Buffer) {
  const payload = Buffer.concat([Buffer.from(type), bytes])
  let crc = 0xffffffff
  for (const byte of payload) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320
      } else {
        crc >>>= 1
      }
    }
  }
  const result = Buffer.alloc(payload.length + 8)
  result.writeUInt32BE(bytes.length, 0)
  payload.copy(result, 4)
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
  return result
}

export function pngImage(width = 16, height = 16) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const pixels = Buffer.alloc((width * 3 + 1) * height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      pixels[(width * 3 + 1) * row + 1 + col * 3] = 200
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
