<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useDisplay } from 'vuetify'
import { RouterView, useRoute } from 'vue-router'
import VerticalSidebar from './vertical-sidebar/VerticalSidebar.vue'
import VerticalHeader from './vertical-header/VerticalHeader.vue'
import UnsavedChangesConfirmDialog from '@/components/config/UnsavedChangesConfirmDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { setDiscardConfirmation } from '@/composables/drafts'
import { bindConfirmation } from '@/utils/confirm'
import { researchMode } from '@/research/mode'
import { useResearch } from '@/research/store'
import PreviewBar from '@/research/PreviewBar.vue'

interface DialogHandle {
  open(options: {
    title: string
    message: string
    confirmHint?: string
    cancelHint?: string
  }): Promise<boolean | 'close'>
}
const workspace = useWorkspace()
const research = useResearch()
const route = useRoute()
const notifications = useNotifications()
const notificationTimeout = computed(() => {
  if (notifications.error) {
    return -1
  }
  return 8000
})
const display = useDisplay()
const drawer = ref(!display.mobile.value)
watch(display.mobile, (mobile) => {
  if (mobile) {
    drawer.value = false
  }
})
const unsaved = ref<DialogHandle>()
const confirmation = ref<DialogHandle>()
onMounted(() => {
  setDiscardConfirmation(async () => {
    return (
      (await unsaved.value?.open({
        title: '有未保存的修改',
        message: '离开会放弃当前草稿。是否继续？',
        confirmHint: '确认：放弃草稿',
        cancelHint: '取消：继续编辑'
      })) === true
    )
  })
  bindConfirmation(async (options) => {
    return (await confirmation.value?.open(options)) === true
  })
  void notifications.run(workspace.refresh)
  workspace.connect()
})
onBeforeUnmount(workspace.disconnect)
</script>

<template>
  <v-locale-provider
    ><v-app>
      <VerticalHeader @toggle-navigation="drawer = !drawer" />
      <VerticalSidebar v-model="drawer" />
      <v-main
        ><v-container fluid class="page-wrapper pa-4 pa-md-6">
          <v-alert v-if="workspace.connectionError" type="error" variant="tonal" class="mb-4"
            >{{ workspace.connectionError
            }}<v-btn variant="text" @click="notifications.run(workspace.refresh)">重试连接</v-btn></v-alert
          >
          <PreviewBar v-if="researchMode" />
          <RouterView v-if="workspace.snapshot" :key="route.path + research.presetId" />
          <v-progress-linear
            v-else-if="!workspace.connectionError"
            indeterminate
            aria-label="加载工作台"
          /> </v-container
      ></v-main>
      <v-snackbar v-model="notifications.visible" :timeout="notificationTimeout" multi-line>
        {{ notifications.text }}
        <template #actions
          ><v-btn variant="text" @click="notifications.visible = false">关闭</v-btn></template
        >
      </v-snackbar>
      <UnsavedChangesConfirmDialog ref="unsaved" /><ConfirmDialog ref="confirmation" /> </v-app
  ></v-locale-provider>
</template>
