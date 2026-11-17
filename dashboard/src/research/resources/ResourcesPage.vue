<script setup lang="ts">
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
    <v-spacer /><v-btn variant="tonal" :loading="busy" @click="notices.run(load)">刷新</v-btn>
  </div>
  <v-alert type="info" variant="tonal" class="mb-5"
    >Bot 不定义资源的业务类别。提供者声明操作、输入／输出 JSON Schema 与 UI
    Schema；所有操作共用同一个调用入口。</v-alert
  >
  <h2 class="text-h6 mb-3">提供者注册</h2>
  <v-row class="mb-5"
    ><v-col v-for="provider in view?.providers" :key="provider.id" cols="12" md="6" lg="4"
      ><v-card height="100%" class="provider-card" :id="provider.id">
        <v-card-title>{{ provider.title }}</v-card-title
        ><v-card-text
          ><v-chip v-if="provider.active" size="small" color="success">已注册</v-chip
          ><v-chip v-else size="small" color="warning">待注册</v-chip>
          <p class="mt-3">{{ provider.description }}</p>
          <p class="text-caption text-medium-emphasis mt-3">
            {{ provider.resources }} 个实例 · {{ provider.operations.length }} 项操作声明 · 发现版本
            {{ provider.discoveryRevision }}
          </p></v-card-text
        >
        <v-card-actions class="flex-wrap px-4 pb-4"
          ><v-btn
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
            >注册提供者</v-btn
          ><v-btn
            v-else
            color="primary"
            variant="tonal"
            :disabled="busy"
            @click="
              notices.run(() =>
                action('providers/' + id(provider.id) + '/discovery', { revision: view!.revision }, 'POST')
              )
            "
            >发现实例</v-btn
          ><v-btn @click="config = { subject: 'provider', id: provider.id }">连接配置</v-btn
          ><v-spacer /><v-btn
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
            >注销</v-btn
          ></v-card-actions
        >
      </v-card></v-col
    ></v-row
  >
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <h2 class="text-h6">资源实例与操作</h2>
    <v-spacer /><v-select
      v-model="filter"
      label="按提供者筛选"
      :items="[
        { title: '全部提供者', value: 'all' },
        ...(view?.providers.map((item) => ({ title: item.title, value: item.id })) ?? [])
      ]"
      hide-details
      style="max-width: 280px"
    />
  </div>
  <v-row
    ><v-col v-for="resource in resources" :key="resource.id" cols="12" md="6"
      ><v-card height="100%" class="resource-card" :id="resource.id">
        <v-card-title>{{ resource.name }}</v-card-title
        ><v-card-text
          ><v-chip :color="resourceColor(resource)" size="small" class="mb-3">{{
            resourceState(resource)
          }}</v-chip>
          <p>{{ resource.description }}</p>
          <p class="text-caption text-medium-emphasis mt-2">
            {{ resource.providerTitle }} · {{ attributes(resource) }}
          </p>
          <v-divider class="my-4" />
          <div v-for="operation in resource.operations" :key="operation.id" class="operation-row">
            <div>
              <strong>{{ operation.title }}</strong>
              <p class="text-caption text-medium-emphasis">{{ operation.id }} · v{{ operation.version }}</p>
              <p class="text-body-2 mt-1">{{ operation.description }}</p>
            </div>
            <v-btn
              color="primary"
              variant="tonal"
              :disabled="!resource.available"
              @click="inspecting = { resource, operation }"
              >查看与测试</v-btn
            >
          </div> </v-card-text
        ><v-card-actions class="px-4 pb-3"
          ><v-btn @click="config = { subject: 'resource', id: resource.id }">实例配置</v-btn
          ><v-spacer /><v-switch
            :model-value="resource.enabled"
            label="启用"
            :aria-label="resource.name + '启用'"
            hide-details
            color="primary"
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
        /></v-card-actions> </v-card></v-col
  ></v-row>
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
  border-top: 3px solid rgb(var(--v-theme-primary));
}
.resource-card {
  border-top: 3px solid rgb(var(--v-theme-success));
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
