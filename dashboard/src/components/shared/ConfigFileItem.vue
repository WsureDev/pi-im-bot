<script setup lang="ts">
import UiChip from '@/ui/UiChip.vue'
import UiFile from '@/ui/fields/UiFile.vue'
import { computed, inject, ref, watch } from 'vue'
import { z } from 'zod'
import { PluginConfigIdKey } from '@/api/plugin-configuration'

const props = defineProps<{ modelValue: unknown; field: string; fileTypes?: string[] }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>()
const pluginId = inject(PluginConfigIdKey)
const values = computed(() => z.array(z.string()).catch([]).parse(props.modelValue))
const busy = ref(false)
const error = ref('')
const picker = ref<File[]>([])
const names = ref<Record<string, string>>({})
function fileUrl(token: string) {
  return (
    '/api/plugins/' +
    encodeURIComponent(pluginId?.() ?? '') +
    '/configuration/files/' +
    encodeURIComponent(token)
  )
}
watch(
  values,
  async (items) => {
    if (!pluginId) {
      return
    }
    await Promise.all(
      items.map(async (token) => {
        if (names.value[token]) {
          return
        }
        try {
          const response = await fetch(fileUrl(token) + '/name')
          if (response.ok) {
            names.value[token] = z.object({ name: z.string() }).parse(await response.json()).name
          }
        } catch {
          /* Keep the file usable when its display name cannot be loaded. */
        }
      })
    )
  },
  { immediate: true }
)
const accept = computed(() => (props.fileTypes ?? ['png', 'jpg', 'jpeg']).map((type) => '.' + type).join(','))
async function upload(input: File | File[]) {
  const files = [input].flat()
  if (!pluginId || !files.length) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    const next = [...values.value]
    for (const file of files) {
      const form = new FormData()
      form.set('field', props.field)
      form.set('file', file)
      const response = await fetch(
        '/api/plugins/' + encodeURIComponent(pluginId()) + '/configuration/files',
        { method: 'POST', body: form }
      )
      if (!response.ok) {
        throw new Error('图片上传失败：HTTP ' + response.status)
      }
      const result = z.object({ token: z.string() }).parse(await response.json())
      if (!next.includes(result.token)) {
        next.push(result.token)
      }
    }
    emit('update:modelValue', next)
    picker.value = []
  } catch (cause) {
    error.value = String(cause)
  } finally {
    busy.value = false
  }
}
function remove(value: string) {
  emit(
    'update:modelValue',
    values.value.filter((item) => item !== value)
  )
}
</script>

<template>
  <div>
    <UiFile
      rejection-message="请选择允许格式且不超过 5 MiB 的图片"
      :max-size="5 * 1024 * 1024"
      v-model="picker"
      :accept="accept"
      multiple
      :disabled="busy"
      label="选择背景图片"
      hint="PNG / JPEG，每张不超过 5 MiB；上传后点击页面保存"
      @update:model-value="upload"
    />
    <UiChip v-for="value in values" :key="value" closable class="ma-1" @click:close="remove(value)"
      ><a :href="fileUrl(value)" target="_blank" rel="noopener noreferrer">{{
        names[value] || '背景图片'
      }}</a></UiChip
    >
    <div class="pi-alert" v-if="error" data-tone="error">{{ error }}</div>
  </div>
</template>
