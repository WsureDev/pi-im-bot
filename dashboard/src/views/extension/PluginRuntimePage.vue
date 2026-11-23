<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiText from '@/ui/fields/UiText.vue'
import { onMounted, ref } from 'vue'
import { PluginEnvironmentSchema, type PluginEnvironment } from '@core/plugins/runtime/contracts'
import { request } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useDraft } from '@/composables/drafts'
const emit = defineEmits<{ (event: 'changed'): void }>()
const state = ref<PluginEnvironment>()
const draft = ref({ image: '', mountCommand: '', enabled: false })
const changes = useDraft(draft)
const notifications = useNotifications()
const busy = ref(false)
async function load() {
  const next = await request('/api/plugins/runtime', PluginEnvironmentSchema)
  state.value = next
  draft.value = { image: next.image, mountCommand: next.mountCommand, enabled: next.enabled }
  changes.clean()
}
async function operate(probe = false) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    let path = '/api/plugins/runtime'
    let method = 'PUT'
    let data: object = { ...draft.value, revision: state.value!.revision }
    if (probe) {
      path += '/probe'
      method = 'POST'
      data = { image: draft.value.image, mountCommand: draft.value.mountCommand }
    }
    state.value = await request(path, PluginEnvironmentSchema, { method, data })
    if (!probe) {
      changes.clean()
      emit('changed')
    }
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <form class="pi-form" @submit.prevent="notifications.run(() => operate())">
    <h2 class="text-h6 mb-4">插件运行环境</h2>
    <UiText v-model="draft.image" label="Worker 镜像" /><UiText
      v-model="draft.mountCommand"
      label="fuse2fs 路径"
      :hint="state?.suggestedMountCommand"
    /><UiCheck v-model="draft.enabled" label="启用运行环境" />
    <div class="pi-list">
      <UiListItem v-for="check in state?.checks" :key="check.id" :title="check.name" :subtitle="check.detail"
        ><template #prepend
          ><UiIcon icon="mdi-check-circle" v-if="check.ready" color="success"></UiIcon
          ><UiIcon icon="mdi-alert-circle" v-else color="warning"></UiIcon></template
      ></UiListItem>
    </div>
    <UiButton :loading="busy" class="mr-3" @click="notifications.run(() => operate(true))">检测环境</UiButton
    ><UiButton variant="flat" :loading="busy" type="submit" color="primary">保存运行环境</UiButton>
  </form>
</template>
