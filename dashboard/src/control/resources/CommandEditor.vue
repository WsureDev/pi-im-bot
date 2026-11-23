<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, ref, toRaw } from 'vue'
import type { z } from 'zod'
import { IndependentRegistrySchema } from '@core/resource-providers/api-schema'
import { ResourceCommandSchema, type ResourceCommand } from '@core/resource-providers/commands/schema'
const props = defineProps<{
  view: z.infer<typeof IndependentRegistrySchema>
  command: ResourceCommand | null
}>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'save', value: ResourceCommand): void }>()
const choices = computed(() => {
  const resources = props.view.instances.flatMap((instance) => {
    const definition = props.view.definitions.find((entry) => {
      return entry.id === instance.provider
    })
    return (definition?.mappings ?? []).map((mapping) => {
      return {
        title: instance.name + ' / ' + mapping.method,
        value: JSON.stringify({
          kind: 'resource',
          resourceId: instance.id,
          protocol: mapping.protocol,
          method: mapping.method
        })
      }
    })
  })
  const tools = props.view.mcp.map((tool) => {
    return {
      title: 'MCP · ' + tool.name + ' / ' + tool.tool,
      value: JSON.stringify({ kind: 'mcp', serverId: tool.serverId, tool: tool.tool })
    }
  })
  return [...resources, ...tools]
})
const form = ref({
  id:
    'cmd_' +
    [...crypto.getRandomValues(new Uint32Array(2))]
      .map((value) => {
        return value.toString(16)
      })
      .join(''),
  name: '',
  description: '',
  enabled: false,
  arguments: 'none',
  textPath: '/text',
  textType: 'string',
  output: 'json'
})
const target = ref('')
const fixed = ref('{}')
const error = ref('')
if (props.command) {
  const command = structuredClone(toRaw(props.command))
  form.value = { ...command }
  target.value = JSON.stringify(command.target)
  fixed.value = JSON.stringify(command.fixed, null, 2)
}
function save() {
  try {
    error.value = ''
    emit(
      'save',
      ResourceCommandSchema.parse({
        ...form.value,
        target: JSON.parse(target.value),
        fixed: JSON.parse(fixed.value)
      })
    )
  } catch (reason) {
    error.value = '指令配置无效：' + String(reason)
  }
}
</script>
<template>
  <UiDialog :model-value="true" max-width="800"
    ><UiCard title="配置直接指令"
      ><div class="pi-section">
        <UiChoice v-model="target" :items="choices" label="目标资源方法或 MCP Tool" />
        <div class="pi-row">
          <UiCol cols="12" md="6"><UiText v-model="form.name" label="指令名称" prefix="/" /></UiCol
          ><UiCol cols="12" md="6"><UiCheck v-model="form.enabled" label="启用指令" /></UiCol>
        </div>
        <UiText v-model="form.description" label="帮助说明" />
        <UiChoice
          v-model="form.arguments"
          :items="[
            { title: '不接受输入', value: 'none' },
            { title: '整段文字', value: 'text' },
            { title: 'JSON 对象', value: 'json' }
          ]"
          label="用户参数"
        />
        <UiText
          v-if="form.arguments === 'text'"
          v-model="form.textPath"
          label="文字写入路径"
          hint="例如 /filters/query、/id 或 /prompt/6/inputs/text；此路径是明确开放给用户的参数"
          class="mb-4"
        />
        <UiChoice
          v-if="form.arguments === 'text'"
          v-model="form.textType"
          :items="[
            { title: '文字', value: 'string' },
            { title: '数值', value: 'number' },
            { title: 'true / false', value: 'boolean' },
            { title: 'JSON 值', value: 'json' }
          ]"
          label="输入值类型"
        />
        <UiText
          multiline
          v-model="fixed"
          label="固定参数 / 工作流图（JSON）"
          hint="JSON 输入无法覆盖这里的固定值；整段文字模式只修改指定路径。"
          rows="8"
          spellcheck="false"
        />
        <UiChoice
          v-model="form.output"
          :items="[
            { title: '文字 / JSON', value: 'json' },
            { title: '发送资源返回的图片', value: 'images' }
          ]"
          label="结果交付"
          class="mt-5"
        />
        <p class="text-caption">
          权限沿用当前范围的能力策略。生成任务返回受理 ID；使用状态、结果指令查询同一个任务。
        </p>
        <div v-if="error" data-tone="error" class="pi-alert mt-3">{{ error }}</div>
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="emit('close')">取消</UiButton
        ><UiButton color="primary" variant="flat" @click="save">保存指令</UiButton>
      </footer></UiCard
    ></UiDialog
  >
</template>
