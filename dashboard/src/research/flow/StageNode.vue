<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import type { StageData } from './layout'
const props = defineProps<{ data: StageData }>()
const { viewport } = useVueFlow()
const compact = computed(() => {
  return viewport.value.zoom < 0.6
})
const categories = {
  entry: '触发',
  hook: '切入点',
  execution: '执行',
  terminal: '终止',
  authorization: '权限'
}
const active = computed(() => {
  return props.data.registrations.filter((item) => {
    return item.effective
  })
})
</script>
<template>
  <div class="stage-node" :class="[data.stage.category, { chosen: data.selected, compact }]">
    <Handle type="target" :position="Position.Left" />
    <div class="stage-kicker">
      <span>{{ categories[data.stage.category] }}</span
      ><span v-if="!data.stage.implemented">方案新增</span
      ><span v-else-if="data.stage.mode">{{ data.stage.mode }}</span>
    </div>
    <strong>{{ data.stage.title }}</strong>
    <div v-if="compact && data.registrations.length" class="compact-count">{{ active.length }} 项生效</div>
    <div v-else-if="data.registrations.length" class="stage-handlers">
      <div v-for="entry in active.slice(0, 2)" :key="entry.id">
        <span>{{ entry.rank }}. {{ entry.title }}</span
        ><b>{{ entry.priority }}</b>
      </div>
      <small>{{ active.length }} 项生效 · 点击查看与调整</small>
    </div>
    <p v-else-if="!compact">{{ data.stage.reads.join(' / ') }}</p>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
<style scoped>
.stage-node {
  width: 222px;
  height: 154px;
  background: rgb(var(--pi-surface));
  color: rgb(var(--pi-on-surface));
  border: 1px solid rgba(var(--pi-on-surface), 0.18);
  border-top: 4px solid rgb(var(--pi-primary));
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 4px 14px #0000000a;
}
.stage-node.chosen {
  outline: 3px solid rgb(var(--pi-primary));
  outline-offset: 3px;
}
.stage-node.authorization {
  border-top-color: rgb(var(--pi-warning));
}
.stage-node.execution {
  border-top-color: rgb(var(--pi-success));
}
.stage-node.terminal {
  border-top-color: rgb(var(--pi-error));
}
.compact strong {
  display: block;
  font-size: 28px;
  line-height: 1.22;
  margin-top: 5px;
}
.compact .stage-kicker {
  font-size: 16px;
}
.compact-count {
  font-size: 17px;
  margin-top: 6px;
  color: rgb(var(--pi-primary));
}
.stage-kicker {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  opacity: 0.65;
  margin-bottom: 7px;
}
strong {
  font-size: 17px;
}
.stage-handlers {
  font-size: 12px;
  margin-top: 9px;
}
.stage-handlers div {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  line-height: 20px;
}
small,
p {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 4px;
}
</style>
