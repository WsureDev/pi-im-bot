<script setup lang="ts">
import { Dialog, DialogContent } from '@ui-sdk/vue/dialog'
import { computed, provide } from 'vue'
import { dialogHeading } from './layer'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue: boolean
  maxWidth?: string | number
  persistent?: boolean
  fullscreen?: boolean
  side?: 'left' | 'right'
  label?: string
}>()
const emit = defineEmits<{ (event: 'update:modelValue', open: boolean): void }>()
provide(dialogHeading, true)
function change(open: boolean) {
  emit('update:modelValue', open)
}
const size = computed(() => {
  const width = props.maxWidth ?? 620
  if (typeof width === 'number' || /^\d+(?:\.\d+)?$/.test(width)) {
    return width + 'px'
  }
  return width
})
</script>
<template>
  <Dialog :open="modelValue" :dismissible="!persistent" @update:open="change">
    <DialogContent
      v-bind="$attrs"
      class="pi-dialog"
      :class="{ 'is-fullscreen': fullscreen }"
      :data-side="side"
      :aria-label="label || '对话框'"
      :style="{ '--dialog-width': size }"
    >
      <slot />
    </DialogContent>
  </Dialog>
</template>
