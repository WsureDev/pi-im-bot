import type { Address, DeliveryReceipt, IncomingMessage } from './message'
import type { ChannelMedia, SendControl, ChannelMessagePart } from './channel-media'
import type { IncomingMedia, MediaBytes } from '../media/schema'

export interface ChannelCapabilities {
  forward?: boolean
  text: boolean
  images: boolean
  audio?: boolean
  video?: boolean
  files: boolean
  edit: boolean
  recall: boolean
  threads: boolean
}

export interface ChannelAdapter {
  identity?(address: Address, signal: AbortSignal): Promise<string | undefined>
  id: string
  capabilities: ChannelCapabilities
  send(
    address: Address,
    text: string,
    media?: readonly ChannelMedia[],
    control?: SendControl
  ): Promise<DeliveryReceipt>
  sendForward?(
    address: Address,
    text: string,
    media: readonly ChannelMedia[],
    control?: SendControl,
    parts?: readonly ChannelMessagePart[]
  ): Promise<DeliveryReceipt>
  recall?(address: Address, messageId: string): Promise<void>
  readMedia?(address: Address, media: IncomingMedia, signal: AbortSignal): Promise<MediaBytes>
  lookupMessage?(address: Address, id: string, signal: AbortSignal): Promise<IncomingMessage>
}
