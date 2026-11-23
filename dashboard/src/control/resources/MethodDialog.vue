<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiText from '@/ui/fields/UiText.vue'
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
  <UiDialog :model-value="true" max-width="900"
    ><UiCard :title="selection.method.title"
      ><div class="pi-section">
        <p class="mb-4">{{ selection.method.description }}</p>
        <div v-if="selection.method.effect === 'write'" data-tone="warning" class="pi-alert mb-4">
          此方法会提交或修改后端任务。调用失败不会自动重试。
        </div>
        <UiCheck
          v-if="Object.keys(selection.method.inputUiSchema).length"
          :model-value="useJson"
          label="JSON 参数编辑"
          @update:model-value="switchEditor"
        />
        <UiText multiline v-if="useJson" v-model="json" label="参数 JSON" rows="9" spellcheck="false" />
        <AstrBotConfig
          v-else
          :metadata="metadata"
          metadata-key="parameters"
          :iterable="values"
          :disabled="busy"
        />
        <div v-if="error" data-tone="error" class="pi-alert mb-3">{{ error }}</div>
        <UiText multiline v-if="result" :model-value="result" label="调用结果" readonly rows="12" />
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton :disabled="busy" @click="$emit('close')">关闭</UiButton
        ><UiButton color="primary" variant="flat" :loading="busy" @click="invoke">调用方法</UiButton>
      </footer></UiCard
    ></UiDialog
  >
</template>
