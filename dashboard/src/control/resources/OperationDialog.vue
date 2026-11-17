<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw } from 'vue'
import type { ResourceRegistryView as RegistryView } from '@core/resource-providers/contracts'
import type { ResourceOperationView as Operation } from '@core/resource-providers/contracts'
import { useWorkspace } from '@/stores/workspace'
import {
  ResourceResultSchema as InvocationResultSchema,
  type ResourceResult
} from '@core/resource-providers/contracts'
type InvocationResult = ResourceResult
import { ConfigValuesSchema } from '@core/plugins/configuration/schema'
import { request } from '@/api/http'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
const props = defineProps<{
  instance: RegistryView['resources'][number]
  operation: Operation
  revision: string
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const parameters = ref(structuredClone(toRaw(props.operation.example)))
const json = ref(JSON.stringify(parameters.value, null, 2))
let initialMode = 'form'
if (Object.keys(props.operation.inputUiSchema).length === 0) {
  initialMode = 'json'
}
const mode = ref(initialMode)
const workspace = useWorkspace()
const roomId = ref('')
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
    result.value = await request('/api/control/operations/invoke', InvocationResultSchema, {
      method: 'POST',
      signal: controller.signal,
      timeout: props.operation.timeoutMs + 5000,
      data: {
        roomId: roomId.value,
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
  <v-dialog :model-value="true" persistent scrollable max-width="980"
    ><v-card>
      <v-card-title class="d-flex align-center"
        >{{ operation.title }}<v-spacer /><v-btn
          icon="mdi-close"
          variant="text"
          aria-label="关闭操作测试"
          @click="close"
      /></v-card-title>
      <v-card-subtitle>{{ instance.name }} · {{ operation.id }} · {{ operation.version }}</v-card-subtitle>
      <v-card-text>
        <v-alert type="info" variant="tonal" class="mb-4"
          >真实调用，不经过 LLM。{{ operation.description }}</v-alert
        >
        <v-select
          v-model="roomId"
          :items="workspace.snapshot?.rooms"
          item-title="name"
          item-value="id"
          label="调用范围"
          aria-label="调用范围"
          hint="用于授权与产物归属；后台操作会创建任务并在该范围交付。"
          persistent-hint
          class="mb-4"
        />
        <div class="d-flex align-center ga-2 mb-4">
          <h3 class="text-subtitle-1">输入参数</h3>
          <v-spacer /><v-btn-toggle
            :model-value="mode"
            mandatory
            color="primary"
            density="compact"
            @update:model-value="switchMode"
            ><v-btn value="form">表单</v-btn><v-btn value="json">JSON</v-btn></v-btn-toggle
          >
        </div>
        <AstrBotConfig
          v-if="mode === 'form'"
          :metadata="metadata"
          metadata-key="operation"
          :iterable="parameters"
          :disabled="busy"
        />
        <v-textarea
          v-else
          v-model="json"
          label="操作参数 JSON"
          aria-label="操作参数 JSON"
          :disabled="busy"
          rows="7"
        />
        <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
        <v-card v-if="result" class="mt-4"
          ><v-card-title>调用结果 · {{ result.status }}</v-card-title
          ><v-card-text>
            <pre class="operation-json">{{ JSON.stringify(result, null, 2) }}</pre>
          </v-card-text></v-card
        >
        <h3 class="text-subtitle-1 mt-5 mb-2">操作契约</h3>
        <p class="text-caption text-medium-emphasis mb-2">
          调用交由插件隔离执行器；输入输出遵循插件声明，结果与产物受所选聊天范围约束。
        </p>
        <pre class="operation-json">{{ contract }}</pre>
      </v-card-text>
      <v-card-actions
        ><v-chip size="small">超时 {{ operation.timeoutMs }} ms</v-chip><v-spacer /><v-btn
          v-if="busy"
          @click="controller?.abort()"
          >停止等待</v-btn
        ><v-btn @click="close">关闭</v-btn
        ><v-btn
          color="primary"
          variant="flat"
          :loading="busy"
          :disabled="!instance.available || !roomId"
          @click="invoke"
          >执行操作</v-btn
        ></v-card-actions
      >
    </v-card></v-dialog
  >
</template>
<style scoped>
.operation-json {
  color: rgb(var(--v-theme-on-surface));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  background: rgb(var(--v-theme-background));
  padding: 14px;
  border-radius: 8px;
  max-height: 360px;
  overflow: auto;
}
</style>
