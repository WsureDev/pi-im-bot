<script setup lang="ts">
import { DialogTitle } from '@ui-sdk/vue/dialog'
import { inject, computed } from 'vue'
import { dialogHeading } from './layer'
const props = defineProps<{ title?: string; subtitle?: string; variant?: string; height?: string | number }>()
const modal = inject(dialogHeading, false)
const headingTag = computed(() => {
  if (modal) {
    return DialogTitle
  }
  return 'h2'
})
const height = computed(() => {
  if (typeof props.height === 'number') {
    return props.height + 'px'
  }
  return props.height
})
</script>
<template>
  <section class="pi-card" :data-variant="variant" :style="{ height }">
    <header v-if="title || subtitle" class="pi-card-header">
      <component :is="headingTag" v-if="title">{{ title }}</component>
      <p v-if="subtitle">{{ subtitle }}</p>
    </header>
    <slot />
  </section>
</template>
