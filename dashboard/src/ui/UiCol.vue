<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  cols?: string | number
  sm?: string | number
  md?: string | number
  lg?: string | number
}>()
function flex(value?: number | string) {
  if (value === 'auto') {
    return '0 0 auto'
  }
  if (!value) {
    return undefined
  }
  return '0 1 calc(' + Number(value) + ' * 100% / 12)'
}
const dimensions = computed(() => ({
  '--col': flex(props.cols),
  '--col-sm': flex(props.sm),
  '--col-md': flex(props.md),
  '--col-lg': flex(props.lg)
}))
</script>
<template>
  <div class="pi-col" :style="dimensions"><slot /></div>
</template>
