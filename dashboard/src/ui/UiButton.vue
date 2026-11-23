<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import UiIcon from './UiIcon.vue'
import { computed } from 'vue'
const props = defineProps<{
  icon?: boolean | string
  prependIcon?: string
  color?: string
  variant?: string
  size?: string
  loading?: boolean
  disabled?: boolean
  href?: string
  to?: RouteLocationRaw
  type?: 'button' | 'submit' | 'reset'
}>()
const tag = computed(() => {
  if (!props.disabled && !props.loading) {
    if (props.to) {
      return RouterLink
    }
    if (props.href) {
      return 'a'
    }
  }
  return Button
})
const target = computed(() => {
  if (tag.value === RouterLink) {
    return { to: props.to }
  }
  if (tag.value === 'a') {
    return { href: props.href }
  }
  return { type: props.type ?? 'button', disabled: props.disabled || props.loading }
})
</script>
<template>
  <component
    :is="tag"
    class="pi-btn"
    :class="{ 'icon-only': icon }"
    v-bind="target"
    :aria-busy="loading || undefined"
    :data-tone="color"
    :data-variant="variant"
    :data-size="size"
  >
    <span v-if="loading" class="pi-spinner" aria-label="处理中"></span>
    <UiIcon v-else-if="typeof icon === 'string'" :icon="icon" />
    <UiIcon v-else-if="prependIcon" :icon="prependIcon" />
    <slot />
  </component>
</template>
