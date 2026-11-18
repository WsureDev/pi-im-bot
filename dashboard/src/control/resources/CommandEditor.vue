<script setup lang="ts">
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
  <v-dialog :model-value="true" max-width="800" scrollable
    ><v-card title="配置直接指令"
      ><v-card-text>
        <v-select v-model="target" :items="choices" label="目标资源方法或 MCP Tool" />
        <v-row
          ><v-col cols="12" md="6"><v-text-field v-model="form.name" label="指令名称" prefix="/" /></v-col
          ><v-col cols="12" md="6"><v-switch v-model="form.enabled" color="primary" label="启用指令" /></v-col
        ></v-row>
        <v-text-field v-model="form.description" label="帮助说明" />
        <v-select
          v-model="form.arguments"
          :items="[
            { title: '不接受输入', value: 'none' },
            { title: '整段文字', value: 'text' },
            { title: 'JSON 对象', value: 'json' }
          ]"
          label="用户参数"
        />
        <v-text-field
          v-if="form.arguments === 'text'"
          v-model="form.textPath"
          label="文字写入路径"
          hint="例如 /filters/query、/id 或 /prompt/6/inputs/text；此路径是明确开放给用户的参数"
          persistent-hint
          class="mb-4"
        />
        <v-select
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
        <v-textarea
          v-model="fixed"
          label="固定参数 / 工作流图（JSON）"
          hint="JSON 输入无法覆盖这里的固定值；整段文字模式只修改指定路径。"
          persistent-hint
          rows="8"
          spellcheck="false"
        />
        <v-select
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
        <v-alert v-if="error" type="error" variant="tonal" class="mt-3">{{ error }}</v-alert> </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="emit('close')">取消</v-btn
        ><v-btn color="primary" variant="flat" @click="save">保存指令</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
