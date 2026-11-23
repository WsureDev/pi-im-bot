<script setup lang="ts">
import { Tabs, TabsList } from '@ui-sdk/vue/tabs'
defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>
<template>
  <Tabs :value="modelValue" @value-change="emit('update:modelValue', String($event))"
    ><TabsList class="pi-tabs" aria-label="页面分区"><slot /></TabsList
  ></Tabs>
</template>
