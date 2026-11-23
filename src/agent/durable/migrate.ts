import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Configuration } from '../../config/load'
import type { Room } from '../../domain/message'
import type { PreparedRunInput } from '../../domain/run'

export async function legacyContext(config: Configuration, room: Room, input: PreparedRunInput) {
  const scope = input.context.workspaceScope ?? room.id
  const workspaceId = createHash('sha256').update(scope).digest('hex').slice(0, 24)
  const sessionId = createHash('sha256')
    .update(`${input.context.sessionKey}:${room.mode}`)
    .digest('hex')
    .slice(0, 24)
  const directory = join(config.dataDir, 'pi-sessions', sessionId)
  if (!existsSync(directory)) {
    return []
  }
  const { SessionManager, convertToLlm } = await import('@earendil-works/pi-coding-agent')
  const manager = SessionManager.continueRecent(join(config.dataDir, 'workspaces', workspaceId), directory)
  return convertToLlm(manager.buildSessionContext().messages).filter((message) => {
    return message.role !== 'system'
  })
}
