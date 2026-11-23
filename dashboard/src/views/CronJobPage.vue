<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDataTable from '@/ui/table/UiDataTable.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiMenu from '@/ui/UiMenu.vue'
import UiMenuAction from '@/ui/UiMenuAction.vue'
import UiText from '@/ui/fields/UiText.vue'
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
  <header class="pi-toolbar">
    <div class="pi-toolbar-title">计划任务</div>
    <UiButton variant="flat" color="primary" prepend-icon="mdi-plus" @click="dialog = true"
      >创建计划</UiButton
    >
  </header>
  <UiCard
    ><UiDataTable :headers="headers" :items="workspace.snapshot?.schedules ?? []" :items-per-page="25">
      <template #item.enabled="{ item }"
        ><UiCheck
          :model-value="item.enabled"
          @update:model-value="notifications.run(() => action(item, 'toggle'))"
          :aria-label="item.name + ' 启用'"
      /></template>
      <template #item.nextRunAt="{ item }">{{ time(item.nextRunAt) }}</template>
      <template #item.lastOutcome="{ item }"
        ><UiChip v-if="item.lastOutcome" size="small">{{ item.lastOutcome }}</UiChip>
        <p>{{ item.lastError }}</p>
        <router-link v-if="item.lastJobId" :to="{ path: '/jobs', query: { job: item.lastJobId } }"
          >查看任务回执</router-link
        ></template
      >
      <template #item.actions="{ item }"
        ><UiMenu label="计划操作"
          ><div class="pi-list">
            <UiMenuAction
              title="立即运行"
              @choose="notifications.run(() => action(item, 'run'))"
            /><UiMenuAction
              title="停止本次执行"
              @choose="notifications.run(() => action(item, 'stop'))"
            /><UiMenuAction
              title="以本地操作员更新权限"
              @choose="notifications.run(() => action(item, 'authorize'))"
            /><UiMenuAction
              title="删除"
              @choose="notifications.run(() => action(item, 'delete'))"
            /></div></UiMenu
      ></template> </UiDataTable
  ></UiCard>
  <UiDialog v-model="dialog" persistent max-width="680"
    ><UiCard title="创建计划"
      ><form class="pi-form" @submit.prevent="notifications.run(save)">
        <div class="pi-section" :inert="busy">
          <UiText v-model="draft.name" label="计划名称" required /><UiChoice
            v-model="draft.roomId"
            :items="workspace.snapshot?.rooms ?? []"
            item-title="name"
            item-value="id"
            label="执行渠道"
            required
            aria-label="执行渠道"
          />
          <div class="pi-row">
            <UiCol><UiText v-model="draft.cron" label="Cron" required /></UiCol
            ><UiCol><UiText v-model="draft.timezone" label="时区" required /></UiCol>
          </div>
          <UiText multiline v-model="draft.prompt" label="任务内容" required /><UiCheck
            v-model="draft.enabled"
            label="启用计划"
          /><UiCheck v-model="draft.isolated" label="使用独立会话上下文" />
        </div>
        <footer class="pi-actions">
          <span class="pi-spacer" /><UiButton @click="close">取消</UiButton
          ><UiButton variant="flat" type="submit" color="primary" :loading="busy">创建计划</UiButton>
        </footer>
      </form></UiCard
    ></UiDialog
  >
</template>
