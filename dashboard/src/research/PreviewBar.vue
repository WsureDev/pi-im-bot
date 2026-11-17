<script setup lang="ts">
import { onMounted } from 'vue'
import { useResearch } from './store'
import { useNotifications } from '@/stores/notifications'
const research = useResearch()
const notices = useNotifications()
onMounted(() => {
  void notices.run(research.refresh)
})
</script>
<template>
  <div class="research-bar mb-5">
    <div>
      <v-chip color="primary" size="small" variant="flat" class="mr-2">研究预览</v-chip
      ><strong>插件编排与资源规范</strong>
      <p class="text-medium-emphasis mt-2">独立演示数据 · 发现与执行均为模拟 · 更改仅保存到此预览</p>
    </div>
    <v-select
      :model-value="research.presetId"
      :items="research.snapshot?.presets"
      item-title="name"
      item-value="id"
      label="当前配置预设"
      aria-label="当前配置预设"
      hide-details
      density="compact"
      class="research-preset"
      :disabled="!research.snapshot"
      @update:model-value="notices.run(() => research.selectPreset($event))"
    />
  </div>
</template>
<style scoped>
.research-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 14px;
  background: rgba(var(--v-theme-primary), 0.04);
}
.research-preset {
  max-width: 260px;
  min-width: 210px;
}
@media (max-width: 650px) {
  .research-bar {
    align-items: stretch;
    flex-direction: column;
  }
  .research-preset {
    max-width: 100%;
  }
}
</style>
