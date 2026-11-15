import type { PreparedRunInput } from '../src/domain/run'
import type { Room } from '../src/domain/message'
import { BotConfigSchema } from '../src/config/schema'
import { initialFramework, resolveSettings } from '../src/settings/resolve'
import { captureAuthority } from '../src/permissions/authorize'
import { localIdentity } from '../src/permissions/identity'
import { ResourceLibrary } from '../src/resources/library'

export function testResources() {
  return ResourceLibrary.empty()
}

export function testFramework() {
  return initialFramework(BotConfigSchema.parse({}), 'main')
}

export function agentInput(room: Room, text: string): PreparedRunInput {
  const effective = resolveSettings(testFramework(), room.address, room.settings)
  const identity = localIdentity(room.address.channel, room.address.accountId, 'test', 'test')
  return {
    roomId: room.id,
    text,
    actorId: 'test',
    actorName: 'test',
    source: 'im',
    receivedAt: Date.now(),
    identities: [identity],
    context: {
      conversationId: 'test-conversation',
      rootConversationId: 'test-conversation',
      conversationEpoch: room.conversationEpoch,
      sessionKey: `${room.id}:0`,
      capabilityRevisions: {},
      effective,
      authority: captureAuthority(effective, [identity])
    }
  }
}
