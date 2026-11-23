import { z } from 'zod'
import { ComfyOutputRefused } from '../../../services/comfy/errors'

const FileSchema = z.object({
  filename: z.string().min(1),
  subfolder: z.string().default(''),
  type: z.enum(['output', 'temp', 'input']).default('output')
})
const NodeSchema = z.object({ images: z.array(FileSchema).optional() }).passthrough()
const HistorySchema = z.record(
  z.string(),
  z.object({ outputs: z.record(z.string(), NodeSchema).default({}) }).passthrough()
)
export function nativeOutputFiles(raw: unknown, id: string, preferred?: string) {
  const entry = HistorySchema.parse(raw)[id]
  if (!entry) {
    return { status: 'running' as const, files: [] }
  }
  let file: z.infer<typeof FileSchema> | undefined
  if (preferred) {
    file = entry.outputs[preferred]?.images?.[0]
  }
  if (!file) {
    file = Object.values(entry.outputs).flatMap((node) => {
      return node.images ?? []
    })[0]
  }
  if (!file) {
    return { status: 'failed' as const, files: [] }
  }
  for (const path of [file.filename, file.subfolder]) {
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\0') ||
      path.split('/').some((part) => {
        return part === '..' || part === '.'
      })
    ) {
      throw new ComfyOutputRefused('输出路径无效')
    }
  }
  return { status: 'succeeded' as const, files: [file] }
}
