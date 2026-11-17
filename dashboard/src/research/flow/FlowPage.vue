<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import { FlowViewSchema, type FlowView } from '@demo/contracts/flow'
import { request, id } from '@/api/http'
import { useDraft } from '@/composables/drafts'
import { useNotifications } from '@/stores/notifications'
import { useResearch } from '../store'
import { flowLayout } from './layout'
import StageNode from './StageNode.vue'

const research = useResearch()
const notices = useNotifications()
const route = useRoute()
const router = useRouter()
const view = ref<FlowView>()
const draft = ref<Record<string, { priority: number; enabled: boolean }>>({})
const changes = useDraft(draft)
const selected = ref('delivery.text@1')
const busy = ref(false)
const error = ref('')
let initialized = false
const { fitView } = useVueFlow()
const pluginId = computed(() => {
  return String(route.params.pluginId ?? '')
})
const path = computed(() => {
  let suffix = '/flow'
  if (pluginId.value) {
    suffix = '/plugins/' + id(pluginId.value) + suffix
  }
  return '/api/research/presets/' + id(research.presetId) + suffix
})
const graph = computed(() => {
  if (!view.value) {
    return { nodes: [], edges: [] }
  }
  return flowLayout(view.value, selected.value)
})
const stage = computed(() => {
  return view.value?.stages.find((item) => {
    return item.id === selected.value
  })
})
const entries = computed(() => {
  return (
    view.value?.registrations
      .filter((item) => {
        return item.pointId === selected.value
      })
      .sort((a, b) => {
        if (!a.effective) {
          return 1
        }
        if (!b.effective) {
          return -1
        }
        return a.rank - b.rank
      }) ?? []
  )
})
const scopes = computed(() => {
  return [
    { title: '全局 · 编辑所有插件', value: '' },
    ...(research.snapshot?.plugins
      .filter((plugin) => {
        return !plugin.provider
      })
      .map((plugin) => {
        return { title: plugin.name + ' · 仅编辑自身', value: plugin.id }
      }) ?? [])
  ]
})
async function load() {
  view.value = await request(path.value, FlowViewSchema)
  draft.value = Object.fromEntries(
    view.value.registrations.map((entry) => {
      return [entry.id, { priority: entry.priority, enabled: entry.enabled }]
    })
  )
  changes.clean()
}
async function refresh() {
  if (await changes.discard()) {
    await load()
  }
}
async function save() {
  if (!view.value) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    const updates = view.value.registrations
      .filter((entry) => {
        return (
          entry.editable &&
          (entry.priority !== draft.value[entry.id].priority ||
            entry.enabled !== draft.value[entry.id].enabled)
        )
      })
      .map((entry) => {
        return { id: entry.id, ...draft.value[entry.id] }
      })
    if (!updates.length) {
      return
    }
    await request(path.value, FlowViewSchema, {
      method: 'PUT',
      data: { revision: view.value.revision, changes: updates }
    })
    await load()
    await research.refresh()
    notices.show('当前预设的编排已保存，图中顺序已重新计算。')
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
async function focus() {
  await fitView({ nodes: [selected.value], padding: 0.6, duration: 350, maxZoom: 1.2 })
}
async function initialViewport() {
  if (initialized) {
    return
  }
  initialized = true
  await nextTick()
  if (window.innerWidth < 700) {
    await fitView({ nodes: [selected.value], padding: 0.4, maxZoom: 0.85 })
    return
  }
  await fitView({ padding: 0.08 })
}
onMounted(async () => {
  await notices.run(load)
  await nextTick()
})
</script>
<template>
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <div>
      <h1 class="text-h5 font-weight-bold">编排流程</h1>
      <p class="text-medium-emphasis mt-1">从触发到交付，看清每个节点的职责与插件顺序。</p>
    </div>
    <v-spacer /><v-select
      :model-value="pluginId"
      :items="scopes"
      label="编辑范围"
      aria-label="编辑范围"
      hide-details
      class="scope-select"
      @update:model-value="router.push('/orchestration/' + $event)"
    />
  </div>
  <v-alert v-if="pluginId" type="info" variant="tonal" class="mb-4"
    >正在查看
    {{ research.pluginName(pluginId) }}
    的编排。其他插件仍可查看，仅本插件的注册项可编辑；服务器也会检查归属。</v-alert
  >
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
  <v-card class="mb-5 graph-card">
    <div class="d-flex align-center flex-wrap ga-2 px-4 py-2 border-b">
      <v-chip size="small" color="primary">左 → 右</v-chip
      ><span class="text-body-2">拖动画布 / 滚轮缩放 · 点击节点查看详情</span><v-spacer />
      <v-btn size="small" variant="tonal" @click="fitView({ padding: 0.08, duration: 300 })">完整流程</v-btn
      ><v-btn size="small" color="primary" variant="tonal" @click="focus">聚焦所选</v-btn>
    </div>
    <div class="flow-canvas" aria-label="从左到右的插件编排图">
      <VueFlow
        v-if="view"
        :nodes="graph.nodes"
        :edges="graph.edges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :min-zoom="0.08"
        :max-zoom="1.6"
        @nodes-initialized="initialViewport"
        @node-click="selected = $event.node.id"
      >
        <Background :gap="20" pattern-color="#a3a7b5" /><Controls :show-interactive="false" />
        <template #node-stage="node"><StageNode :data="node.data" /></template>
      </VueFlow>
    </div>
    <div class="px-4 py-2 text-caption text-medium-emphasis border-t">
      基于真实切入点声明的结构图；注册项为演示样例。蓝色为插件节点，绿色为执行阶段，橙色为新增权限方案。
    </div>
  </v-card>
  <v-card v-if="stage" class="mb-4">
    <v-card-title class="d-flex flex-wrap align-center ga-2"
      >{{ stage.title }}<v-chip size="small" color="primary">{{ stage.id }}</v-chip
      ><v-spacer /><v-select
        :model-value="selected"
        :items="view?.stages"
        item-title="title"
        item-value="id"
        label="查看节点"
        aria-label="查看节点"
        hide-details
        density="compact"
        style="max-width: 260px"
        @update:model-value="selected = $event"
    /></v-card-title>
    <v-card-text
      ><p class="mb-2">{{ stage.description }}</p>
      <div class="text-medium-emphasis">
        输入：{{ stage.reads.join('、') || '无' }}　·　可写：{{ stage.writes.join('、') || '无' }}
      </div></v-card-text
    >
    <v-table v-if="entries.length" class="flow-table">
      <thead>
        <tr>
          <th>生效顺序</th>
          <th>插件 / 注册项</th>
          <th>依赖约束</th>
          <th>优先级</th>
          <th>启用</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id" :id="'registration-' + entry.id.replace('/', '-')">
          <td>
            <v-chip v-if="entry.effective" color="primary" size="small"># {{ entry.rank }}</v-chip
            ><span v-else class="text-medium-emphasis">未启用</span>
          </td>
          <td>
            <strong>{{ entry.title }}</strong>
            <div class="text-caption text-medium-emphasis">
              {{ research.pluginName(entry.pluginId) }} · {{ entry.id }}
            </div>
            <v-chip v-if="!entry.editable" size="x-small" variant="tonal">只读 · 其他插件</v-chip>
          </td>
          <td>
            <span v-if="entry.after.length">晚于 {{ entry.after.join('、') }}</span
            ><span v-else>无前后依赖</span>
          </td>
          <td>
            <v-text-field
              v-model.number="draft[entry.id].priority"
              type="number"
              :aria-label="entry.title + '优先级'"
              :disabled="!entry.editable || busy"
              :min="-100000"
              :max="100000"
              hide-details
              density="compact"
              style="min-width: 105px; max-width: 140px"
            />
          </td>
          <td>
            <v-switch
              v-model="draft[entry.id].enabled"
              :aria-label="entry.title + '启用'"
              :disabled="!entry.editable || busy"
              hide-details
              color="primary"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-card-text v-else class="text-medium-emphasis"
      >这是框架阶段，没有插件注册项。选择蓝色切入点可查看插件优先级。</v-card-text
    >
    <v-card-text class="text-caption text-medium-emphasis"
      >依赖先于数值优先级；同等条件下数值越大越先执行，数值相同时按注册 ID
      排序。收集/观察节点可并发，顺序表示调度或合并次序；呈现节点选择首个有效结果。</v-card-text
    >
  </v-card>
  <div class="d-flex align-center ga-2">
    <v-chip v-if="changes.dirty.value" color="warning">草稿尚未保存，图中仍为已生效顺序</v-chip
    ><v-spacer /><v-btn variant="text" @click="notices.run(refresh)">刷新</v-btn
    ><v-btn color="primary" variant="flat" :disabled="!changes.dirty.value" :loading="busy" @click="save"
      >保存编排</v-btn
    >
  </div>
</template>
<style scoped>
.scope-select {
  max-width: 320px;
  min-width: 240px;
}
.flow-canvas {
  height: 440px;
  background: rgba(var(--v-theme-primary), 0.025);
}
.flow-table td {
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}
.flow-table :deep(table) {
  min-width: 850px;
}
.flow-table th {
  white-space: nowrap;
}
.graph-card :deep(.vue-flow__controls button) {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border-color: rgba(var(--v-theme-on-surface), 0.15);
}
.graph-card :deep(.vue-flow__controls button svg) {
  fill: currentColor;
}
</style>
