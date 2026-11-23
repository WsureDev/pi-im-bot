import type { ChannelRegistry } from '../channels/registry'
import type { Address } from '../domain/message'
import type { ChannelMedia, SendControl, ChannelMessagePart } from '../domain/channel-media'
import { PartialDelivery } from '../domain/channel-media'

export async function sendTransport(
  channels: ChannelRegistry,
  address: Address,
  text: string,
  media: readonly ChannelMedia[],
  format: 'direct' | 'forward',
  itemized: boolean,
  control: SendControl,
  part: (artifactIds: string[], ids: string[]) => void,
  parts?: readonly ChannelMessagePart[]
) {
  const adapter = channels.get(address.channel)
  if (format === 'forward' && adapter.capabilities.forward && adapter.sendForward) {
    const receipt = await adapter.sendForward(address, text, media, control, parts)
    part(
      media.map((file) => {
        return file.id
      }),
      receipt.messageIds
    )
    return receipt
  }
  if (!parts && (!itemized || media.length === 0)) {
    return channels.send(address, text, media, control)
  }
  let ids: string[] = []
  let sentAt = Date.now()
  try {
    const groups =
      parts ??
      media.map((file, index) => {
        let body = ''
        if (index === 0) {
          body = text
        }
        return { text: body, media: [file] }
      })
    for (const group of groups) {
      let body = ''
      body = group.text
      const prior = ids
      const receipt = await channels.send(address, body, group.media, {
        beforePart: control.beforePart,
        received: async (current, at) => {
          ids = [...new Set([...prior, ...current])]
          sentAt = at
          await control.received?.(ids, at)
        }
      })
      ids = [...new Set([...prior, ...receipt.messageIds])]
      sentAt = receipt.sentAt
      part(
        group.media.map((file) => {
          return file.id
        }),
        receipt.messageIds
      )
      await control.received?.(ids, sentAt)
    }
  } catch (error) {
    let cause = error
    if (error instanceof PartialDelivery) {
      ids = [...new Set([...ids, ...error.messageIds])]
      cause = error.cause
    }
    if (ids.length) {
      throw new PartialDelivery(ids, sentAt, cause)
    }
    throw error
  }
  return { messageIds: ids, sentAt }
}
