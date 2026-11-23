<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import WorkspaceSearch from '../WorkspaceSearch.vue'
import UiChip from '@/ui/UiChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { useAppearance } from '@/ui/appearance'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { mutate } from '@/api/http'
const emit = defineEmits<{ (event: 'toggleNavigation'): void }>()
const workspace = useWorkspace()
const notifications = useNotifications()
const theme = useAppearance()
async function reload() {
  await mutate('/api/config/reload')
  await workspace.refresh()
  notifications.show('配置已重载，新任务使用新配置。')
}
</script>
<template>
  <header class="pi-topbar">
    <UiButton
      class="icon-only"
      icon="mdi-menu"
      variant="text"
      color="on-surface"
      aria-label="展开或收起导航"
      @click="emit('toggleNavigation')"
    />
    <div class="pi-brand font-weight-bold">
      <UiIcon icon="mdi-robot-outline" color="primary" class="mr-2" />Pi IM Bot
    </div>
    <WorkspaceSearch />
    <UiChip v-if="workspace.connected" size="small" color="success" prepend-icon="mdi-check-circle-outline"
      >已连接</UiChip
    >
    <UiChip v-else size="small" color="warning">重新连接中</UiChip>
    <UiButton
      icon="mdi-refresh"
      variant="text"
      color="on-surface"
      aria-label="重载配置"
      @click="notifications.run(reload)"
    />
    <UiButton
      icon="mdi-theme-light-dark"
      variant="text"
      color="on-surface"
      aria-label="切换主题"
      @click="theme.toggle"
    />
  </header>
</template>
