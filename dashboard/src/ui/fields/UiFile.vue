<script setup lang="ts">
import { ref } from 'vue'
import { FileInput, FileInputTrigger, FileInputDropzone } from '@ui-sdk/vue/file-input'
import UiIcon from '../UiIcon.vue'
defineProps<{
  modelValue?: File[]
  accept?: string
  multiple?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  maxSize?: number
  rejectionMessage?: string
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: File[]): void }>()
const error = ref('')
function pick(files: File[]) {
  error.value = ''
  emit('update:modelValue', files)
}
</script>
<template>
  <FileInput
    :value="modelValue"
    :accept="accept"
    :multiple="multiple"
    :disabled="disabled"
    :max-size="maxSize"
    @update:value="pick"
    @reject="error = rejectionMessage || '文件格式或大小不符合要求'"
  >
    <FileInputDropzone class="pi-file"
      ><FileInputTrigger class="pi-btn" :aria-label="label"
        ><UiIcon icon="mdi-paperclip" />{{ label || '选择文件' }}</FileInputTrigger
      ><span v-for="file in modelValue" :key="file.name">{{ file.name }}</span
      ><small v-if="hint">{{ hint }}</small></FileInputDropzone
    >
    <span v-if="error" class="pi-error" role="alert">{{ error }}</span>
  </FileInput>
</template>
