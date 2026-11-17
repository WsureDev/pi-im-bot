<script setup lang="ts">
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
  <v-form @submit.prevent="notifications.run(() => operate())">
    <h2 class="text-h6 mb-4">插件运行环境</h2>
    <v-text-field v-model="draft.image" label="Worker 镜像" /><v-text-field
      v-model="draft.mountCommand"
      label="fuse2fs 路径"
      :hint="state?.suggestedMountCommand"
      persistent-hint
    /><v-switch v-model="draft.enabled" label="启用运行环境" />
    <v-list
      ><v-list-item
        v-for="check in state?.checks"
        :key="check.id"
        :title="check.name"
        :subtitle="check.detail"
        ><template #prepend
          ><v-icon v-if="check.ready" color="success">mdi-check-circle</v-icon
          ><v-icon v-else color="warning">mdi-alert-circle</v-icon></template
        ></v-list-item
      ></v-list
    >
    <v-btn :loading="busy" class="mr-3" @click="notifications.run(() => operate(true))">检测环境</v-btn
    ><v-btn variant="flat" :loading="busy" type="submit" color="primary">保存运行环境</v-btn>
  </v-form>
</template>
