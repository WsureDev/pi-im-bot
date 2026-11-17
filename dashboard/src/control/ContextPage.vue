<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { z } from 'zod'
import { ContextHistorySchema } from '@core/control/contracts'
import { request } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useWorkspace } from '@/stores/workspace'
const notices = useNotifications()
const workspace = useWorkspace()
const entries = ref<z.infer<typeof ContextHistorySchema>['entries']>([])
const selected = ref('')
const current = computed(() => {
  return entries.value.find((entry) => {
    return entry.runId === selected.value
  })
})
const options = computed(() => {
  return entries.value.map((entry) => {
    return {
      title: new Date(entry.at).toLocaleString() + ' · ' + roomName(entry.roomId) + ' · ' + entry.source,
      value: entry.runId
    }
  })
})
function roomName(id: string) {
  return (
    workspace.snapshot?.rooms.find((room) => {
      return room.id === id
    })?.name ?? id
  )
}
async function load() {
  entries.value = (await request('/api/control/contexts', ContextHistorySchema)).entries
  if (
    !entries.value.some((entry) => {
      return entry.runId === selected.value
    })
  ) {
    selected.value = entries.value[0]?.runId ?? ''
  }
}
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <div class="d-flex align-center mb-4">
    <div>
      <h1 class="text-h5 font-weight-bold">触发上下文</h1>
      <p class="text-medium-emphasis mt-1">查看真实运行记录中的触发身份与捕获权限。</p>
    </div>
    <v-spacer /><v-btn @click="notices.run(load)">刷新</v-btn>
  </div>
  <v-alert type="info" variant="tonal" class="mb-4"
    >这是运行记录，不会模拟身份或发起调用。角色来自触发时的平台事实和管理员配置，后续执行仍检查当前权限与原权限上限。旧记录可能没有聊天类型字段。</v-alert
  >
  <v-select
    v-if="entries.length"
    v-model="selected"
    :items="options"
    label="运行记录"
    aria-label="运行记录"
  />
  <v-alert v-else type="info" variant="tonal">暂无运行记录。后续真实触发后可在这里查看。</v-alert>
  <template v-if="current"
    ><v-row
      ><v-col cols="12" md="6"
        ><v-card title="身份来源"
          ><v-card-text
            ><div v-for="actor in current.actors" :key="actor.origin + actor.actorId" class="mb-4">
              <strong>{{ actor.actorName }} · {{ actor.actorId }}</strong>
              <p class="text-caption text-medium-emphasis">
                {{ actor.origin }} · {{ actor.channel }} / {{ actor.accountId }}
              </p>
              <p class="my-2">
                {{ actor.chatKind ?? '旧记录未保存聊天类型' }} · 平台角色 {{ actor.role ?? '未提供' }}
              </p>
              <v-chip v-for="role in actor.roles" :key="role" color="primary" size="small" class="mr-2">{{
                role
              }}</v-chip>
            </div></v-card-text
          ></v-card
        ></v-col
      ><v-col cols="12" md="6"
        ><v-card title="权限快照"
          ><v-card-text
            ><p>
              {{ roomName(current.roomId) }} · {{ current.status
              }}<v-chip v-if="current.mode === 'demo'" color="warning" size="small" class="ml-2"
                >离线演示</v-chip
              >
            </p>
            <p class="text-caption text-medium-emphasis my-3">{{ current.policyRevision }}</p>
            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="capability in current.capabilities"
                :key="capability"
                size="small"
                color="secondary"
                >{{ capability }}</v-chip
              >
            </div></v-card-text
          ></v-card
        ></v-col
      ></v-row
    ><v-card class="mt-5" title="上下文记录"
      ><v-card-text>
        <pre class="context-json">{{ JSON.stringify(current, null, 2) }}</pre>
      </v-card-text></v-card
    ></template
  >
</template>
<style scoped>
.context-json {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 450px;
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: rgb(var(--v-theme-background));
  font-size: 12px;
}
</style>
