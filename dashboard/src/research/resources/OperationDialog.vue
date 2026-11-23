<script setup lang="ts">
import { TabsTab } from '@ui-sdk/vue/tabs'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiTabs from '@/ui/UiTabs.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, onBeforeUnmount, ref, toRaw } from 'vue'
import type { RegistryView } from '@demo/contracts/resources'
import type { Operation } from '@demo/contracts/operations'
import { InvocationResultSchema, type InvocationResult } from '@demo/contracts/operations'
import { ConfigValuesSchema } from '@core/plugins/configuration/schema'
import { request } from '@/api/http'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
const props = defineProps<{
  instance: RegistryView['resources'][number]
  operation: Operation
  revision: number
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const parameters = ref(structuredClone(toRaw(props.operation.example)))
const json = ref(JSON.stringify(parameters.value, null, 2))
const mode = ref('form')
const busy = ref(false)
const error = ref('')
const result = ref<InvocationResult>()
let controller: AbortController | undefined
const metadata = computed(() => {
  return { operation: { type: 'object', items: props.operation.inputUiSchema } }
})
const contract = computed(() => {
  return JSON.stringify(
    {
      name: props.instance.id + '__' + props.operation.id,
      description: props.operation.description,
      inputSchema: props.operation.inputSchema,
      outputSchema: props.operation.outputSchema
    },
    null,
    2
  )
})
function switchMode(next: string) {
  try {
    if (next === 'json') {
      json.value = JSON.stringify(parameters.value, null, 2)
    } else {
      parameters.value = ConfigValuesSchema.parse(JSON.parse(json.value))
    }
    mode.value = next
    error.value = ''
  } catch {
    error.value = '参数 JSON 必须是有效对象。'
  }
}
async function invoke() {
  error.value = ''
  result.value = undefined
  busy.value = true
  controller = new AbortController()
  try {
    let input = parameters.value
    if (mode.value === 'json') {
      input = ConfigValuesSchema.parse(JSON.parse(json.value))
    }
    result.value = await request('/api/research/operations/invoke', InvocationResultSchema, {
      method: 'POST',
      signal: controller.signal,
      timeout: props.operation.timeoutMs + 5000,
      data: {
        resourceId: props.instance.id,
        operationId: props.operation.id,
        operationVersion: props.operation.version,
        revision: props.revision,
        parameters: input
      }
    })
  } catch (reason) {
    error.value = String(reason)
    if (controller.signal.aborted) {
      error.value = '已停止等待，处理结果未确认；不会自动重试。'
    }
  } finally {
    busy.value = false
  }
}
function close() {
  controller?.abort()
  emit('close')
}
onBeforeUnmount(() => {
  controller?.abort()
})
</script>
<template>
  <UiDialog :model-value="true" persistent max-width="980"
    ><UiCard>
      <div class="pi-card-title d-flex align-center">
        {{ operation.title }}<span class="pi-spacer" /><UiButton
          icon="mdi-close"
          variant="text"
          aria-label="关闭操作测试"
          @click="close"
        />
      </div>
      <p class="pi-subtitle">{{ instance.name }} · {{ operation.id }} · {{ operation.version }}</p>
      <div class="pi-section">
        <div data-tone="info" class="pi-alert mb-4">
          本地演示调用，不经过 LLM。{{ operation.description }}
        </div>
        <div class="d-flex align-center ga-2 mb-4">
          <h3 class="text-subtitle-1">输入参数</h3>
          <span class="pi-spacer" /><UiTabs :model-value="mode" @update:model-value="switchMode"
            ><TabsTab value="form">表单</TabsTab><TabsTab value="json">JSON</TabsTab></UiTabs
          >
        </div>
        <AstrBotConfig
          v-if="mode === 'form'"
          :metadata="metadata"
          metadata-key="operation"
          :iterable="parameters"
          :disabled="busy"
        />
        <UiText
          multiline
          v-else
          v-model="json"
          label="操作参数 JSON"
          aria-label="操作参数 JSON"
          :disabled="busy"
          rows="7"
        />
        <div v-if="error" data-tone="error" class="pi-alert mt-4">{{ error }}</div>
        <UiCard v-if="result" class="mt-4"
          ><div class="pi-card-title">调用结果 · {{ result.status }}</div>
          <div class="pi-section">
            <pre class="operation-json">{{ JSON.stringify(result, null, 2) }}</pre>
          </div></UiCard
        >
        <h3 class="text-subtitle-1 mt-5 mb-2">操作契约</h3>
        <p class="text-caption text-medium-emphasis mb-2">
          输入和输出由 JSON Schema 校验。此描述可供后续 MCP Tool／指令适配器消费；本页不启动 MCP 服务。
        </p>
        <pre class="operation-json">{{ contract }}</pre>
      </div>
      <footer class="pi-actions">
        <UiChip size="small">超时 {{ operation.timeoutMs }} ms</UiChip><span class="pi-spacer" /><UiButton
          v-if="busy"
          @click="controller?.abort()"
          >停止等待</UiButton
        ><UiButton @click="close">关闭</UiButton
        ><UiButton
          color="primary"
          variant="flat"
          :loading="busy"
          :disabled="!instance.available"
          @click="invoke"
          >直接调用</UiButton
        >
      </footer>
    </UiCard></UiDialog
  >
</template>
<style scoped>
.operation-json {
  color: rgb(var(--pi-on-surface));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  background: rgb(var(--pi-background));
  padding: 14px;
  border-radius: 8px;
  max-height: 360px;
  overflow: auto;
}
</style>
