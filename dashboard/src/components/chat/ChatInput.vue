<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Attachment } from '@core/domain/message'
const props = withDefaults(
  defineProps<{
    modelValue: string
    attachments: Attachment[]
    replyLabel?: string
    disabled?: boolean
    isRunning?: boolean
    isDark?: boolean
  }>(),
  { replyLabel: '', disabled: false, isRunning: false, isDark: false }
)
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'send'): void
  (event: 'stop'): void
  (event: 'upload', files: File[]): void
  (event: 'remove', index: number): void
  (event: 'clearReply'): void
}>()
const imageInputRef = ref<HTMLInputElement>()
const composing = ref(false)
const localPrompt = computed({
  get() {
    return props.modelValue
  },
  set(value: string) {
    emit('update:modelValue', value)
  }
})
const canSend = computed(() => {
  return !props.disabled && Boolean(props.modelValue.trim() || props.attachments.length)
})
function handleKeyDown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !composing.value &&
    event.keyCode !== 229
  ) {
    event.preventDefault()
    if (canSend.value) {
      emit('send')
    }
  }
}
function handleFileSelect(event: Event) {
  const element = event.target as HTMLInputElement
  emit('upload', Array.from(element.files ?? []))
  element.value = ''
}
function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length) {
    event.preventDefault()
    emit('upload', files)
  }
}
</script>
<template>
  <div class="input-area fade-in" :class="{ 'is-dark': isDark }">
    <div
      class="input-container is-multiline"
      :class="{ 'has-attachments': attachments.length }"
      style="width: 100%; max-width: 960px; margin: 0 auto; position: relative"
    >
      <div v-if="replyLabel" class="reply-preview">
        <div class="reply-content">
          <v-icon size="small">mdi-reply</v-icon><span class="reply-text">{{ replyLabel }}</span>
        </div>
        <v-btn
          @click="emit('clearReply')"
          icon="mdi-close"
          size="x-small"
          variant="text"
          aria-label="取消引用"
        />
      </div>
      <div v-if="attachments.length" class="attachments-preview">
        <div v-for="(file, index) in attachments" :key="file.mediaId" class="attachment-card file-preview">
          <v-icon icon="mdi-paperclip" /><span class="attachment-name">{{ file.name }}</span
          ><v-btn
            icon="mdi-close"
            size="x-small"
            variant="tonal"
            aria-label="移除附件"
            @click="emit('remove', index)"
          />
        </div>
      </div>
      <div class="composer-row">
        <div class="input-left-actions">
          <v-btn
            @click="imageInputRef?.click()"
            icon="mdi-paperclip"
            variant="text"
            :disabled="disabled || attachments.length >= 12"
            aria-label="添加附件"
          />
        </div>
        <div class="input-field-shell">
          <textarea
            v-model="localPrompt"
            @keydown="handleKeyDown"
            @compositionstart="composing = true"
            @compositionend="composing = false"
            @paste="handlePaste"
            :disabled="disabled"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            aria-label="消息内容"
            class="chat-textarea"
            rows="2"
          />
        </div>
        <div class="input-right-actions">
          <input
            ref="imageInputRef"
            type="file"
            multiple
            style="display: none"
            @change="handleFileSelect"
          /><v-btn
            v-if="isRunning"
            icon="mdi-stop"
            variant="tonal"
            aria-label="停止生成"
            @click="emit('stop')"
          /><v-btn
            @click="emit('send')"
            icon="mdi-arrow-up"
            variant="tonal"
            :disabled="!canSend"
            class="send-btn input-action-btn"
            aria-label="发送消息"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.input-area {
  padding: 0 16px;
  background-color: transparent;
  position: relative;
  border-top: 1px solid var(--v-theme-border);
  flex-shrink: 0;
}

.input-neutral-btn {
  color: #6f6f6f !important;
}

.input-neutral-btn:hover {
  background: #efefef;
}

.input-neutral-btn--tonal {
  background: #efefef;
  color: #4f4f4f !important;
}

