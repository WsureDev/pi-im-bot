import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Attachment } from '@core/domain/message'
import type { ReplyReference } from '@core/media/schema'

export interface ChatDraft {
  text: string
  attachments: Attachment[]
  replyTo?: ReplyReference
  replyLabel: string
}

export const useChatDrafts = defineStore('chat-drafts', () => {
  const rooms = ref<Record<string, ChatDraft>>({})
  function get(roomId: string) {
    if (!rooms.value[roomId]) {
      clear(roomId)
    }
    return rooms.value[roomId]
  }
  function clear(roomId: string) {
    rooms.value[roomId] = { text: '', attachments: [], replyLabel: '' }
  }
  return { rooms, get, clear }
})
