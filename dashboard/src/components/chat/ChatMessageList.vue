<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ChatMessage, Attachment } from '@core/domain/message'
import MarkdownMessagePart from './message_list_comps/MarkdownMessagePart.vue'
import { attachmentUrl } from '@/api/chat'
import { copyToClipboard } from '@/utils/clipboard'
import 'markstream-vue/index.css'
const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    roomId: string
    isDark?: boolean
    preview?: string
    streaming?: boolean
  }>(),
  { isDark: false, preview: '', streaming: false }
)
const emit = defineEmits<{
  (event: 'reply', message: ChatMessage): void
  (event: 'recall', message: ChatMessage): void
  (event: 'retryMedia', attachment: Attachment): void
}>()
const listRoot = ref<HTMLElement>()
const imagePreview = ref({ visible: false, url: '' })
const failed = ref<Record<string, boolean>>({})
const copied = ref('')
const displayed = computed(() => {
  const messages = [...props.messages]
  if (props.preview) {
    messages.push({
      id: 'pi-streaming-preview',
      roomId: props.roomId,
      role: 'assistant',
      actorId: 'pi',
      actorName: 'Pi',
      text: props.preview,
      attachments: [],
      createdAt: 0,
      platformMessageIds: [],
      recalled: false
    })
  }
  return messages
})
function isUserMessage(message: ChatMessage) {
  return message.role === 'user'
}
function openImage(url: string) {
  if (url) {
    imagePreview.value = { visible: true, url }
  }
}
async function copyMessage(message: ChatMessage) {
  if (await copyToClipboard(message.text)) {
    copied.value = message.id
  }
}
function scrollToMessage(messageId?: string) {
  const target = listRoot.value?.querySelector('[data-message-id="' + CSS.escape(messageId ?? '') + '"]')
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
watch(
  () => [props.messages.length, props.preview],
  async () => {
    const element = listRoot.value
    if (!element) {
      return
    }
    const follow = element.scrollHeight - element.scrollTop - element.clientHeight < 150
    await nextTick()
    if (follow) {
      element.scrollTop = element.scrollHeight
    }
  }
)
</script>
<template>
  <div
    ref="listRoot"
    class="chat-message-list variant-main"
    :class="{ 'is-dark': isDark }"
    style="height: 100%; overflow-y: auto"
    aria-live="polite"
  >
    <div class="messages-list">
      <div
        v-for="msg in displayed"
        :key="msg.id"
        :data-message-id="msg.id"
        class="message-row"
        :class="{ 'from-user': isUserMessage(msg), 'from-bot': !isUserMessage(msg) }"
      >
        <v-avatar v-if="!isUserMessage(msg)" class="bot-avatar" size="32"
          ><v-progress-circular
            v-if="msg.id === 'pi-streaming-preview'"
            indeterminate
            size="22"
            width="2"
          /><span v-else class="bot-avatar-symbol">✦</span></v-avatar
        >
        <div class="message-stack">
          <div class="message-bubble" :class="{ user: isUserMessage(msg), bot: !isUserMessage(msg) }">
            <v-btn
              v-if="msg.replyTo"
              variant="text"
              size="small"
              prepend-icon="mdi-reply"
              @click="scrollToMessage(msg.replyTo.messageId)"
              >引用：{{ msg.replyTo.messageId || msg.replyTo.platformMessageId }}</v-btn
            >
            <p v-if="msg.recalled" class="text-medium-emphasis">消息已撤回</p>
            <div v-else-if="isUserMessage(msg) || msg.role === 'system'" class="plain-content">
              {{ msg.text }}
            </div>
            <MarkdownMessagePart
              v-else
              :content="msg.text"
              :refs="null"
              :is-dark="isDark"
              :custom-html-tags="[]"
              :is-streaming="msg.id === 'pi-streaming-preview'"
            />
            <template v-for="attachment in msg.attachments" :key="attachment.url">
              <template v-if="attachmentUrl(roomId, attachment)">
                <button
                  v-if="attachment.type === 'image'"
                  class="image-part"
                  type="button"
                  @click="openImage(attachmentUrl(roomId, attachment))"
                >
                  <img
                    :src="attachmentUrl(roomId, attachment) + '?view=1'"
                    :alt="attachment.name"
                    loading="lazy"
                    @error="failed[attachment.url] = true"
                  />
                </button>
                <audio
                  v-else-if="attachment.type === 'audio'"
                  class="audio-part"
                  controls
                  preload="none"
                  :src="attachmentUrl(roomId, attachment) + '?view=1'"
                  @error="failed[attachment.url] = true"
                />
                <video
                  v-else-if="attachment.type === 'video'"
                  class="video-part"
                  controls
                  preload="none"
                  :src="attachmentUrl(roomId, attachment) + '?view=1'"
                  @error="failed[attachment.url] = true"
                />
                <v-btn
                  variant="text"
                  :href="attachmentUrl(roomId, attachment)"
                  :download="attachment.name"
                  prepend-icon="mdi-download"
                  >{{ attachment.name }}</v-btn
                >
                <v-btn
                  v-if="failed[attachment.url] && attachment.mediaId"
                  variant="text"
                  @click="emit('retryMedia', attachment)"
                  >重新读取媒体</v-btn
                > </template
              ><span v-else>{{ attachment.name }}</span>
            </template>
          </div>
          <div v-if="msg.id !== 'pi-streaming-preview'" class="message-meta">
            <span>{{ msg.actorName }} · {{ new Date(msg.createdAt).toLocaleTimeString() }}</span
            ><v-chip v-if="msg.deliveryState" size="x-small">{{ msg.deliveryState }}</v-chip>
            <v-btn
              icon="mdi-reply"
              size="x-small"
              variant="text"
              aria-label="引用消息"
              @click="emit('reply', msg)"
            />
            <v-btn
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              aria-label="复制消息"
              @click="copyMessage(msg)"
            /><span v-if="copied === msg.id">已复制</span>
            <v-btn
              v-if="!msg.recalled"
              icon="mdi-delete-outline"
              size="x-small"
              variant="text"
              aria-label="撤回消息"
              @click="emit('recall', msg)"
            />
          </div>
        </div>
      </div>
    </div>
    <v-overlay
      v-model="imagePreview.visible"
      class="image-preview-overlay"
      scrim="rgba(0,0,0,0.86)"
      @click="imagePreview.visible = false"
      ><img :src="imagePreview.url" class="preview-image" alt="图片预览" @click.stop
    /></v-overlay>
  </div>
</template>
<style scoped>
.chat-message-list {
  --chat-border: rgba(var(--v-border-color), 0.16);
  --chat-muted: rgba(var(--v-theme-on-surface), 0.62);
  width: 100%;
  color: rgb(var(--v-theme-on-surface));
}

.chat-message-list.is-dark {
  --chat-border: rgba(255, 255, 255, 0.1);
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.message-row {
  display: flex;
  gap: 10px;
  max-width: 100%;
}

.message-row.from-user {
  justify-content: flex-end;
}

.message-stack {
  display: flex;
  flex-direction: column;
  max-width: min(760px, 82%);
}

.from-bot .message-stack {
  flex: 1 1 0;
  min-width: 0;
  max-width: 760px;
}

.from-user .message-stack {
  align-items: flex-end;
  max-width: 60%;
}

.sent-attachments {
  display: flex;
  max-width: 100%;
  gap: 10px;
  margin-bottom: 8px;
  padding: 2px 2px 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.sent-attachment-card {
  --attachment-color: #607d8b;
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  height: 60px;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.055);
  color: rgb(var(--v-theme-on-surface));
}

.sent-image-card {
  width: 64px;
  padding: 0;
  border: 0;
  cursor: zoom-in;
}

.sent-image-card img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
}

.sent-attachments.images-only {
  max-width: min(420px, 100%);
}

.sent-attachments.images-only .sent-image-card {
  width: 180px;
  height: 180px;
}

.sent-attachments.images-only .sent-image-card img {
  object-fit: cover;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.sent-file-card {
  width: 236px;
  padding: 8px 10px;
  background: rgba(var(--v-theme-on-surface), 0.055);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--attachment-color) 14%, transparent),
    rgba(var(--v-theme-on-surface), 0.055) 62%
  );
}

