import type { Attachment } from '@core/domain/message'
export function attachmentUrl(roomId: string, attachment: Attachment) {
  const prefix = '/api/rooms/' + encodeURIComponent(roomId) + '/'
  if (
    !attachment.url.startsWith(prefix) ||
    !/^(?:artifacts|media)\/[0-9a-f-]{36}\/content$/u.test(attachment.url.slice(prefix.length))
  ) {
    return ''
  }
  return attachment.url
}
