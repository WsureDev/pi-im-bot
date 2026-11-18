<script setup lang="ts">
import { computed, ref, toRaw } from 'vue'
import type { ResourceMethod } from '@core/resource-providers/protocol'
import { ResourceOutputSchema } from '@core/resource-providers/protocol'
import { ConfigValuesSchema } from '@core/plugins/configuration/schema'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
import { request } from '@/api/http'
const props = defineProps<{
  selection: { resourceId: string; protocol: string; method: ResourceMethod }
  revision: string
}>()
defineEmits<{ (event: 'close'): void }>()
const values = ref(structuredClone(toRaw(props.selection.method.example)))
const json = ref(JSON.stringify(values.value, null, 2))
const useJson = ref(Object.keys(props.selection.method.inputUiSchema).length === 0)
const result = ref('')
const error = ref('')
const busy = ref(false)
const metadata = computed(() => {
  return { parameters: { type: 'object', items: props.selection.method.inputUiSchema } }
})
function switchEditor(value: boolean | null) {
  if (value) {
    json.value = JSON.stringify(values.value, null, 2)
  } else {
    try {
      values.value = ConfigValuesSchema.parse(JSON.parse(json.value))
      error.value = ''
    } catch {
      error.value = 'JSON 无效，修正后再切换'
      return
    }
  }
  useJson.value = Boolean(value)
}
async function invoke() {
  error.value = ''
  busy.value = true
  try {
    let parameters = toRaw(values.value)
    if (useJson.value) {
      parameters = ConfigValuesSchema.parse(JSON.parse(json.value))
    }
    const output = await request('/api/resource-providers/invoke', ResourceOutputSchema, {
      method: 'POST',
      data: {
        revision: props.revision,
        resourceId: props.selection.resourceId,
        protocol: props.selection.protocol,
        method: props.selection.method.id,
        parameters
      }
    })
    result.value = JSON.stringify(output, null, 2)
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <v-dialog :model-value="true" max-width="900" scrollable
    ><v-card :title="selection.method.title"
      ><v-card-text>
        <p class="mb-4">{{ selection.method.description }}</p>
        <v-alert v-if="selection.method.effect === 'write'" type="warning" variant="tonal" class="mb-4"
          >此方法会提交或修改后端任务。调用失败不会自动重试。</v-alert
        >
        <v-switch
          v-if="Object.keys(selection.method.inputUiSchema).length"
          :model-value="useJson"
          label="JSON 参数编辑"
          color="primary"
          hide-details
          @update:model-value="switchEditor"
        />
        <v-textarea v-if="useJson" v-model="json" label="参数 JSON" rows="9" spellcheck="false" />
        <AstrBotConfig
          v-else
          :metadata="metadata"
          metadata-key="parameters"
          :iterable="values"
          :disabled="busy"
        />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
        <v-textarea v-if="result" :model-value="result" label="调用结果" readonly rows="12" /> </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn :disabled="busy" @click="$emit('close')">关闭</v-btn
        ><v-btn color="primary" variant="flat" :loading="busy" @click="invoke"
          >调用方法</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
