<script setup lang="ts">
import { Menu, MenuTrigger, MenuContent } from '@ui-sdk/vue/menu'
import UiIcon from './UiIcon.vue'
defineProps<{ label: string; icon?: string; showLabel?: boolean }>()
</script>
<template>
  <Menu
    ><MenuTrigger class="pi-btn" :aria-label="label" :class="{ 'icon-only': !showLabel }">
      <UiIcon :icon="icon || 'mdi-dots-vertical'" /><span v-if="showLabel">{{ label }}</span> </MenuTrigger
    ><MenuContent class="pi-menu-content"><slot /></MenuContent
  ></Menu>
</template>