.input-neutral-btn--tonal:hover {
  background: #e7e7e7;
}

.input-action-btn {
  background: #5594c6 !important;
  color: #fff !important;
}

.input-action-btn:hover {
  background: #4c86b3 !important;
}

.input-action-btn:disabled {
  background: rgba(85, 148, 198, 0.24) !important;
  color: rgba(255, 255, 255, 0.72) !important;
}

.input-icon-btn {
  background: transparent !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  margin-right: 8px;
}

.input-icon-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.04) !important;
}

.token-usage-indicator {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  border-radius: 50%;
  color: var(--token-usage-color);
}

.token-usage-progress {
  color: currentColor;
}

.token-usage-progress :deep(.v-progress-circular__underlay) {
  color: rgba(var(--v-theme-on-surface), 0.18);
  stroke: currentColor;
  opacity: 0.24;
}

.token-usage-progress :deep(.v-progress-circular__overlay) {
  stroke: currentColor;
}

.input-outline-control {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  border: 0 !important;
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
}

.input-outline-control:hover,
.input-outline-control:focus-visible {
  border-color: transparent !important;
  background: rgba(var(--v-theme-on-surface), 0.04) !important;
}

.input-area.is-dark .input-neutral-btn {
  color: rgba(255, 255, 255, 0.78) !important;
}

.input-area.is-dark .input-neutral-btn:hover,
.input-area.is-dark .input-neutral-btn--tonal {
  background: rgba(255, 255, 255, 0.1);
}

.input-area.is-dark .input-outline-control {
  border-color: transparent !important;
  background: transparent !important;
}

.input-area.is-dark .input-outline-control:hover,
.input-area.is-dark .input-outline-control:focus-visible {
  border-color: transparent !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

.input-area.is-dark .input-action-btn {
  background: rgb(var(--v-theme-on-surface)) !important;
  color: rgb(var(--v-theme-surface)) !important;
}

.input-area.is-dark .input-action-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.86) !important;
}

.input-area.is-dark .input-action-btn:disabled {
  background: rgba(var(--v-theme-on-surface), 0.14) !important;
  color: rgba(var(--v-theme-on-surface), 0.4) !important;
}

.input-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 64px;
  padding: 6px 12px 6px 14px !important;
  border-color: #f0f0f0 !important;
  border-radius: 999px !important;
  background: #fff !important;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06) !important;
}

.input-container.is-multiline {
  justify-content: flex-start;
  padding: 16px 20px 14px !important;
  border-radius: 34px !important;
}

.input-container.has-attachments {
  justify-content: flex-start;
  min-height: 130px;
  padding: 14px 18px 10px !important;
  border-radius: 30px !important;
}

.input-area.is-dark .input-container {
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  background: #2d2d2d !important;
  box-shadow: none !important;
}

.reply-preview,
.attachments-preview {
  width: 100%;
  flex: 0 0 auto;
}

.composer-row {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'left field right';
  align-items: center;
  column-gap: 10px;
}

.input-container.is-multiline .composer-row {
  grid-template-areas:
    'field field field'
    'left . right';
  row-gap: 10px;
  align-items: end;
}

.input-field-shell {
  grid-area: field;
  min-width: 0;
  min-height: 52px;
  display: flex;
  align-items: center;
}

.input-container.is-multiline .input-field-shell {
  min-height: auto;
  align-items: flex-start;
}

.chat-text-input,
.chat-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 52px !important;
  max-height: 72px !important;
  margin: 0;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 18px !important;
}

.chat-text-input {
  height: 52px !important;
  padding: 0 !important;
  line-height: normal !important;
  overflow: hidden;
}

.chat-textarea {
  max-height: min(48vh, 420px) !important;
  padding: 12px 0 !important;
  overflow-y: auto;
  overflow-wrap: break-word;
  line-height: 28px !important;
  transition: height 0.16s ease;
}

