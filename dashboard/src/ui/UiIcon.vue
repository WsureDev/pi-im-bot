<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ icon: string; size?: string | number; color?: string }>()
const fontSize = computed(() => {
  if (props.size === 'small') {
    return '1rem'
  }
  if (props.size === 'x-small') {
    return '.8rem'
  }
  if (props.size && Number.isFinite(Number(props.size))) {
    return props.size + 'px'
  }
  return undefined
})
</script>
<template>
  <span class="pi-icon mdi" :class="icon" :data-tone="color" :style="{ fontSize }" aria-hidden="true"></span>
</template>
