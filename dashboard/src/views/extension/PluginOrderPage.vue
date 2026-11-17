<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { z } from 'zod'
import { PluginConfigViewSchema, type PluginConfigTarget } from '@core/plugins/configuration/contracts'
import { PluginOrderViewSchema } from '@core/plugins/configuration/order-contracts'
import { request, id } from '@/api/http'
import { useDraft } from '@/composables/drafts'
import { useNotifications } from '@/stores/notifications'

const props = defineProps<{ pluginId: string }>()
const notifications = useNotifications()
const state = ref<z.infer<typeof PluginOrderViewSchema>>()
const targets = ref<z.infer<typeof PluginConfigViewSchema>['targets']>([])
const draft = ref({ selected: true, changes: [] as { key: string; priority: number; disabled: boolean }[] })
const changes = useDraft(draft)
const target = computed(() => {
  return JSON.stringify(state.value?.target ?? { level: 'instance' })
})
async function load(selected: PluginConfigTarget = { level: 'instance' }) {
  if (!(await changes.discard())) {
    return
  }
  const query = new URLSearchParams(selected)
  const [configuration, order] = await Promise.all([
    request('/api/plugins/' + id(props.pluginId) + '/configuration?' + query, PluginConfigViewSchema),
    request('/api/plugins/' + id(props.pluginId) + '/order?' + query, PluginOrderViewSchema)
  ])
  targets.value = configuration.targets
  state.value = order
  draft.value = {
    selected: order.selected,
    changes: order.handlers.map((handler) => {
      return { key: handler.key, priority: handler.priority, disabled: handler.disabled }
    })
  }
  changes.clean()
}
async function selectTarget(value: string) {
  const selected = targets.value.find((entry) => {
    return JSON.stringify(entry.target) === value
  })
  if (selected) {
    await load(selected.target)
  }
}
async function save(reset = false) {
  if (!state.value) {
    return
  }
  const current = state.value
  let updates = draft.value.changes
  let selected: boolean | undefined = draft.value.selected
  if (reset) {
    updates = []
    selected = undefined
  }
  state.value = await request('/api/plugins/' + id(props.pluginId) + '/order', PluginOrderViewSchema, {
    method: 'PUT',
    data: {
      revision: current.revision,
      release: current.release,
      target: current.target,
      changes: updates,
      selected,
      reset
    }
  })
  changes.clean()
  await load(current.target)
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <v-select
    :model-value="target"
    @update:model-value="notifications.run(() => selectTarget($event))"
    :items="targets.map((entry) => ({ title: entry.name, value: JSON.stringify(entry.target) }))"
    label="选择应用范围"
    aria-label="选择应用范围"
  />
  <v-switch v-model="draft.selected" label="在此范围选择插件" />
  <v-alert v-if="state?.error" type="error" variant="tonal">{{ state.error }}</v-alert>
  <v-data-table
    :items="draft.changes"
    :headers="[
      { title: '处理器', key: 'key' },
      { title: '优先级', key: 'priority' },
      { title: '禁用', key: 'disabled' }
    ]"
    :items-per-page="25"
  >
    <template #item.priority="{ item }"
      ><v-text-field
        v-model.number="item.priority"
        type="number"
        min="-100000"
        max="100000"
        hide-details
        label="优先级"
    /></template>
    <template #item.disabled="{ item }"
      ><v-switch v-model="item.disabled" hide-details label="禁用"
    /></template>
  </v-data-table>
  <v-expansion-panels class="my-4"
    ><v-expansion-panel title="生效顺序与依赖"
      ><v-expansion-panel-text>
        <pre>{{ JSON.stringify({ handlers: state?.handlers, order: state?.order }, null, 2) }}</pre>
      </v-expansion-panel-text></v-expansion-panel
    ></v-expansion-panels
  >
  <v-btn class="mr-3" @click="notifications.run(() => save(true))">恢复顺序继承</v-btn
  ><v-btn variant="flat" color="primary" @click="notifications.run(() => save())">保存范围与顺序</v-btn>
</template>