.chat-text-input::placeholder,
.chat-textarea::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.56);
  opacity: 1;
}

.input-left-actions {
  grid-area: left;
  display: flex;
  align-items: center;
  flex: 0 0 auto !important;
  justify-content: center !important;
  gap: 0 !important;
  min-width: auto !important;
  margin-top: 0 !important;
  overflow: visible !important;
}

.input-right-actions {
  grid-area: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 10px;
  margin-top: 0 !important;
}

.input-outline-control {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  border: 0 !important;
  border-color: transparent !important;
  border-radius: 50% !important;
  box-shadow: none !important;
}

.input-icon-btn {
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  margin-right: 0;
}

.input-right-actions :deep(.provider-chip) {
  height: 40px !important;
  min-height: 40px !important;
  border-radius: 999px !important;
}

.input-area:not(.is-dark) .input-action-btn {
  width: 46px !important;
  height: 46px !important;
  min-width: 46px !important;
  background: #8fcfb4 !important;
  color: #fff !important;
}

.input-area:not(.is-dark) .input-action-btn:hover {
  background: #7fc4a8 !important;
}

.input-area:not(.is-dark) .input-action-btn:disabled {
  background: #f2f5f3 !important;
  color: rgba(0, 0, 0, 0.18) !important;
}

.reply-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  margin: 8px 8px 0 8px;
  background-color: rgba(var(--v-theme-primary), 0.06);
  border-radius: 12px;
  gap: 8px;
  max-height: 500px;
  overflow: hidden;
}

/* Transition animations for reply preview */
.slideReply-enter-active {
  animation: slideDown 0.2s ease-out;
}

.slideReply-leave-active {
  animation: slideUp 0.2s ease-out;
}

@keyframes slideDown {
  from {
    max-height: 0;
    opacity: 0;
    margin-top: 0;
    padding-top: 0;
    padding-bottom: 0;
  }

  to {
    max-height: 500px;
    opacity: 1;
    margin-top: 8px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
}

@keyframes slideUp {
  from {
    max-height: 500px;
    opacity: 1;
    margin-top: 8px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  to {
    max-height: 0;
    opacity: 0;
    margin-top: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
}

.reply-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.reply-icon {
  color: var(--v-theme-secondary);
  flex-shrink: 0;
}

.reply-text {
  font-size: 13px;
  color: var(--v-theme-secondaryText);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.remove-reply-btn {
  flex-shrink: 0;
  opacity: 0.6;
}

.attachments-preview {
  display: flex;
  gap: 10px;
  margin: 10px 12px 0;
  padding: 2px 2px 4px;
  flex-wrap: nowrap;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  max-height: 72px;
}

.input-container.has-attachments .attachments-preview {
  margin: 0 0 8px;
  padding: 0;
}

.attachment-card {
  --attachment-color: #607d8b;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 210px;
  height: 54px;
  flex: 0 0 auto;
  min-width: 0;
  padding: 7px 32px 7px 10px;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.055);
  border: 0;
  border-radius: 8px;
}

.file-preview {
  background: rgba(var(--v-theme-on-surface), 0.055);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--attachment-color) 14%, transparent),
    rgba(var(--v-theme-on-surface), 0.055) 62%
  );
}

.image-preview {
  width: 54px;
  flex-basis: 54px;
  padding: 0;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.attachment-icon {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  flex-shrink: 0;
  min-width: 34px;
  color: var(--attachment-color);
}

.attachment-icon--audio {
  color: #00897b;
}

.attachment-ext {
  max-width: 58px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  line-height: 12px;
  color: var(--attachment-color);
}

.attachment-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 17px;
}

.remove-attachment-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px !important;
  height: 22px !important;
  min-width: 22px !important;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.remove-attachment-btn:hover {
  opacity: 1;
}

.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

.attachments-enter-active,
.attachments-leave-active {
  overflow: hidden;
  transition:
    max-height 0.2s ease,
    margin 0.2s ease,
    padding 0.2s ease,
    opacity 0.16s ease,
    transform 0.2s ease;
}

