<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
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
    <span class="pi-spacer" /><UiButton @click="notices.run(load)">刷新</UiButton>
  </div>
  <div data-tone="info" class="pi-alert mb-4">
    这是运行记录，不会模拟身份或发起调用。角色来自触发时的平台事实和管理员配置，后续执行仍检查当前权限与原权限上限。旧记录可能没有聊天类型字段。
  </div>
  <UiChoice
    v-if="entries.length"
    v-model="selected"
    :items="options"
    label="运行记录"
    aria-label="运行记录"
  />
  <div class="pi-alert" v-else data-tone="info">暂无运行记录。后续真实触发后可在这里查看。</div>
  <template v-if="current"
    ><div class="pi-row">
      <UiCol cols="12" md="6"
        ><UiCard title="身份来源"
          ><div class="pi-section">
            <div v-for="actor in current.actors" :key="actor.origin + actor.actorId" class="mb-4">
              <strong>{{ actor.actorName }} · {{ actor.actorId }}</strong>
              <p class="text-caption text-medium-emphasis">
                {{ actor.origin }} · {{ actor.channel }} / {{ actor.accountId }}
              </p>
              <p class="my-2">
                {{ actor.chatKind ?? '旧记录未保存聊天类型' }} · 平台角色 {{ actor.role ?? '未提供' }}
              </p>
              <UiChip v-for="role in actor.roles" :key="role" color="primary" size="small" class="mr-2">{{
                role
              }}</UiChip>
            </div>
          </div></UiCard
        ></UiCol
      ><UiCol cols="12" md="6"
        ><UiCard title="权限快照"
          ><div class="pi-section">
            <p>
              {{ roomName(current.roomId) }} · {{ current.status
              }}<UiChip v-if="current.mode === 'demo'" color="warning" size="small" class="ml-2"
                >离线演示</UiChip
              >
            </p>
            <p class="text-caption text-medium-emphasis my-3">{{ current.policyRevision }}</p>
            <div class="d-flex flex-wrap ga-2">
              <UiChip
                v-for="capability in current.capabilities"
                :key="capability"
                size="small"
                color="secondary"
                >{{ capability }}</UiChip
              >
            </div>
          </div></UiCard
        ></UiCol
      >
    </div>
    <UiCard class="mt-5" title="上下文记录"
      ><div class="pi-section">
        <pre class="context-json">{{ JSON.stringify(current, null, 2) }}</pre>
      </div></UiCard
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
  background: rgb(var(--pi-background));
  font-size: 12px;
}
</style>
