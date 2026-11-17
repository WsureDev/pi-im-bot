<script setup lang="ts">
import { ref } from 'vue'
import { ScheduleInputSchema, type Schedule } from '@core/scheduler/definition'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { useDraft } from '@/composables/drafts'
import { confirmAction } from '@/utils/confirm'
import { mutate, id } from '@/api/http'
const workspace = useWorkspace()
const notifications = useNotifications()
const dialog = ref(false)
const busy = ref(false)
const draft = ref({
  name: '',
  roomId: '',
  cron: '0 9 * * *',
  timezone: 'Asia/Shanghai',
  prompt: '',
  enabled: true,
  isolated: true
})
const changes = useDraft(draft)
const headers = [
  { title: '名称', key: 'name' },
  { title: 'Cron', key: 'cron' },
  { title: '时区', key: 'timezone' },
  { title: '启用', key: 'enabled' },
  { title: '下次执行', key: 'nextRunAt' },
  { title: '结果', key: 'lastOutcome' },
  { title: '操作', key: 'actions', sortable: false }
]
async function save() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await mutate('/api/schedules', ScheduleInputSchema.parse(draft.value))
    changes.clean()
    dialog.value = false
    await workspace.refresh()
  } finally {
    busy.value = false
  }
}
async function close() {
  if (await changes.discard()) {
    changes.clean()
    dialog.value = false
  }
}
async function action(schedule: Schedule, action: string) {
  let method = 'POST'
  let suffix = '/' + action
  let body: object | undefined
  if (action === 'delete') {
    if (!(await confirmAction('删除计划', schedule.name))) {
      return
    }
    method = 'DELETE'
    suffix = ''
  }
  if (action === 'toggle') {
    method = 'PATCH'
    suffix = ''
    body = { enabled: !schedule.enabled, revision: schedule.revision }
  }
  await mutate('/api/schedules/' + id(schedule.id) + suffix, body, method)
  await workspace.refresh()
}
function time(value?: number | null) {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString()
}
</script>
<template>
  <v-toolbar color="transparent"
    ><v-toolbar-title>计划任务</v-toolbar-title
    ><v-btn variant="flat" color="primary" prepend-icon="mdi-plus" @click="dialog = true"
      >创建计划</v-btn
    ></v-toolbar
  >
  <v-card
    ><v-data-table :headers="headers" :items="workspace.snapshot?.schedules ?? []" :items-per-page="25">
      <template #item.enabled="{ item }"
        ><v-switch
          :model-value="item.enabled"
          @update:model-value="notifications.run(() => action(item, 'toggle'))"
          hide-details
          :aria-label="item.name + ' 启用'"
      /></template>
      <template #item.nextRunAt="{ item }">{{ time(item.nextRunAt) }}</template>
      <template #item.lastOutcome="{ item }"
        ><v-chip v-if="item.lastOutcome" size="small">{{ item.lastOutcome }}</v-chip>
        <p>{{ item.lastError }}</p>
        <router-link v-if="item.lastJobId" :to="{ path: '/jobs', query: { job: item.lastJobId } }"
          >查看任务回执</router-link
        ></template
      >
      <template #item.actions="{ item }"
        ><v-menu
          ><template #activator="{ props }"
            ><v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" aria-label="计划操作" /></template
          ><v-list
            ><v-list-item
              title="立即运行"
              @click="notifications.run(() => action(item, 'run'))" /><v-list-item
              title="停止本次执行"
              @click="notifications.run(() => action(item, 'stop'))" /><v-list-item
              title="以本地操作员更新权限"
              @click="notifications.run(() => action(item, 'authorize'))" /><v-list-item
              title="删除"
              @click="notifications.run(() => action(item, 'delete'))" /></v-list></v-menu
      ></template> </v-data-table
  ></v-card>
  <v-dialog v-model="dialog" persistent max-width="680"
    ><v-card title="创建计划"
      ><v-form @submit.prevent="notifications.run(save)"
        ><v-card-text :inert="busy">
          <v-text-field v-model="draft.name" label="计划名称" required /><v-select
            v-model="draft.roomId"
            :items="workspace.snapshot?.rooms ?? []"
            item-title="name"
            item-value="id"
            label="执行渠道"
            required
            aria-label="执行渠道"
          />
          <v-row
            ><v-col><v-text-field v-model="draft.cron" label="Cron" required /></v-col
            ><v-col><v-text-field v-model="draft.timezone" label="时区" required /></v-col
          ></v-row>
          <v-textarea v-model="draft.prompt" label="任务内容" required /><v-switch
            v-model="draft.enabled"
            label="启用计划"
          /><v-switch v-model="draft.isolated" label="使用独立会话上下文" /> </v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="close">取消</v-btn
          ><v-btn variant="flat" type="submit" color="primary" :loading="busy"
            >创建计划</v-btn
          ></v-card-actions
        ></v-form
      ></v-card
    ></v-dialog
  >
</template>