.attachments-enter-from,
.attachments-leave-to {
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
  transform: translateY(6px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .input-area {
    padding: 8px 0 0 !important;
    border-top: 0;
  }

  .input-container {
    display: flex !important;
    flex-direction: column;
    justify-content: center;
    width: calc(100% - 20px) !important;
    max-width: 100% !important;
    min-height: 64px;
    margin: 0 10px calc(8px + env(safe-area-inset-bottom)) !important;
    padding: 6px 8px 6px 10px !important;
    overflow: hidden;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14) !important;
    border-radius: 999px !important;
    background: #fff !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08) !important;
  }

  .input-container.is-multiline {
    justify-content: flex-start;
    min-height: 128px;
    padding: 10px !important;
    border-radius: 26px !important;
  }

  .input-container.has-attachments {
    justify-content: flex-start;
    min-height: 124px;
    padding: 10px !important;
    border-radius: 26px !important;
  }

  .input-area.is-dark .input-container {
    border-color: rgba(255, 255, 255, 0.16) !important;
    background: #2d2d2d !important;
    box-shadow: none !important;
  }

  .composer-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: 'left field right';
    min-height: 52px;
    row-gap: 0;
    column-gap: 8px;
    align-items: center;
  }

  .input-container.is-multiline .composer-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'field field field'
      'left . right';
    min-height: auto;
    row-gap: 4px;
  }

  .input-field-shell {
    min-height: 52px;
    align-items: center;
  }

  .input-container.is-multiline .input-field-shell {
    min-height: 56px;
    align-items: flex-start;
  }

  .input-left-actions,
  .input-right-actions {
    margin-top: 0 !important;
    align-items: center !important;
  }

  .input-right-actions {
    gap: 6px;
  }

  .input-outline-control {
    width: 38px !important;
    height: 38px !important;
    min-width: 38px !important;
    border: 0 !important;
    border-color: transparent !important;
    border-radius: 50% !important;
  }

  .chat-text-input,
  .chat-textarea {
    min-height: 52px !important;
    max-height: 132px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 18px !important;
  }

  .chat-text-input {
    height: 52px !important;
    padding: 0 2px !important;
    line-height: normal !important;
    overflow: hidden;
  }

  .chat-textarea {
    max-height: min(42vh, 220px) !important;
    padding: 4px 10px 2px !important;
    line-height: 24px !important;
    overflow-y: auto;
  }

  .chat-text-input::placeholder,
  .chat-textarea::placeholder {
    color: rgba(var(--v-theme-on-surface), 0.56);
    opacity: 1;
  }

  .input-icon-btn {
    width: 38px !important;
    height: 38px !important;
    min-width: 38px !important;
    margin-right: 0;
  }

  .input-action-btn {
    width: 42px !important;
    height: 42px !important;
    min-width: 42px !important;
    border-radius: 50% !important;
  }

  .input-action-btn:not(:disabled) {
    background: rgb(var(--v-theme-on-surface)) !important;
    color: rgb(var(--v-theme-surface)) !important;
  }

  .input-action-btn:disabled {
    background: rgba(var(--v-theme-on-surface), 0.04) !important;
    color: rgba(var(--v-theme-on-surface), 0.18) !important;
  }

  :deep(.provider-chip) {
    height: 38px !important;
    min-height: 38px !important;
    border-radius: 999px !important;
    padding: 0 12px !important;
    font-size: 14px !important;
    border-color: rgba(var(--v-theme-on-surface), 0.18) !important;
    background: transparent !important;
  }

  .attachments-preview {
    margin: 8px 16px 0;
    gap: 8px;
  }

  .input-container.has-attachments .attachments-preview {
    margin: 0 0 8px;
  }

  .attachment-card {
    width: min(220px, calc(100vw - 28px));
    height: 54px;
  }

  .image-preview {
    width: 54px;
    flex-basis: 54px;
  }
}
</style>
