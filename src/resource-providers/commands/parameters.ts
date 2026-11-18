import { ConfigValuesSchema, type ConfigValues } from '../../plugins/configuration/schema'
import { z } from 'zod'
import type { ResourceCommand } from './schema'

function keys(path: string) {
  if (!path.startsWith('/')) {
    throw new Error('参数路径须为 JSON Pointer，例如 /filters/query')
  }
  const parts = path
    .slice(1)
    .split('/')
    .map((part) => {
      return part.replaceAll('~1', '/').replaceAll('~0', '~')
    })
  if (
    parts.some((part) => {
      return !part || ['__proto__', 'prototype', 'constructor'].includes(part)
    })
  ) {
    throw new Error('参数路径包含保留名称')
  }
  return parts
}
export function setParameter(value: ConfigValues, path: string, text: z.infer<ReturnType<typeof z.json>>) {
  const parts = keys(path)
  let current = value
  for (const key of parts.slice(0, -1)) {
    const child = ConfigValuesSchema.parse(current[key] ?? {})
    current[key] = child
    current = child
  }
  current[parts[parts.length - 1]] = text
}
function defaults(input: ConfigValues, fixed: ConfigValues): ConfigValues {
  const result = structuredClone(input)
  for (const [key, value] of Object.entries(fixed)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new Error('参数使用了保留名称')
    }
    const object = ConfigValuesSchema.safeParse(value)
    const target = ConfigValuesSchema.safeParse(result[key])
    if (object.success && target.success) {
      result[key] = defaults(target.data, object.data)
    } else {
      result[key] = structuredClone(value)
    }
  }
  return result
}
export function commandParameters(command: ResourceCommand, text: string) {
  let args: ConfigValues = {}
  if (command.arguments === 'json') {
    args = ConfigValuesSchema.parse(JSON.parse(text || '{}'))
  } else if (command.arguments === 'text') {
    args = structuredClone(command.fixed)
    let value: z.infer<ReturnType<typeof z.json>> = text
    if (command.textType !== 'string' && !text.trim()) {
      throw new Error('此指令需要一个参数')
    }
    if (command.textType === 'number') {
      value = z.coerce.number().finite().parse(text)
    }
    if (command.textType === 'boolean') {
      value = z.enum(['true', 'false']).parse(text.trim()) === 'true'
    }
    if (command.textType === 'json') {
      value = z.json().parse(JSON.parse(text))
    }
    setParameter(args, command.textPath, value)
    return args
  } else if (text.trim()) {
    throw new Error('此指令不接受参数')
  }
  return defaults(args, command.fixed)
}
