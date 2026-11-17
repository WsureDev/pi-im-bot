<script setup lang="ts">
import { useTheme } from 'vuetify'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { mutate } from '@/api/http'
const emit = defineEmits<{ (event: 'toggleNavigation'): void }>()
const workspace = useWorkspace()
const notifications = useNotifications()
const theme = useTheme()
function toggleTheme() {
  let name = 'PurpleThemeDark'
  if (theme.global.current.value.dark) {
    name = 'PurpleTheme'
  }
  theme.global.name.value = name
  localStorage.setItem('pi.theme', name)
}
async function reload() {
  await mutate('/api/config/reload')
  await workspace.refresh()
  notifications.show('配置已重载，新任务使用新配置。')
}
</script>
<template>
  <v-app-bar elevation="0" border="b">
    <v-app-bar-nav-icon
      variant="text"
      color="on-surface"
      aria-label="展开或收起导航"
      @click="emit('toggleNavigation')"
    />
    <v-app-bar-title class="font-weight-bold"
      ><v-icon icon="mdi-robot-outline" color="primary" class="mr-2" />Pi IM Bot</v-app-bar-title
    >
    <v-chip v-if="workspace.connected" size="small" color="success" prepend-icon="mdi-check-circle-outline"
      >已连接</v-chip
    >
    <v-chip v-else size="small" color="warning">重新连接中</v-chip>
    <v-btn
      icon="mdi-refresh"
      variant="text"
      color="on-surface"
      aria-label="重载配置"
      @click="notifications.run(reload)"
    />
    <v-btn
      icon="mdi-theme-light-dark"
      variant="text"
      color="on-surface"
      aria-label="切换主题"
      @click="toggleTheme"
    />
  </v-app-bar>
</template>
