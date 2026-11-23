<script setup lang="ts">
import UiAccordion from '@/ui/UiAccordion.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiDisclosure from '@/ui/UiDisclosure.vue'
import UiDrawer from '@/ui/UiDrawer.vue'
import RunTrace from '@/components/chat/RunTrace.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppearance, useViewport } from '@/ui/appearance'
import { AttachmentSchema, type Attachment, type ChatMessage } from '@core/domain/message'
import { RoomDetailSchema } from '@core/http/contracts'
import { useChatDrafts } from '@/stores/chat-drafts'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { request, mutate, id } from '@/api/http'
import { confirmAction } from '@/utils/confirm'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
const workspace = useWorkspace()
const notifications = useNotifications()
const route = useRoute()
const theme = useAppearance()
const display = useViewport()
const recordWidth = computed(() => {
  return Math.min(520, display.width.value)
})
const roomId = computed(() => {
  return String(route.params.roomId || workspace.activeRoom)
})
const detail = computed(() => {
  return workspace.details[roomId.value]
})
const drafts = useChatDrafts()
const draft = computed(() => {
  return drafts.get(roomId.value)
})
const actorId = ref('developer')
const actorName = ref('开发者')
const busy = ref(false)
const records = ref(false)
const settings = ref(false)
const mode = ref<'demo' | 'live'>('demo')
const providerGroup = ref('main')
const running = computed(() => {
  return (
    detail.value?.runs.filter((run) => {
      return ['batching', 'queued', 'running'].includes(run.status) && run.source !== 'job'
    }) ?? []
  )
})
const preview = computed(() => {
  return running.value
    .map((run) => {
      return workspace.previews[run.id] ?? ''
    })
    .join('\n')
})
watch(
  roomId,
  (value) => {
    if (value) {
      void notifications.run(() => {
        return workspace.loadRoom(value)
      })
    }
  },
  { immediate: true }
)
async function send() {
  const target = roomId.value
  const value = drafts.rooms[target]
  if (!value || busy.value) {
    return
  }
  busy.value = true
  try {
    await mutate('/api/rooms/' + id(target) + '/messages', {
      text: value.text,
      actorId: actorId.value,
      actorName: actorName.value,
      mediaIds: value.attachments.map((attachment) => {
        return attachment.mediaId
      }),
      replyTo: value.replyTo
    })
    drafts.clear(target)
  } finally {
    busy.value = false
  }
}
async function upload(files: File[]) {
  const target = roomId.value
  const value = draft.value
  if (files.length + value.attachments.length > 12) {
    throw new Error('每条消息最多 12 个附件')
  }
  busy.value = true
  try {
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('单个附件不能超过 8 MiB')
      }
      const data = new FormData()
      data.set('file', file)
      value.attachments.push(
        await request('/api/rooms/' + id(target) + '/media', AttachmentSchema, { method: 'POST', data })
      )
    }
  } finally {
    busy.value = false
  }
}
function reply(message: ChatMessage) {
  draft.value.replyTo = { messageId: message.id }
  draft.value.replyLabel = message.actorName + ' · ' + message.text.slice(0, 100)
}
function clearReply() {
  draft.value.replyTo = undefined
  draft.value.replyLabel = ''
}
async function recall(message: ChatMessage) {
  if (await confirmAction('撤回消息', '撤回此条消息及其平台交付内容。')) {
    await mutate('/api/rooms/' + id(roomId.value) + '/recall', { messageId: message.id })
    await workspace.loadRoom(roomId.value)
  }
}
async function retryMedia(attachment: Attachment) {
  await mutate('/api/rooms/' + id(roomId.value) + '/media/' + id(attachment.mediaId!) + '/retry')
  await workspace.loadRoom(roomId.value)
}
async function action(operation: string) {
  await mutate('/api/rooms/' + id(roomId.value) + '/' + operation)
  await workspace.loadRoom(roomId.value)
}
async function selectConversation(value: string) {
  await action('conversations/' + id(value) + '/select')
}
function openSettings() {
  mode.value = detail.value?.room.mode ?? 'demo'
  providerGroup.value = detail.value?.effective.settings.preferences.providerGroup ?? 'main'
  settings.value = true
}
async function saveSettings() {
  const current = await request('/api/rooms/' + id(roomId.value), RoomDetailSchema)
  if (current.room.mode !== mode.value) {
    await mutate(
      '/api/rooms/' + id(roomId.value),
      { mode: mode.value, revision: current.room.revision },
      'PATCH'
    )
  }
  const conversation = current.conversations.find((entry) => {
    return entry.id === current.room.currentConversationId
  })!
  await mutate(
    '/api/rooms/' + id(roomId.value) + '/conversations/' + id(conversation.id),
    {
      revision: conversation.revision,
      settings: {
        ...conversation.settings,
        preferences: { ...conversation.settings.preferences, providerGroup: providerGroup.value }
      }
    },
    'PATCH'
  )
  settings.value = false
  await workspace.loadRoom(roomId.value)
}
</script>
<template>
  <div v-if="detail" class="d-flex flex-column" style="height: calc(100dvh - 116px); min-height: 420px">
    <header class="pi-toolbar">
      <div class="pi-toolbar-title">{{ detail.room.name }}</div>
      <UiChip v-if="detail.room.mode === 'demo'" color="warning" size="small">离线演示</UiChip
      ><UiChip v-else color="success" size="small">真实模型</UiChip
      ><UiButton icon="mdi-cog-outline" aria-label="聊天设置" @click="openSettings" /><UiButton
        icon="mdi-clock-outline"
        aria-label="任务与追踪"
        @click="records = true"
      /><UiButton icon="mdi-plus" aria-label="新建会话" @click="notifications.run(() => action('new'))" />
    </header>
    <UiChoice
      :model-value="detail.room.currentConversationId"
      @update:model-value="notifications.run(() => selectConversation($event))"
      :items="detail.conversations"
      item-title="title"
      item-value="id"
      label="会话上下文"
      class="flex-grow-0 mb-2"
      aria-label="会话上下文"
    />
    <div class="flex-grow-1" style="min-height: 0">
      <ChatMessageList
        :messages="detail.messages"
        :room-id="roomId"
        :preview="preview"
        :streaming="Boolean(running.length)"
        :is-dark="theme.dark.value"
        @reply="reply"
        @recall="notifications.run(() => recall($event))"
        @retry-media="notifications.run(() => retryMedia($event))"
      />
    </div>
    <ChatInput
      v-model="draft.text"
      :attachments="draft.attachments"
      :reply-label="draft.replyLabel"
      :disabled="busy"
      :is-running="Boolean(running.length)"
      :is-dark="theme.dark.value"
      @send="notifications.run(send)"
      @stop="notifications.run(() => action('stop'))"
      @upload="notifications.run(() => upload($event))"
      @remove="draft.attachments.splice($event, 1)"
      @clear-reply="clearReply"
    />
  </div>
  <div class="pi-alert" v-else data-tone="info">
    请选择一个渠道，或创建 Mock 渠道。<progress class="pi-progress" v-if="workspace.loading" />
  </div>
  <UiDrawer v-model="records" location="right" temporary :width="recordWidth"
    ><header class="pi-toolbar">
      <div class="pi-toolbar-title">任务与工具追踪</div>
      <UiButton aria-label="关闭运行记录" icon="mdi-close" @click="records = false" />
    </header>
    <UiAccordion multiple
      ><UiDisclosure v-for="run in detail?.runs" :key="run.id" :title="run.status + ' · ' + run.providerGroup"
        ><div class="pi-disclosure-body">
          <UiChip class="mb-3">模型 {{ run.modelCalls }} · 工具 {{ run.toolCalls }}</UiChip>
          <p>输入 {{ run.usage.input }} / 输出 {{ run.usage.output }} / 缓存读取 {{ run.usage.cacheRead }}</p>
          <div class="pi-alert" v-if="run.error" data-tone="error">{{ run.error }}</div>
          <RunTrace :events="(detail?.traces ?? []).filter((entry) => entry.runId === run.id)" />
          <pre v-if="run.presentation">{{ JSON.stringify(run.presentation, null, 2) }}</pre>
        </div></UiDisclosure
      ></UiAccordion
    >
    <UiAccordion class="mt-4"
      ><UiDisclosure title="平台发送回执"
        ><div class="pi-disclosure-body">
          <pre>{{ JSON.stringify(detail?.outbound, null, 2) }}</pre>
        </div></UiDisclosure
      ></UiAccordion
    >
  </UiDrawer>
  <UiDialog v-model="settings" max-width="600"
    ><UiCard title="聊天设置"
      ><div class="pi-section">
        <UiChoice
          v-model="mode"
          :items="[
            { title: '离线演示', value: 'demo' },
            { title: '真实模型', value: 'live' }
          ]"
          label="运行模式"
          aria-label="运行模式"
        /><UiChoice
          v-model="providerGroup"
          :items="workspace.snapshot?.providers.groups ?? []"
          item-title="name"
          item-value="id"
          label="模型组"
          aria-label="模型组"
        /><UiText v-model="actorId" label="模拟用户 ID" /><UiText
          v-model="actorName"
          label="模拟昵称"
        /><UiButton to="/settings">完整 Bot 设置</UiButton>
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="settings = false">取消</UiButton
        ><UiButton variant="flat" color="primary" @click="notifications.run(saveSettings)">保存</UiButton>
      </footer></UiCard
    ></UiDialog
  >
</template>
