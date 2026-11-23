<script setup lang="ts">
import { computed } from 'vue'
import UiDialog from './UiDialog.vue'
import { useViewport } from './appearance'
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    temporary?: boolean
    location?: 'left' | 'right'
    width?: string | number
  }>(),
  { location: 'left', width: 252 }
)
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
const { mobile } = useViewport()
const label = computed(() => {
  if (props.location === 'right') {
    return '运行记录'
  }
  return '导航'
})
</script>
<template>
  <UiDialog
    v-if="mobile || temporary"
    :model-value="modelValue"
    :side="location"
    :label="label"
    :max-width="props.width"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="pi-drawer-content"><slot /></div>
  </UiDialog>
  <aside v-else-if="modelValue" class="pi-sidebar"><slot /></aside>
</template>
