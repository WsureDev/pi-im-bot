<template>
  <UiDialog :model-value="isOpen" :label="title" @update:model-value="handleCancel" max-width="400">
    <UiCard>
      <div class="pi-card-title text-h3 pa-4 pb-0 pl-6">{{ title }}</div>
      <div class="pi-section">{{ message }}</div>
      <footer class="pi-actions">
        <span class="pi-spacer"></span>
        <UiButton color="gray" variant="text" @click="handleCancel">{{
          t('core.common.dialog.cancelButton')
        }}</UiButton>
        <UiButton color="red" variant="tonal" @click="handleConfirm">{{
          t('core.common.dialog.confirmButton')
        }}</UiButton>
      </footer>
    </UiCard>
  </UiDialog>
</template>

<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiDialog from '@/ui/UiDialog.vue'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from '@/i18n/composables'

const { t } = useI18n()

const isOpen = ref(false)
const title = ref('')
const message = ref('')
interface Confirmation {
  title?: string
  message?: string
}
let resolvePending: ((accepted: boolean) => void) | undefined
function open(options: Confirmation) {
  settle(false)
  title.value = options.title || t('core.common.dialog.confirmTitle')
  message.value = options.message || t('core.common.dialog.confirmMessage')
  isOpen.value = true
  return new Promise<boolean>((resolve) => {
    resolvePending = resolve
  })
}
function settle(accepted: boolean) {
  isOpen.value = false
  resolvePending?.(accepted)
  resolvePending = undefined
}
function handleConfirm() {
  settle(true)
}
function handleCancel() {
  settle(false)
}
onBeforeUnmount(handleCancel)
defineExpose({ open })
</script>
