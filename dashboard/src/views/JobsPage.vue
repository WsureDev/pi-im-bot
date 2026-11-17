<script setup lang="ts">
import { computed, ref } from 'vue'
import { z } from 'zod'
import { JobSchema, JobSummarySchema, jobTerminal, type JobSummary } from '@core/jobs/schema'
import { JobDeliveryViewSchema } from '@core/jobs/delivery-view'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { request, mutate, id } from '@/api/http'
import { useDraft } from '@/composables/drafts'
import { jobStateLabel, deliveryLabel } from '@/api/job-labels'
const workspace = useWorkspace()
const notifications = useNotifications()
const search = ref('')
const room = ref('')
const history = ref<JobSummary[]>([])
const nextPage = ref<number>()
const dialog = ref(false)
const busy = ref(false)
const draft = ref({ roomId: '', title: '', prompt: '' })
const changes = useDraft(draft)
const revisionDialog = ref(false)
const revision = ref({ roomId: '', jobId: '', revision: 0, instruction: '' })
const revisionChanges = useDraft(revision)
const receipt = ref<z.infer<typeof JobDeliveryViewSchema>>()
const receiptDialog = ref(false)
const rows = computed(() => {
  const all = new Map<string, JobSummary>()
  for (const job of [...history.value, ...(workspace.snapshot?.jobs ?? [])]) {
    if (!room.value || job.roomId === room.value) {
      all.set(job.id, job)
    }
  }
  return [...all.values()].sort((left, right) => {
    return right.createdAt - left.createdAt
  })
})
const HistorySchema = z.object({ jobs: z.array(JobSummarySchema), nextPage: z.number().optional() })
async function loadHistory(more = false) {
  if (!room.value) {
    return
  }
  let suffix = ''
  if (more && nextPage.value !== undefined) {
    suffix = '?beforePage=' + nextPage.value
  }
  const page = await request('/api/rooms/' + id(room.value) + '/jobs/history' + suffix, HistorySchema)
  if (!more) {
    history.value = []
  }
  history.value.push(...page.jobs)
  nextPage.value = page.nextPage
}
function path(job: JobSummary) {
  return '/api/rooms/' + id(job.roomId) + '/jobs/' + id(job.id)
}
async function act(job: JobSummary, action: string, cancel = false) {
  await mutate(path(job) + '/' + action, { cancel })
  await workspace.refresh()
}
async function create() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await createRequest()
  } finally {
    busy.value = false
  }
}
async function createRequest() {
  await mutate('/api/rooms/' + id(draft.value.roomId) + '/jobs', {
    title: draft.value.title,
    spec: { kind: 'agent', prompt: draft.value.prompt }
  })
  changes.clean()
  dialog.value = false
  await workspace.refresh()
}
async function revise(job: JobSummary) {
  const current = await request(path(job), JobSchema)
  revision.value = { roomId: job.roomId, jobId: job.id, revision: current.currentRevision, instruction: '' }
  revisionChanges.clean()
  revisionDialog.value = true
}
async function saveRevision() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await saveRevisionRequest()
  } finally {
    busy.value = false
  }
}
async function saveRevisionRequest() {
  await mutate('/api/rooms/' + id(revision.value.roomId) + '/jobs/' + id(revision.value.jobId) + '/update', {
    revision: revision.value.revision,
    instruction: revision.value.instruction
  })
  revisionChanges.clean()
  revisionDialog.value = false
  await workspace.refresh()
}
async function showReceipt(job: JobSummary) {
  receipt.value = await request(path(job) + '/delivery', JobDeliveryViewSchema)
  receiptDialog.value = true
}
</script>
<template>
  <v-toolbar color="transparent"
    ><v-toolbar-title>后台任务</v-toolbar-title
    ><v-btn @click="notifications.run(workspace.refresh)">刷新</v-btn
    ><v-btn variant="flat" color="primary" @click="dialog = true">创建后台 Agent</v-btn></v-toolbar
  >
  <v-row
    ><v-col><v-text-field v-model="search" label="搜索任务" /></v-col
    ><v-col
      ><v-select
        v-model="room"
        :items="workspace.snapshot?.rooms ?? []"
        item-title="name"
        item-value="id"
        clearable
        label="渠道"
        @update:model-value="notifications.run(() => loadHistory())"
        aria-label="渠道" /></v-col
  ></v-row>
  <v-card
    ><v-data-table
      :items="rows"
      :search="search"
      show-expand
      :items-per-page="25"
      :headers="[
        { title: '任务', key: 'title' },
        { title: '执行状态', key: 'state' },
        { title: '交付状态', key: 'delivery' },
        { title: '版本', key: 'revision' },
        { title: '操作', key: 'actions' }
      ]"
    >
      <template #item.state="{ item }"
        ><v-chip size="small">{{ jobStateLabel(item.state) }}</v-chip></template
      ><template #item.delivery="{ item }"
        ><v-chip size="small">{{ deliveryLabel(item.delivery) }}</v-chip></template
      >
      <template #item.actions="{ item }"
        ><v-menu
          ><template #activator="{ props }"
            ><v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" aria-label="任务操作" /></template
          ><v-list>
            <v-list-item :to="'/chat/' + item.roomId" title="查看聊天" /><v-list-item
              title="查看交付回执"
              @click="notifications.run(() => showReceipt(item))"
            />
            <v-list-item
              v-if="!jobTerminal(item.state) || item.delivery === 'pending'"
              title="停止此任务"
              @click="notifications.run(() => act(item, 'cancel'))"
            />
            <v-list-item
              v-if="item.kind === 'agent'"
              title="补充 / 修订"
              @click="notifications.run(() => revise(item))"
            />
            <v-list-item
              v-if="item.state === 'outcome_unknown' && item.external?.hasReceipt"
              title="核对远端状态"
              @click="notifications.run(() => act(item, 'reconcile'))"
            />
            <v-list-item
              v-if="item.state === 'outcome_unknown' && item.external?.hasReceipt"
              title="取消远端任务"
              @click="notifications.run(() => act(item, 'reconcile', true))"
            /> </v-list></v-menu
      ></template>
      <template #expanded-row="{ item, columns }"
        ><tr>
          <td :colspan="columns.length" class="pa-4">
            <p>{{ item.id }} · {{ item.parentJobId }}</p>
            <v-alert v-if="item.error || item.deliveryError" type="error" variant="tonal"
              >{{ item.error }} {{ item.deliveryError }}</v-alert
            >
            <pre>{{ item.result?.summary }}</pre>
            <pre>{{ JSON.stringify(item.result?.items, null, 2) }}</pre>
            <pre>{{ JSON.stringify(item.external, null, 2) }}</pre>
            <v-btn
              v-for="artifactId in item.result?.artifactIds"
              :key="artifactId"
              :href="'/api/rooms/' + id(item.roomId) + '/artifacts/' + id(artifactId) + '/content'"
              target="_blank"
              rel="noopener"
              >下载产物</v-btn
            >
          </td>
        </tr></template
      >
    </v-data-table></v-card
  ><v-btn v-if="nextPage !== undefined" class="mt-4" @click="notifications.run(() => loadHistory(true))"
    >加载更早的任务</v-btn
  >
  <v-dialog v-model="dialog" persistent max-width="650"
    ><v-card title="创建后台 Agent"
      ><v-card-text :inert="busy"
        ><v-select
          v-model="draft.roomId"
          :items="workspace.snapshot?.rooms ?? []"
          item-title="name"
          item-value="id"
          label="渠道"
          aria-label="渠道" /><v-text-field v-model="draft.title" label="任务标题" /><v-textarea
          v-model="draft.prompt"
          label="任务说明"
          rows="6" /></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn
          @click="
            changes.discard().then((leave) => {
              if (leave) {
                changes.clean()
                dialog = false
              }
            })
          "
          >取消</v-btn
        ><v-btn variant="flat" color="primary" @click="notifications.run(create)"
          >提交后台任务</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
  <v-dialog v-model="revisionDialog" persistent max-width="650"
    ><v-card title="修订共享任务"
      ><v-card-text :inert="busy"
        ><v-textarea v-model="revision.instruction" label="补充说明" rows="6" /></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn
          @click="
            revisionChanges.discard().then((leave) => {
              if (leave) {
                revisionChanges.clean()
                revisionDialog = false
              }
            })
          "
          >取消</v-btn
        ><v-btn variant="flat" color="primary" @click="notifications.run(saveRevision)"
          >提交新版本</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
  <v-dialog v-model="receiptDialog" max-width="900"
    ><v-card title="平台交付回执"
      ><v-card-text :inert="busy">
        <pre>{{ JSON.stringify(receipt?.delivery, null, 2) }}</pre></v-card-text
      ><v-card-actions><v-spacer /><v-btn @click="receiptDialog = false">关闭</v-btn></v-card-actions></v-card
    ></v-dialog
  >
</template>
