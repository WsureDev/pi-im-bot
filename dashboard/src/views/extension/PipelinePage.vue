<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { z } from 'zod'
import { PipelineViewSchema } from '@core/plugins/pipeline/contracts'
import { request } from '@/api/http'
import { useDraft } from '@/composables/drafts'
import { useNotifications } from '@/stores/notifications'
const props = defineProps<{ pluginId?: string }>()
const state = ref<z.infer<typeof PipelineViewSchema>>()
const edits = ref<Record<string, { key: string; priority: number; disabled: boolean }>>({})
const changes = useDraft(edits)
const notifications = useNotifications()
function availabilityHint(available: boolean) {
  if (available) {
    return ''
  }
  return '插件不可用或未选择'
}
const nodes = computed(() => {
  return (
    state.value?.nodes.filter((node) => {
      return (
        !props.pluginId ||
        node.handlers.some((handler) => {
          return handler.pluginId === props.pluginId
        })
      )
    }) ?? []
  )
})
async function load() {
  state.value = await request('/api/plugins/pipeline', PipelineViewSchema)
}
function change(key: string, priority: number, enabled: boolean) {
  edits.value[key] = { key, priority, disabled: !enabled }
}
async function save() {
  state.value = await request('/api/plugins/pipeline', PipelineViewSchema, {
    method: 'PUT',
    data: { revision: state.value!.revision, changes: Object.values(edits.value) }
  })
  edits.value = {}
  changes.clean()
  notifications.show('编排已保存。')
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <v-alert v-if="!nodes.length" type="info" variant="tonal"
    >此插件通过指令或工具调用，不参与自动流程。</v-alert
  >
  <div class="pipeline-groups">
    <v-card v-for="node in nodes" :key="node.id" :title="node.title" :subtitle="node.summary" class="mb-4"
      ><v-card-text>
        <p class="mb-4">{{ node.flow }}</p>
        <v-row
          v-for="handler in node.handlers.filter((entry) => !pluginId || entry.pluginId === pluginId)"
          :key="handler.key"
        >
          <v-col cols="12" md="6"
            ><v-switch
              :model-value="!(edits[handler.key]?.disabled ?? !handler.enabled)"
              @update:model-value="
                change(handler.key, edits[handler.key]?.priority ?? handler.priority, Boolean($event))
              "
              :label="handler.pluginName + ' · ' + handler.key"
              :hint="availabilityHint(handler.available)"
              persistent-hint
          /></v-col>
          <v-col cols="12" md="6"
            ><v-text-field
              :model-value="edits[handler.key]?.priority ?? handler.priority"
              @update:model-value="
                change(handler.key, Number($event), !(edits[handler.key]?.disabled ?? !handler.enabled))
              "
              type="number"
              label="优先级"
              min="-100000"
              max="100000"
          /></v-col>
        </v-row>
        <v-expansion-panels
          ><v-expansion-panel title="数据契约"
            ><v-expansion-panel-text
              ><p>可修改字段：{{ node.writable.join('、') }}</p>
              <pre>{{ JSON.stringify({ input: node.input, output: node.output }, null, 2) }}</pre>
            </v-expansion-panel-text></v-expansion-panel
          ></v-expansion-panels
        >
      </v-card-text></v-card
    >
  </div>
  <v-btn
    variant="flat"
    class="mt-4"
    color="primary"
    :disabled="!changes.dirty.value"
    @click="notifications.run(save)"
    >保存编排</v-btn
  >
</template>
