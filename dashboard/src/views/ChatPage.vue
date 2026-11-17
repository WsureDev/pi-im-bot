<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme, useDisplay } from 'vuetify'
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
const theme = useTheme()
const display = useDisplay()
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
    <v-toolbar color="transparent" density="compact"
      ><v-toolbar-title>{{ detail.room.name }}</v-toolbar-title
      ><v-chip v-if="detail.room.mode === 'demo'" color="warning" size="small">离线演示</v-chip
      ><v-chip v-else color="success" size="small">真实模型</v-chip
      ><v-btn icon="mdi-cog-outline" aria-label="聊天设置" @click="openSettings" /><v-btn
        icon="mdi-clock-outline"
        aria-label="任务与追踪"
        @click="records = true" /><v-btn
        icon="mdi-plus"
        aria-label="新建会话"
        @click="notifications.run(() => action('new'))"
    /></v-toolbar>
    <v-select
      :model-value="detail.room.currentConversationId"
      @update:model-value="notifications.run(() => selectConversation($event))"
      :items="detail.conversations"
      item-title="title"
      item-value="id"
      label="会话上下文"
      density="compact"
      hide-details
      class="flex-grow-0 mb-2"
      aria-label="会话上下文"
    />
    <div class="flex-grow-1" style="min-height: 0">
      <ChatMessageList
        :messages="detail.messages"
        :room-id="roomId"
        :preview="preview"
        :streaming="Boolean(running.length)"
        :is-dark="theme.global.current.value.dark"
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
      :is-dark="theme.global.current.value.dark"
      @send="notifications.run(send)"
      @stop="notifications.run(() => action('stop'))"
      @upload="notifications.run(() => upload($event))"
      @remove="draft.attachments.splice($event, 1)"
      @clear-reply="clearReply"
    />
  </div>
  <v-alert v-else type="info" variant="tonal"
    >请选择一个渠道，或创建 Mock 渠道。<v-progress-linear v-if="workspace.loading" indeterminate
  /></v-alert>
  <v-navigation-drawer v-model="records" location="right" temporary :width="recordWidth"
    ><v-toolbar
      ><v-toolbar-title>任务与工具追踪</v-toolbar-title><v-btn icon="mdi-close" @click="records = false"
    /></v-toolbar>
    <v-expansion-panels multiple
      ><v-expansion-panel
        v-for="run in detail?.runs"
        :key="run.id"
        :title="run.status + ' · ' + run.providerGroup"
        ><v-expansion-panel-text
          ><v-chip class="mb-3">模型 {{ run.modelCalls }} · 工具 {{ run.toolCalls }}</v-chip>
          <p>输入 {{ run.usage.input }} / 输出 {{ run.usage.output }} / 缓存读取 {{ run.usage.cacheRead }}</p>
          <v-alert v-if="run.error" type="error">{{ run.error }}</v-alert
          ><v-list
            ><v-list-item
              v-for="trace in detail?.traces.filter((entry) => entry.runId === run.id)"
              :key="trace.id"
              :title="trace.title"
              :subtitle="trace.kind"
            >
              <pre>{{ trace.detail }}</pre>
            </v-list-item></v-list
          >
          <pre v-if="run.presentation">{{ JSON.stringify(run.presentation, null, 2) }}</pre>
        </v-expansion-panel-text></v-expansion-panel
      ></v-expansion-panels
    >
    <v-expansion-panels class="mt-4"
      ><v-expansion-panel title="平台发送回执"
        ><v-expansion-panel-text>
          <pre>{{ JSON.stringify(detail?.outbound, null, 2) }}</pre>
        </v-expansion-panel-text></v-expansion-panel
      ></v-expansion-panels
    >
  </v-navigation-drawer>
  <v-dialog v-model="settings" max-width="600"
    ><v-card title="聊天设置"
      ><v-card-text
        ><v-select
          v-model="mode"
          :items="[
            { title: '离线演示', value: 'demo' },
            { title: '真实模型', value: 'live' }
          ]"
          label="运行模式"
          aria-label="运行模式"
        /><v-select
          v-model="providerGroup"
          :items="workspace.snapshot?.providers.groups ?? []"
          item-title="name"
          item-value="id"
          label="模型组"
          aria-label="模型组"
        /><v-text-field v-model="actorId" label="模拟用户 ID" /><v-text-field
          v-model="actorName"
          label="模拟昵称"
        /><v-btn to="/settings">完整 Bot 设置</v-btn></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="settings = false">取消</v-btn
        ><v-btn variant="flat" color="primary" @click="notifications.run(saveSettings)"
          >保存</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
