import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { z } from 'zod'
import { BotConfigSchema } from '../src/config/schema'

const directory = resolve(z.string().min(1).parse(process.argv[2]))
const port = z.coerce
  .number()
  .int()
  .refine((value) => {
    return value === 19385 || value === 19386
  })
  .parse(process.argv[3] ?? '19385')
await mkdir(directory, { recursive: true })
if (
  (await Bun.file(join(directory, 'bot.json')).exists()) ||
  (await Bun.file(join(directory, 'providers.json')).exists())
) {
  throw new Error('配置目录已存在；不覆盖已有预览配置。')
}
const bot = BotConfigSchema.parse({
  server: { host: '0.0.0.0', port },
  agent: { execution: { backend: 'disabled' } },
  onebot: { enabled: false },
  plugins: { enabled: false }
})
await writeFile(join(directory, 'bot.json'), JSON.stringify(bot, null, 2), { mode: 0o600, flag: 'wx' })
await writeFile(
  join(directory, 'providers.json'),
  await Bun.file(join(import.meta.dir, '../config/providers.example.json')).text(),
  { mode: 0o600, flag: 'wx' }
)
console.log('Prepared isolated preview configuration: ' + directory)
