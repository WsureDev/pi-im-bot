<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiNotice from '@/ui/UiNotice.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useViewport } from '@/ui/appearance'
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
const display = useViewport()
const drawer = ref(!display.mobile.value)
watch(display.mobile, (mobile) => {
  drawer.value = !mobile
})
watch(
  () => route.fullPath,
  () => {
    if (display.mobile.value) {
      drawer.value = false
    }
  }
)
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
  <div class="pi-locale">
    <div class="pi-shell" :class="{ 'with-navigation': drawer }">
      <VerticalHeader @toggle-navigation="drawer = !drawer" />
      <VerticalSidebar v-model="drawer" />
      <main class="pi-main">
        <div class="pi-container page-wrapper pa-4 pa-md-6">
          <div v-if="workspace.connectionError" data-tone="error" class="pi-alert mb-4">
            {{ workspace.connectionError
            }}<UiButton variant="text" @click="notifications.run(workspace.refresh)">重试连接</UiButton>
          </div>
          <PreviewBar v-if="researchMode" />
          <RouterView v-if="workspace.snapshot" :key="route.path + research.presetId" />
          <progress class="pi-progress" v-else-if="!workspace.connectionError" aria-label="加载工作台" />
        </div>
      </main>
      <UiNotice :message="notifications.text" v-model="notifications.visible" :timeout="notificationTimeout">
        {{ notifications.text }}
        <template #actions
          ><UiButton variant="text" @click="notifications.visible = false">关闭</UiButton></template
        >
      </UiNotice>
      <UnsavedChangesConfirmDialog ref="unsaved" /><ConfirmDialog ref="confirmation" />
    </div>
  </div>
</template>
