<script setup lang="ts">
import { MenuItem } from '@ui-sdk/vue/menu'
import { useRouter } from 'vue-router'
const props = defineProps<{ title?: string; value?: string; to?: string }>()
const emit = defineEmits<{ (event: 'choose'): void }>()
const router = useRouter()
function activate() {
  if (props.to) {
    void router.push(props.to)
  } else {
    emit('choose')
  }
}
</script>
<template>
  <MenuItem :value="value || title || ''" class="pi-option" @select="activate"
    ><slot>{{ title }}</slot></MenuItem
  >
</template>
