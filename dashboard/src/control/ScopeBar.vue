<script setup lang="ts">
import UiChoice from '@/ui/fields/UiChoice.vue'
import { onMounted } from 'vue'
import { useControl } from './store'
import { useNotifications } from '@/stores/notifications'
const control = useControl()
const notices = useNotifications()
const props = defineProps<{ disabled?: boolean }>()
onMounted(() => {
  if (!control.snapshot) {
    void notices.run(control.refresh)
  }
})
</script>
<template>
  <div class="control-scope mb-5">
    <div>
      <strong>运行中的配置</strong>
      <p class="text-caption text-medium-emphasis mt-1">
        修改应用到所选范围；当前对话若有覆盖，仍遵循原有继承规则。
      </p>
    </div>
    <UiChoice
      :model-value="control.scopeId"
      :items="control.snapshot?.scopes"
      item-title="name"
      item-value="id"
      label="配置范围"
      aria-label="配置范围"
      :disabled="control.loading || props.disabled"
      @update:model-value="notices.run(() => control.selectScope($event))"
    />
  </div>
</template>
<style scoped>
.control-scope {
  display: flex;
  align-items: center;
  gap: 20px;
  justify-content: space-between;
  padding: 16px;
  border: 1px solid rgba(var(--pi-primary), 0.2);
  border-radius: 12px;
  background: rgba(var(--pi-primary), 0.04);
}
.control-scope .pi-field {
  max-width: 300px;
  min-width: 220px;
}
@media (max-width: 650px) {
  .control-scope {
    flex-direction: column;
    align-items: stretch;
  }
  .control-scope .pi-field {
    max-width: 100%;
  }
}
</style>