.sent-attachment-icon {
  display: inline-flex;
  flex-shrink: 0;
  min-width: 36px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: var(--attachment-color);
}

.sent-attachment-icon-symbol {
  color: var(--attachment-color);
}

.sent-attachment-ext {
  max-width: 58px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  line-height: 12px;
  color: var(--attachment-color);
}

.sent-attachment-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
}

.bot-avatar {
  margin-top: 2px;
  color: rgb(var(--v-theme-primary));
  user-select: none;
}

.bot-streaming-spinner {
  margin-top: -4px;
}

.bot-avatar-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  margin-top: -2px;
  line-height: 0;
  pointer-events: none;
  user-select: none;
}

.message-bubble {
  border-radius: 8px;
  padding: 10px 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.message-bubble.user {
  color: var(--v-theme-primaryText);
  padding: 12px 18px;
  font-size: 15px;
  max-width: 100%;
  border-radius: 1.5rem;
  background: rgba(var(--v-theme-primary), 0.12);
}

.message-bubble.bot {
  background: transparent;
  padding-left: 0;
}

.plain-content {
  white-space: pre-wrap;
}

.inline-message-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: min(420px, 72vw);
}

.inline-message-editor-input {
  width: 100%;
  min-height: 0;
  max-height: 220px;
  padding: 0;
  border: 0;
  outline: 0;
  resize: vertical;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.65;
  white-space: pre-wrap;
}

.inline-message-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
}

.inline-message-editor-action {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 14px;
}

.loading-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: var(--chat-muted);
}

