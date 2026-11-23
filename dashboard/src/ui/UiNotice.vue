<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
const props = defineProps<{ modelValue: boolean; timeout: number; message?: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', v: boolean): void }>()
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [props.modelValue, props.message, props.timeout],
  () => {
    clearTimeout(timer)
    if (props.modelValue && props.timeout > 0) {
      timer = setTimeout(() => emit('update:modelValue', false), props.timeout)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => clearTimeout(timer))
</script>
<template>
  <aside v-if="modelValue" class="pi-notice" role="status"><slot /><slot name="actions" /></aside>
</template>
