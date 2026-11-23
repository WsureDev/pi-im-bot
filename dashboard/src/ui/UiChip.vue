<script setup lang="ts">
import UiIcon from './UiIcon.vue'
defineProps<{ color?: string; size?: string; prependIcon?: string; closable?: boolean }>()
const emit = defineEmits<{ (event: 'click:close'): void }>()
</script>
<template>
  <span class="pi-chip" :data-tone="color" :data-size="size"
    ><UiIcon v-if="prependIcon" :icon="prependIcon" /><slot /><button
      v-if="closable"
      type="button"
      aria-label="移除此项"
      @click.stop="emit('click:close')"
    >
      ×
    </button></span
  >
</template>
