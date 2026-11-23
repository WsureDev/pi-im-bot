import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Configuration } from '../../config/load'
import type { JobInvocation } from '../../jobs/service'
import type { JobService } from '../../jobs/service'
import { ArtifactStore } from '../../artifacts/store'
import { createMcpTools } from '../../resources/mcp/tools'
import { mcpCapabilityId } from '../../resources/mcp/identity'
import { revision } from '../../settings/resolve'
import { callResource } from '../service'
import { resourceCapability } from '../protocol'
import { materializeResourceFiles } from '../files'
import { resolveResource } from '../registry'
import { commandParameters } from './parameters'
import { resourceCommandCapability, type ResourceCommand } from './schema'
import { resourceModels } from '../native/model'

export async function executeResourceCommand(
  current: () => Configuration,
  invocation: JobInvocation,
  command: ResourceCommand,
  text: string,
  signal: AbortSignal,
  jobs?: JobService
) {
  const commandId = resourceCommandCapability(command.id)
  const captured = revision(command)
  const args = commandParameters(command, text)
  const ids =
    invocation.input.identities
      .flatMap((identity) => {
        return identity.messageIds
      })
      .join(':') || invocation.runId
  const requestId = createHash('sha256')
    .update('resource-command:' + command.id + ':' + ids)
    .digest('hex')
  const target = command.target
  let capability: string
  if (target.kind === 'resource') {
    capability = resourceCapability(target.resourceId, target.protocol, target.method)
  } else {
    capability = mcpCapabilityId(target.serverId, target.tool)
  }
  function authorize() {
    signal.throwIfAborted()
    invocation.authorize(commandId)
    invocation.authorize(capability)
    const now = current().resources.config.resourceCommands.find((entry) => {
      return entry.id === command.id
    })
    if (!now?.enabled || revision(now) !== captured) {
      throw new Error('指令配置已变更或停用')
    }
  }
  authorize()
  const artifacts = new ArtifactStore(
    invocation.config.dataDir,
    invocation.room.id,
    undefined,
    commandId,
    () => {
      authorize()
      return { capabilities: [commandId, capability], mediaIds: [] }
    }
  )
  if (target.kind === 'mcp') {
    const tools = createMcpTools(
      invocation.config.resources,
      invocation.input.context.effective.settings,
      invocation.input.context.authority.capabilities,
      artifacts,
      signal,
      jobs?.forInvocation(invocation, 'command')
    )
    try {
      const tool = tools.tools.find((entry) => {
        return tools.capabilityFor(entry.name) === capability
      })
      if (!tool) {
        throw new Error('MCP 工具不可用或当前范围未获授权')
      }
      const result = await tool.execute(requestId, args, signal, undefined)
      authorize()
      const details = z
        .object({ artifactIds: z.array(z.string()).default([]), artifactId: z.string().optional() })
        .passthrough()
        .parse(result.details ?? {})
      const artifactIds = [...details.artifactIds]
      if (details.artifactId) {
        artifactIds.push(details.artifactId)
      }
      const summary = result.content
        .flatMap((part) => {
          if (part.type === 'text') {
            return [part.text]
          }
          return []
        })
        .join('\n')
      return { summary, artifactIds, authorize }
    } finally {
      await tools.close()
    }
  }
  const { resourceId, protocol, method } = target
  let durable
  if (jobs) {
    durable = { runtime: jobs.runtime, jobs: jobs.repository }
  }
  const before = resolveResource(current().resources.config, resourceId, protocol, method)
  const result = await callResource(
    () => {
      return current().resources.config
    },
    { resourceId: target.resourceId, protocol: target.protocol, method: target.method, parameters: args },
    {
      requestId,
      signal,
      authorize,
      host: {
        optionsChanged: jobs?.coordinator.plugins?.managed?.resources?.optionsChanged,
        dataDir: invocation.config.dataDir,
        artifacts,
        durable,
        models: resourceModels(
          () => {
            return current().catalog
          },
          invocation.input.context.effective.settings.preferences.providerGroup,
          invocation.input.context.effective.persona.prompt
        ),
        owner: { scope: invocation.room.id, caller: commandId, phase: 'execute' }
      }
    }
  )
  let artifactIds: string[] = [...result.artifactIds]
  if (command.output === 'images' && result.files.length) {
    artifactIds.push(...(await materializeResourceFiles(before.instance, result, artifacts, signal, verify)))
  }
  function verify() {
    authorize()
    if (
      resolveResource(current().resources.config, resourceId, protocol, method).revision !== before.revision
    ) {
      throw new Error('资源已改变，取消交付旧调用结果')
    }
  }
  verify()
  let summary = JSON.stringify(result.value, null, 2)
  if (artifactIds.length) {
    summary = '已取得 ' + artifactIds.length + ' 张图片。'
  }
  if (summary.length > 6000) {
    const artifact = await artifacts.save('resource-result.json', 'application/json', capability, summary)
    artifactIds.push(artifact.id)
    summary = summary.slice(0, 2000) + '\n完整结果见附件。'
  }
  return { summary, artifactIds, authorize: verify }
}