.chat-message-list :deep(.markdown-content p) {
  margin: 0.25rem 0;
}

.unknown-part {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  padding: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 13px;
  line-height: 1.5;
}

.reply-quote {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-left: 3px solid rgb(var(--v-theme-primary));
  border-radius: 6px;
  padding: 7px 9px;
  margin-bottom: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.image-part {
  display: block;
  width: fit-content;
  max-width: 100%;
  border: 0;
  padding: 0;
  margin-top: 8px;
  background: transparent;
  cursor: zoom-in;
  text-align: left;
}

.image-part img {
  max-width: min(420px, 100%);
  max-height: 360px;
  border-radius: 8px;
  object-fit: contain;
}

.audio-part,
.video-part {
  display: block;
  max-width: 100%;
  margin-top: 8px;
}

.video-part {
  max-height: 360px;
  border-radius: 8px;
}

.file-part {
  --attachment-color: #607d8b;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  margin-top: 8px;
  padding: 9px 8px 9px 10px;
  border: 0;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.055);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--attachment-color) 13%, transparent),
    rgba(var(--v-theme-on-surface), 0.055) 58%
  );
}

.file-part-icon {
  color: var(--attachment-color);
}

.file-part-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.file-part-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.file-part-kind {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--attachment-color);
  font-size: 11px;
  font-weight: 700;
  line-height: 14px;
}

.file-part-action {
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.72;
}

.file-part:hover .file-part-action {
  opacity: 1;
}

.tool-call-block {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-bubble.bot > .tool-call-block:first-child :deep(.tool-call-card:first-child) {
  margin-top: 0;
}

.tool-call-inline-status {
  color: var(--chat-muted);
  font-size: 12px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 24px;
  color: var(--chat-muted);
  font-size: 12px;
}

.message-meta-refs {
  display: flex;
  align-items: center;
}

.message-thread-meta {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 8px;
  padding: 0 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 24px;
  cursor: pointer;
}

.message-thread-meta:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.thread-menu-item {
  max-width: min(320px, 72vw);
}

.thread-menu-title {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.from-user .message-meta {
  justify-content: flex-end;
}

.stats-card {
  min-width: 150px;
  padding: 8px 10px;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 2px 0;
  font-size: 13px;
  line-height: 1.35;
}

.stats-row span {
  color: var(--chat-muted);
}

.stats-row strong {
  font-size: 12px;
  font-weight: 600;
}

.threaded-message-content {
  color: inherit;
}

.image-preview-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: min(92vw, 1200px);
  max-height: 90vh;
  object-fit: contain;
  cursor: zoom-out;
}

.variant-thread .messages-list {
  gap: 14px;
}

.variant-thread .message-stack {
  max-width: min(300px, 86%);
}

.variant-thread .from-user .message-stack {
  max-width: 78%;
}

.variant-thread .bot-avatar-symbol {
  font-size: 24px;
}

.variant-thread .from-bot .bot-avatar {
  display: none;
}

.variant-thread .from-bot .message-stack {
  max-width: 100%;
}

.variant-thread .message-bubble {
  padding: 9px 12px;
  border-radius: 18px;
  font-size: 14px;
}

.variant-thread .message-bubble.user {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  background: rgb(var(--v-theme-on-surface));
  color: rgb(var(--v-theme-surface));
}

.variant-thread .message-bubble.bot {
  border: 0;
  background: transparent;
  padding-left: 12px;
}

@media (max-width: 760px) {
  .messages-list {
    gap: 18px;
  }

  .message-row.from-bot {
    flex-direction: column;
    gap: 2px;
  }

  .message-row.from-bot .bot-avatar {
    display: none;
  }

  .message-row.from-bot .message-stack {
    max-width: 100%;
  }

  .message-stack {
    max-width: 88%;
  }

  .from-user .message-stack {
    max-width: 82%;
  }

  .sent-file-card {
    width: min(220px, calc(100vw - 28px));
    height: 58px;
  }

  .sent-image-card {
    width: 58px;
    height: 58px;
  }

  .sent-attachments.images-only .sent-image-card {
    width: min(180px, calc(100vw - 52px));
    height: min(180px, calc(100vw - 52px));
  }

  .message-bubble {
    padding: 9px 12px;
  }

  .message-bubble.user {
    padding: 10px 14px;
  }

  .inline-message-editor {
    min-width: min(100%, calc(100vw - 36px));
  }

  .image-part img {
    max-width: min(100%, calc(100vw - 36px));
    max-height: 300px;
  }

  .video-part {
    max-height: 300px;
  }

  .variant-thread .messages-list {
    gap: 12px;
  }

  .variant-thread .message-stack,
  .variant-thread .from-bot .message-stack {
    max-width: 100%;
  }

  .variant-thread .from-user .message-stack {
    max-width: 82%;
  }

  .variant-thread .message-bubble.bot {
    padding-left: 0;
  }
}
</style>
