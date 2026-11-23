import { readdir, mkdir, lstat, copyFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { pythonCasefold } from '../../../services/gsvi/unicode'
import { ComfyResourceConfigurationSchema, NativeGraphSchema, type NativeGraph } from './contracts'
import type { ResourceInstance } from '../../protocol'
import type { ResourceNativeContext } from '../contracts'
const initialized = new Set<string>()

export function lexical(left: string, right: string) {
  const a = Array.from(left, (c) => {
    return c.codePointAt(0)!
  })
  const b = Array.from(right, (c) => {
    return c.codePointAt(0)!
  })
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i]
    }
  }
  return a.length - b.length
}
export async function readJson(path: string): Promise<unknown> {
  return JSON.parse((await Bun.file(path).text()).replace(/^\uFEFF/u, ''))
}
export async function workflowDirectory(instance: ResourceInstance, context: ResourceNativeContext) {
  const config = ComfyResourceConfigurationSchema.parse(instance.configuration)
  if (config.workflow_directory) {
    const directory = resolve(config.workflow_directory)
    if (!(await lstat(directory)).isDirectory()) {
      throw new Error('工作流目录不存在')
    }
    return directory
  }
  const directory = join(context.dataDir, 'resource-backends', instance.id, 'workflow')
  await mkdir(directory, { recursive: true })
  if (initialized.has(directory)) {
    return directory
  }
  const bundled = fileURLToPath(new URL('./templates/', import.meta.url))
  for (const file of await readdir(bundled)) {
    if (file.endsWith('.json') && !(await Bun.file(join(directory, file)).exists())) {
      await copyFile(join(bundled, file), join(directory, file), 1).catch(async (error: unknown) => {
        if (!(await Bun.file(join(directory, file)).exists())) {
          throw error
        }
      })
    }
  }
  initialized.add(directory)
  return directory
}
export async function workflowNames(directory: string) {
  return (await readdir(directory))
    .filter((name) => {
      return (
        name.endsWith('.json') &&
        !['.steps.json', '.lora.json', '.profile.json'].some((suffix) => {
          return name.endsWith(suffix)
        })
      )
    })
    .sort(lexical)
}
export async function selectWorkflow(directory: string, selector: string, defaultName = 'workflow_api.json') {
  const value = selector.trim() || defaultName
  if (
    basename(value) !== value ||
    value.includes('\\') ||
    !['', '.json'].includes(extname(value).toLowerCase())
  ) {
    throw new Error('无效的工作流名称')
  }
  const names = await workflowNames(directory)
  const key = pythonCasefold(value)
  const stem = pythonCasefold(value.replace(/\.json$/iu, ''))
  const matches = names.filter((name) => {
    return pythonCasefold(name) === key || pythonCasefold(name.replace(/\.json$/u, '')) === stem
  })
  if (matches.length !== 1) {
    throw new Error('工作流不存在或名称不明确：' + value)
  }
  return matches[0]
}
export async function loadWorkflow(directory: string, name: string) {
  const path = join(directory, name)
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('工作流必须是目录内的普通 JSON 文件')
  }
  const graph = NativeGraphSchema.parse(await readJson(path))
  if (!Object.keys(graph).length) {
    throw new Error('工作流不能为空')
  }
  return graph
}
export async function writeJson(path: string, value: unknown, signal: AbortSignal) {
  signal.throwIfAborted()
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + crypto.randomUUID() + '.tmp'
  try {
    await Bun.write(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    signal.throwIfAborted()
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}
export async function saveWorkflow(directory: string, name: string, raw: unknown, signal: AbortSignal) {
  let filename = name
  if (!filename.endsWith('.json')) {
    filename += '.json'
  }
  if (basename(filename) !== filename || filename.includes('\\') || filename.includes('\0')) {
    throw new Error('工作流名称不能包含目录')
  }
  const value = z.json().parse(raw)
  await writeJson(join(directory, filename), value, signal)
  return filename
}
export async function stepOverrides(directory: string, filename: string) {
  const path = join(directory, filename.replace(/\.json$/u, '.steps.json'))
  const parsed = z.record(z.string(), z.unknown()).safeParse(await readJson(path).catch(() => ({})))
  const result: Record<string, number> = {}
  if (!parsed.success) {
    return result
  }
  for (const [id, value] of Object.entries(parsed.data)) {
    let raw = value
    const nested = z.object({ steps: z.number() }).safeParse(value)
    if (nested.success) {
      raw = nested.data.steps
    }
    const number = z.number().positive().safeParse(raw)
    if (number.success) {
      result[id] = Math.trunc(number.data)
    }
  }
  return result
}
export function applySteps(graph: NativeGraph, overrides: Record<string, number>) {
  const valid = new Set(
    Object.keys(graph).filter((id) => {
      return graph[id].class_type === 'ParameterBreak'
    })
  )
  for (const node of Object.values(graph)) {
    for (const key of ['steps', 'steps_total']) {
      const pair = z.tuple([z.union([z.string(), z.number()]), z.number()]).safeParse(node.inputs[key])
      if (pair.success && valid.has(String(pair.data[0])) && overrides[String(pair.data[0])] !== undefined) {
        node.inputs[key] = overrides[String(pair.data[0])]
      }
    }
  }
}
