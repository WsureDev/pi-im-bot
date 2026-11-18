import { z } from 'zod'
import { compile } from '@earendil-works/pi-schema'
import { connectMcp } from '../../resources/mcp/client'
import { McpServerSchema, McpToolSchema } from '../../resources/mcp/schema'
import type { ConfigValues } from '../../plugins/configuration/schema'
import type { ResourceInstance, ResourceMapping } from '../protocol'
import { resourceConnection } from './connection'
import { UncertainHostResult } from '../../plugins/rpc/uncertain'

const StructuredResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.json().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).default([])
})
export async function invokeResourceMcp(
  instance: ResourceInstance,
  mapping: ResourceMapping,
  input: ConfigValues,
  signal: AbortSignal,
  readOnly: boolean
) {
  if (mapping.transport.kind !== 'mcp') {
    throw new Error('MCP 适配定义不匹配')
  }
  const config = resourceConnection(instance)
  const server = McpServerSchema.parse({
    id: 'resource',
    name: instance.name,
    enabled: true,
    url: config.endpoint,
    headers: { ...config.headers, 'x-pi-plugin-request': 'resource' },
    timeoutMs: config.timeoutMs
  })
  const connection = await connectMcp(server, signal)
  try {
    const name = mapping.transport.tool
    const tool = McpToolSchema.array()
      .parse(await connection.client.listTools({ signal }))
      .find((item) => {
        return item.name === name
      })
    if (!tool || tool.execution?.taskSupport === 'required') {
      throw new Error('MCP 工具不存在或要求独立 Tasks 生命周期')
    }
    if (readOnly && tool.annotations?.readOnlyHint !== true) {
      throw new Error('上游工具已不再声明只读，拒绝按只读协议调用')
    }
    if (!compile(tool.inputSchema).check(input)) {
      throw new Error('参数与上游 MCP 工具定义不匹配')
    }
    let result
    try {
      result = StructuredResultSchema.parse(
        await connection.client.callTool(name, input, { signal, timeoutMs: config.timeoutMs })
      )
    } catch {
      if (!readOnly) {
        throw new UncertainHostResult('MCP 请求提交后未取得完整响应')
      }
      throw new Error('MCP 调用失败')
    }
    if (result.isError) {
      throw new Error('MCP 后端报告业务错误')
    }
    if (result.structuredContent !== undefined) {
      return result.structuredContent
    }
    const texts = result.content.filter((part) => {
      return part.type === 'text'
    })
    if (texts.length !== 1 || result.content.length !== 1 || !texts[0].text) {
      if (!readOnly) {
        throw new UncertainHostResult('MCP 写操作结果无法按协议解释')
      }
      throw new Error('此协议适配要求结构化 JSON 结果，无法无损转换此 MCP 内容')
    }
    try {
      return z.json().parse(JSON.parse(texts[0].text))
    } catch {
      if (!readOnly) {
        throw new UncertainHostResult('MCP 写操作没有返回有效 JSON')
      }
      throw new Error('MCP 未返回协议要求的 JSON')
    }
  } finally {
    await connection.close()
  }
}
