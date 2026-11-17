<script setup lang="ts">
import { computed } from 'vue'
import type { RegistryView } from '@demo/contracts/resources'
import { OperationReferenceSchema } from '@demo/contracts/operations'
import { useResearch } from '../store'
import { useNotifications } from '@/stores/notifications'
import { mutate, id } from '@/api/http'
const props = defineProps<{ registry: RegistryView }>()
const emit = defineEmits<{ (event: 'saved'): void }>()
const research = useResearch()
const notices = useNotifications()
const consumers = computed(() => {
  return (
    research.snapshot?.capabilities.filter((item) => {
      return Boolean(item.defaultOperation)
    }) ?? []
  )
})
const choices = computed(() => {
  return [
    { title: '不绑定', value: '' },
    ...props.registry.resources
      .filter((item) => {
        return item.available
      })
      .flatMap((resource) => {
        return resource.operations.map((operation) => {
          return {
            title: resource.name + ' / ' + operation.title,
            value: JSON.stringify({ resourceId: resource.id, operationId: operation.id })
          }
        })
      })
  ]
})
function selected(capabilityId: string) {
  const value = research.preset?.bindings[capabilityId]
  if (!value) {
    return ''
  }
  return JSON.stringify(value)
}
async function save(capabilityId: string, value: string) {
  let operation = null
  if (value) {
    operation = OperationReferenceSchema.parse(JSON.parse(value))
  }
  await mutate(
    '/api/research/presets/' + id(research.presetId) + '/binding',
    { revision: research.preset!.revision, capabilityId, operation },
    'PUT'
  )
  await research.refresh()
  emit('saved')
}
</script>
<template>
  <v-card title="当前预设的入口操作引用" class="mt-5"
    ><v-card-text>
      <p class="text-medium-emphasis mb-4">
        选择具体资源的具体操作。当前触发页验证权限与操作可用性；真实指令的参数映射、结果展示和 MCP
        接入属于后续步骤。
      </p>
      <v-row
        ><v-col v-for="capability in consumers" :key="capability.id" cols="12" md="6"
          ><v-select
            :model-value="selected(capability.id)"
            :items="choices"
            :label="capability.title + '入口绑定'"
            :aria-label="capability.title + '入口绑定'"
            hide-details
            @update:model-value="notices.run(() => save(capability.id, $event))" /></v-col
      ></v-row> </v-card-text
  ></v-card>
</template>
