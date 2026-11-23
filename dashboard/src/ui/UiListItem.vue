<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import UiIcon from './UiIcon.vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  title?: string
  subtitle?: string
  to?: RouteLocationRaw
  prependIcon?: string
  active?: boolean
  color?: string
}>()
const attrs = useAttrs()
const tag = computed(() => {
  if (props.to) {
    return RouterLink
  }
  if (attrs.onClick) {
    return 'button'
  }
  return 'div'
})
const target = computed(() => {
  if (props.to) {
    return { to: props.to }
  }
  if (tag.value === 'button') {
    return { type: 'button' }
  }
  return {}
})
</script>
<template>
  <component :is="tag" v-bind="{ ...attrs, ...target }" class="pi-list-item" :class="{ 'is-active': active }">
    <slot name="prepend"><UiIcon v-if="prependIcon" :icon="prependIcon" /></slot>
    <span class="pi-list-copy"
      ><strong v-if="title">{{ title }}</strong
      ><small v-if="subtitle">{{ subtitle }}</small
      ><slot /></span
    ><slot name="append" />
  </component>
</template>
