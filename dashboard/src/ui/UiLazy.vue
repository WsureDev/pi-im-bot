<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{ minHeight?: string | number; options?: IntersectionObserverInit }>()
const host = ref<HTMLElement>()
const visible = ref(false)
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (!host.value) {
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      visible.value = true
      observer?.disconnect()
    }
  }, props.options)
  observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div ref="host" :style="{ minHeight: Number(minHeight || 0) + 'px' }"><slot v-if="visible" /></div>
</template>
