<script setup lang="ts">
import { usePasswordVisibility } from '@/composables/password-visibility'
import { SecretValueSchema } from '@core/plugins/configuration/secret-editor'

import { computed, onMounted, ref } from 'vue'
import { OneBotPublicSettingsSchema, OneBotSettingsInputSchema } from '@core/channels/onebot/status'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { useDraft } from '@/composables/drafts'
import { request, mutate } from '@/api/http'
import { z } from 'zod'
const workspace = useWorkspace()
const notifications = useNotifications()
const version = ref('')
const tokenVisibility = usePasswordVisibility()
const path = ref('')
const selectedAccount = ref('')
const draft = ref({
  enabled: false,
  commandPrefix: '/pi',
  accessToken: '',
  clearToken: false,
  targets: [] as z.infer<typeof OneBotSettingsInputSchema>['targets'],
  mediaOrigins: '[]'
})
const changes = useDraft(draft)
const busy = ref(false)
async function load() {
  const previousBusy = busy.value
  busy.value = true
  try {
    const settings = await request('/api/onebot/settings', OneBotPublicSettingsSchema)
    version.value = settings.version
    const stored = await request('/api/onebot/settings/token', SecretValueSchema, {
      method: 'POST',
      data: { version: settings.version }
    })
    tokenVisibility.reset()
    path.value = settings.path
    draft.value = {
      enabled: settings.enabled,
      commandPrefix: settings.commandPrefix,
      accessToken: stored.value,
      clearToken: false,
      targets: settings.targets,
      mediaOrigins: JSON.stringify(settings.mediaOrigins, null, 2)
    }
    changes.clean()
  } finally {
    busy.value = previousBusy
  }
}
function updateToken(value: string | null) {
  draft.value.accessToken = value ?? ''
  draft.value.clearToken = !value
}
async function save() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    const data = OneBotSettingsInputSchema.parse({
      ...draft.value,
      version: version.value,
      mediaOrigins: JSON.parse(draft.value.mediaOrigins),
      accessToken: draft.value.accessToken || undefined
    })
    await mutate('/api/onebot/settings', data, 'PUT')
    changes.clean()
    await load()
    await workspace.refresh()
    notifications.show('QQ 接入设置已保存。')
  } finally {
    busy.value = false
  }
}
async function refreshGroups() {
  await mutate('/api/onebot/groups/refresh', { selfId: selectedAccount.value })
  await workspace.refresh()
}
function selectChat(chat: NonNullable<typeof workspace.snapshot>['onebot']['chats'][number]) {
  if (chat.kind !== 'group') {
    return
  }
  if (
    draft.value.targets.some((target) => {
      return target.selfId === chat.selfId && target.chatId === chat.chatId
    })
  ) {
    return
  }
  draft.value.targets.push({ selfId: chat.selfId, chatId: chat.chatId, name: chat.name, enabled: true })
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <v-toolbar color="transparent"
    ><v-toolbar-title>QQ 接入</v-toolbar-title
    ><v-chip>{{ workspace.snapshot?.onebot.accounts.length ?? 0 }} 个账号已连接</v-chip></v-toolbar
  >
  <v-alert type="info" variant="tonal" class="mb-4"
    >反向 WebSocket：{{ path }}。连接账号后，请明确选择允许回复的目标。</v-alert
  >
  <v-card title="连接设置"
    ><v-form @submit.prevent="notifications.run(save)"
      ><v-card-text :inert="busy">
        <v-switch v-model="draft.enabled" label="启用 OneBot" /><v-text-field
          v-model="draft.commandPrefix"
          label="Agent 消息前缀"
        />
        <v-text-field
          :model-value="draft.accessToken"
          @update:model-value="updateToken"
          :type="tokenVisibility.type.value"
          :append-inner-icon="tokenVisibility.icon.value"
          @click:append-inner="tokenVisibility.toggle"
          autocomplete="new-password"
          clearable
          label="Access Token"
          aria-label="Access Token"
        />
        <section class="form-section">
          <h3 class="form-section-title">允许的媒体来源</h3>
          <v-textarea v-model="draft.mediaOrigins" label="媒体来源 JSON" rows="3" />
        </section>
        <h2 class="text-h6 mb-3">已选择的回复目标</h2>
        <v-data-table
          :items="draft.targets"
          :headers="[
            { title: '名称', key: 'name' },
            { title: '账号', key: 'selfId' },
            { title: '群 / 用户', key: 'chatId' },
            { title: '启用', key: 'enabled' },
            { title: '移除', key: 'actions' }
          ]"
        >
          <template #item.selfId="{ item }"
            ><v-text-field v-model="item.selfId" label="账号 QQ" hide-details density="compact" /></template
          ><template #item.chatId="{ item }"
            ><v-text-field
              v-model="item.chatId"
              label="群号 / 用户 QQ"
              hide-details
              density="compact" /></template
          ><template #item.name="{ item }"><v-text-field v-model="item.name" hide-details /></template
          ><template #item.enabled="{ item }"><v-switch v-model="item.enabled" hide-details /></template
          ><template #item.actions="{ index }"
            ><v-btn
              icon="mdi-delete-outline"
              variant="text"
              aria-label="移除目标"
              @click="draft.targets.splice(index, 1)"
          /></template>
        </v-data-table>
        <v-btn class="mt-3" @click="draft.targets.push({ selfId: '', chatId: '', name: '', enabled: false })"
          >手动添加目标</v-btn
        > </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn variant="flat" color="primary" type="submit" :loading="busy"
          >保存接入设置</v-btn
        ></v-card-actions
      ></v-form
    ></v-card
  >
  <v-card title="发现的会话"
    ><v-card-text :inert="busy"
      ><v-row
        ><v-col
          ><v-select
            v-model="selectedAccount"
            :items="workspace.snapshot?.onebot.accounts ?? []"
            label="在线账号"
            aria-label="在线账号" /></v-col
        ><v-col
          ><v-btn :disabled="!selectedAccount" @click="notifications.run(refreshGroups)"
            >刷新群列表</v-btn
          ></v-col
        ></v-row
      >
      <v-data-table
        :items="workspace.snapshot?.onebot.chats ?? []"
        :headers="[
          { title: '名称', key: 'name' },
          { title: '账号', key: 'selfId' },
          { title: '群 / 用户', key: 'chatId' },
          { title: '操作', key: 'actions' }
        ]"
        :items-per-page="25"
        ><template #item.actions="{ item }"
          ><v-btn v-if="item.kind === 'group'" @click="selectChat(item)">选择此目标</v-btn></template
        ></v-data-table
      >
    </v-card-text></v-card
  >
  <v-card title="近期消息路由"
    ><v-data-table
      :items="workspace.snapshot?.onebot.recent ?? []"
      :headers="[
        { title: '账号', key: 'selfId' },
        { title: '目标', key: 'chatId' },
        { title: '处理结果', key: 'reason' },
        { title: '时间', key: 'at' }
      ]"
      :items-per-page="10"
  /></v-card>
</template>
