/** 100 ms of actual 16-bit mono PCM sine audio, with a complete WAV container. */
export function wavAudio() {
  const samples = 1600
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(16000, 24)
  bytes.writeUInt32LE(32000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    bytes.writeInt16LE(Math.round(5000 * Math.sin((2 * Math.PI * 440 * i) / 16000)), 44 + i * 2)
  }
  return bytes
}
