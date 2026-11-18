import { z } from 'zod'
import { ConfigValuesSchema, type ConfigValues } from '../../plugins/configuration/schema'
import type { ResourceMapping } from '../protocol'

function pathParts(path: string) {
  if (!path.startsWith('/')) {
    throw new Error('映射路径必须是 JSON Pointer')
  }
  const parts = path
    .slice(1)
    .split('/')
    .map((key) => {
      return key.replaceAll('~1', '/').replaceAll('~0', '~')
    })
  if (
    parts.some((key) => {
      return !key || ['__proto__', 'prototype', 'constructor'].includes(key)
    })
  ) {
    throw new Error('映射路径包含保留名称')
  }
  return parts
}
export function selectValue(input: unknown, path: string) {
  let value = input
  for (const part of pathParts(path)) {
    const object = z.record(z.string(), z.unknown()).safeParse(value)
    const array = z.array(z.unknown()).safeParse(value)
    if (object.success && Object.hasOwn(object.data, part)) {
      value = object.data[part]
    } else if (array.success && /^(0|[1-9][0-9]*)$/u.test(part)) {
      value = array.data[Number(part)]
    } else {
      return undefined
    }
  }
  return value
}
export function mapResourceInput(mapping: ResourceMapping, parameters: ConfigValues) {
  if (!mapping.inputMapping) {
    return parameters
  }
  const result: ConfigValues = {}
  for (const [destination, source] of Object.entries(mapping.inputMapping)) {
    const value = selectValue(parameters, source)
    if (value === undefined) {
      continue
    }
    const parts = pathParts(destination)
    let object = result
    for (const part of parts.slice(0, -1)) {
      const child = ConfigValuesSchema.parse(object[part] ?? {})
      object[part] = child
      object = child
    }
    object[parts[parts.length - 1]] = z.json().parse(value)
  }
  return result
}
