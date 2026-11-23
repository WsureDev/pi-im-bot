<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import { computed, onMounted, ref } from 'vue'
import { RegistryViewSchema, type RegistryView } from '@demo/contracts/resources'
import type { Operation } from '@demo/contracts/operations'
import { request, id } from '@/api/http'
import { useResearch } from '../store'
import { useNotifications } from '@/stores/notifications'
import ResourceConfigurationDialog from './ResourceConfigurationDialog.vue'
import OperationDialog from './OperationDialog.vue'
import OperationBindings from './OperationBindings.vue'
const research = useResearch()
const notices = useNotifications()
const view = ref<RegistryView>()
const filter = ref('all')
const busy = ref(false)
const config = ref<{ subject: 'provider' | 'resource'; id: string }>()
const inspecting = ref<{ resource: RegistryView['resources'][number]; operation: Operation }>()
const resources = computed(() => {
  return (
    view.value?.resources.filter((item) => {
      return filter.value === 'all' || item.providerId === filter.value
    }) ?? []
  )
})
function resourceState(resource: RegistryView['resources'][number]) {
  if (resource.state === 'stale') {
    return '发现结果已失效'
  }
  if (!resource.enabled) {
    return '已停用'
  }
  if (!resource.available) {
    return '提供者已注销'
  }
  return '可用'
}
function resourceColor(resource: RegistryView['resources'][number]) {
  if (resource.available) {
    return 'success'
  }
  return 'warning'
}
function attributes(resource: RegistryView['resources'][number]) {
  return view.value?.providers
    .find((item) => {
      return item.id === resource.providerId
    })
    ?.display.columns.map((column) => {
      return column.title + '：' + String(resource.attributes[column.key] ?? '—')
    })
    .join(' · ')
}
async function load() {
  view.value = await request('/api/research/registry', RegistryViewSchema)
  await research.refresh()
}
async function action(path: string, data: object, method: string) {
  busy.value = true
  try {
    view.value = await request('/api/research/' + path, RegistryViewSchema, { method, data })
    await research.refresh()
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <div class="d-flex align-center flex-wrap ga-3 mb-4">
    <div>
      <h1 class="text-h5 font-weight-bold">资源与提供者</h1>
      <p class="text-medium-emphasis mt-1">资源实例 → 提供者声明的操作 → 配置、测试与入口引用</p>
    </div>
    <span class="pi-spacer" /><UiButton variant="tonal" :loading="busy" @click="notices.run(load)"
      >刷新</UiButton
    >
  </div>
  <div data-tone="info" class="pi-alert mb-5">
    Bot 不定义资源的业务类别。提供者声明操作、输入／输出 JSON Schema 与 UI
    Schema；所有操作共用同一个调用入口。
  </div>
  <h2 class="text-h6 mb-3">提供者注册</h2>
  <div class="pi-row mb-5">
    <UiCol v-for="provider in view?.providers" :key="provider.id" cols="12" md="6" lg="4"
      ><UiCard height="100%" class="provider-card" :id="provider.id">
        <div class="pi-card-title">{{ provider.title }}</div>
        <div class="pi-section">
          <UiChip v-if="provider.active" size="small" color="success">已注册</UiChip
          ><UiChip v-else size="small" color="warning">待注册</UiChip>
          <p class="mt-3">{{ provider.description }}</p>
          <p class="text-caption text-medium-emphasis mt-3">
            {{ provider.resources }} 个实例 · {{ provider.operations.length }} 项操作声明 · 发现版本
            {{ provider.discoveryRevision }}
          </p>
        </div>
        <footer class="pi-actions flex-wrap px-4 pb-4">
          <UiButton
            v-if="!provider.active"
            color="primary"
            variant="flat"
            :disabled="busy"
            @click="
              notices.run(() =>
                action(
                  'providers/' + id(provider.id) + '/registration',
                  { revision: view!.revision, enabled: true },
                  'PUT'
                )
              )
            "
            >注册提供者</UiButton
          ><UiButton
            v-else
            color="primary"
            variant="tonal"
            :disabled="busy"
            @click="
              notices.run(() =>
                action('providers/' + id(provider.id) + '/discovery', { revision: view!.revision }, 'POST')
              )
            "
            >发现实例</UiButton
          ><UiButton @click="config = { subject: 'provider', id: provider.id }">连接配置</UiButton
          ><span class="pi-spacer" /><UiButton
            v-if="provider.active"
            color="warning"
            :disabled="busy"
            @click="
              notices.run(() =>
                action(
                  'providers/' + id(provider.id) + '/registration',
                  { revision: view!.revision, enabled: false },
                  'PUT'
                )
              )
            "
            >注销</UiButton
          >
        </footer>
      </UiCard></UiCol
    >
  </div>
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <h2 class="text-h6">资源实例与操作</h2>
    <span class="pi-spacer" /><UiChoice
      v-model="filter"
      label="按提供者筛选"
      :items="[
        { title: '全部提供者', value: 'all' },
        ...(view?.providers.map((item) => ({ title: item.title, value: item.id })) ?? [])
      ]"
      style="max-width: 280px"
    />
  </div>
  <div class="pi-row">
    <UiCol v-for="resource in resources" :key="resource.id" cols="12" md="6"
      ><UiCard height="100%" class="resource-card" :id="resource.id">
        <div class="pi-card-title">{{ resource.name }}</div>
        <div class="pi-section">
          <UiChip :color="resourceColor(resource)" size="small" class="mb-3">{{
            resourceState(resource)
          }}</UiChip>
          <p>{{ resource.description }}</p>
          <p class="text-caption text-medium-emphasis mt-2">
            {{ resource.providerTitle }} · {{ attributes(resource) }}
          </p>
          <hr class="pi-divider my-4" />
          <div v-for="operation in resource.operations" :key="operation.id" class="operation-row">
            <div>
              <strong>{{ operation.title }}</strong>
              <p class="text-caption text-medium-emphasis">{{ operation.id }} · v{{ operation.version }}</p>
              <p class="text-body-2 mt-1">{{ operation.description }}</p>
            </div>
            <UiButton
              color="primary"
              variant="tonal"
              :disabled="!resource.available"
              @click="inspecting = { resource, operation }"
              >查看与测试</UiButton
            >
          </div>
        </div>
        <footer class="pi-actions px-4 pb-3">
          <UiButton @click="config = { subject: 'resource', id: resource.id }">实例配置</UiButton
          ><span class="pi-spacer" /><UiCheck
            :model-value="resource.enabled"
            label="启用"
            :aria-label="resource.name + '启用'"
            :disabled="busy"
            @update:model-value="
              notices.run(() =>
                action(
                  'resources/' + id(resource.id) + '/enabled',
                  { revision: view!.revision, enabled: Boolean($event) },
                  'PUT'
                )
              )
            "
          />
        </footer> </UiCard
    ></UiCol>
  </div>
  <OperationBindings v-if="view" :registry="view" @saved="notices.run(load)" />
  <ResourceConfigurationDialog
    v-if="config"
    :key="config.id"
    :subject="config.subject"
    :subject-id="config.id"
    @close="config = undefined"
    @saved="notices.run(load)"
  />
  <OperationDialog
    v-if="inspecting && view"
    :instance="inspecting.resource"
    :operation="inspecting.operation"
    :revision="view.revision"
    @close="inspecting = undefined"
  />
</template>
<style scoped>
.provider-card {
  border-top: 3px solid rgb(var(--pi-primary));
}
.resource-card {
  border-top: 3px solid rgb(var(--pi-success));
}
.operation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}
@media (max-width: 600px) {
  .operation-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
