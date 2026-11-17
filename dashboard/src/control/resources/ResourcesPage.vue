<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ResourceRegistryViewSchema,
  type ResourceRegistryView,
  type ResourceOperationView
} from '@core/resource-providers/contracts'
import { request, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useWorkspace } from '@/stores/workspace'
import ResourceConfigurationDialog from './ResourceConfigurationDialog.vue'
import OperationDialog from './OperationDialog.vue'
const notices = useNotifications()
const workspace = useWorkspace()
const view = ref<ResourceRegistryView>()
const busy = ref(false)
const filter = ref('all')
const roomId = ref('')
const config = ref<{ subject: 'provider' | 'resource'; id: string }>()
const inspecting = ref<{
  instance: ResourceRegistryView['resources'][number]
  operation: ResourceOperationView
}>()
const rows = computed(() => {
  return (
    view.value?.resources.filter((entry) => {
      return filter.value === 'all' || entry.providerId === filter.value
    }) ?? []
  )
})
async function load() {
  view.value = await request('/api/control/registry', ResourceRegistryViewSchema)
}
async function action(path: string, data: object, method: string) {
  busy.value = true
  try {
    view.value = await request('/api/control/' + path, ResourceRegistryViewSchema, { method, data })
  } finally {
    busy.value = false
  }
}
function providerState(active: boolean) {
  if (active) {
    return '已启用'
  }
  return '已停用'
}
function color(available: boolean) {
  if (available) {
    return 'success'
  }
  return 'warning'
}
function status(resource: ResourceRegistryView['resources'][number]) {
  if (resource.state === 'stale') {
    return '发现结果失效'
  }
  if (resource.available) {
    return '已就绪'
  }
  return '尚未启用'
}
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <div class="d-flex align-center flex-wrap ga-3 mb-4">
    <div>
      <h1 class="text-h5 font-weight-bold">资源与提供者</h1>
      <p class="text-medium-emphasis mt-1">真实安装插件声明的资源与操作，共用配置和调用规范。</p>
    </div>
    <v-spacer /><v-btn variant="text" to="/resources?connections=1">旧连接配置</v-btn
    ><v-btn variant="text" to="/plugins">安装与管理插件</v-btn
    ><v-btn :loading="busy" @click="notices.run(load)">刷新目录</v-btn>
  </div>
  <v-alert type="info" variant="tonal" class="mb-5"
    >Bot 不定义资源的业务类型。操作、JSON Schema
    和配置表单由插件声明；调用在隔离执行器中完成。未声明发现接口的插件直接提供其当前实例。</v-alert
  >
  <v-select
    v-model="roomId"
    :items="workspace.snapshot?.rooms"
    item-title="name"
    item-value="id"
    label="资源发现的授权范围"
    aria-label="资源发现的授权范围"
    hint="只有点击“发现实例”才调用插件；配置与目录查看不会请求上游。"
    persistent-hint
    class="mb-5"
  />
  <h2 class="text-h6 mb-3">资源提供者</h2>
  <v-row class="mb-5"
    ><v-col v-for="provider in view?.providers" :key="provider.id" cols="12" md="6" lg="4"
      ><v-card height="100%" class="provider-card" :id="'provider-' + provider.id"
        ><v-card-title>{{ provider.title }}</v-card-title
        ><v-card-text
          ><v-chip :color="color(provider.active && provider.runtimeReady)" size="small">{{
            providerState(provider.active)
          }}</v-chip
          ><v-chip v-if="!provider.runtimeReady" color="warning" size="small" class="ml-2"
            >执行环境关闭</v-chip
          >
          <p class="mt-3">{{ provider.description }}</p>
          <p class="text-caption text-medium-emphasis mt-3">
            {{ provider.resourceCount }} 个实例 · {{ provider.operationCount }} 项操作
          </p></v-card-text
        ><v-card-actions class="flex-wrap px-4 pb-4">
          <v-btn
            v-if="provider.discoverable"
            color="primary"
            variant="tonal"
            :disabled="busy || !provider.active || !provider.runtimeReady || !roomId"
            @click="
              notices.run(() =>
                action(
                  'providers/' + id(provider.id) + '/discovery',
                  { revision: view!.revision, roomId },
                  'POST'
                )
              )
            "
            >发现实例</v-btn
          ><v-btn color="primary" @click="config = { subject: 'provider', id: provider.id }">连接配置</v-btn
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
            >停用</v-btn
          ><v-btn
            v-else
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
            >启用</v-btn
          >
        </v-card-actions></v-card
      ></v-col
    ></v-row
  >
  <v-alert v-if="view && !view.providers.length" variant="tonal" type="info" class="mb-4"
    >尚无提供操作的插件。安装插件后，接口声明会自动出现在这里。</v-alert
  >
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <h2 class="text-h6">实例与操作</h2>
    <v-spacer /><v-select
      v-model="filter"
      :items="[
        { title: '全部提供者', value: 'all' },
        ...(view?.providers.map((entry) => ({ title: entry.title, value: entry.id })) ?? [])
      ]"
      label="按提供者筛选"
      hide-details
      style="max-width: 280px"
    />
  </div>
  <v-row
    ><v-col v-for="resource in rows" :key="resource.id" cols="12" md="6"
      ><v-card class="resource-card" height="100%" :id="'resource-' + resource.id"
        ><v-card-title>{{ resource.name }}</v-card-title
        ><v-card-text
          ><v-chip :color="color(resource.available)" size="small">{{ status(resource) }}</v-chip>
          <p class="mt-3">{{ resource.description }}</p>
          <p class="text-caption text-medium-emphasis mt-2">{{ resource.id }}</p>
          <v-divider class="my-3" />
          <div v-for="operation in resource.operations" :key="operation.id" class="operation-row">
            <div>
              <strong>{{ operation.title }}</strong>
              <p class="text-caption text-medium-emphasis">{{ operation.id }} · {{ operation.execution }}</p>
              <p class="text-body-2 mt-1">{{ operation.description }}</p>
            </div>
            <v-btn color="primary" variant="tonal" @click="inspecting = { instance: resource, operation }"
              >查看与调用</v-btn
            >
          </div></v-card-text
        ><v-card-actions class="px-4 pb-3"
          ><v-btn v-if="resource.base" @click="config = { subject: 'provider', id: resource.providerId }"
            >实例配置</v-btn
          ><v-btn v-else @click="config = { subject: 'resource', id: resource.id }">实例配置</v-btn
          ><v-spacer /><v-switch
            v-if="!resource.base"
            :model-value="resource.enabled"
            label="启用"
            hide-details
            :disabled="busy"
            @update:model-value="
              notices.run(() =>
                action(
                  'resources/' + id(resource.id) + '/enabled',
                  { revision: view!.revision, enabled: Boolean($event) },
                  'PUT'
                )
              )
            " /></v-card-actions></v-card></v-col
  ></v-row>
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
    :instance="inspecting.instance"
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
  gap: 16px;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
}
@media (max-width: 650px) {
  .operation-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
