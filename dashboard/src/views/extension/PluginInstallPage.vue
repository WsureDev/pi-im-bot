<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDataTable from '@/ui/table/UiDataTable.vue'
import UiFile from '@/ui/fields/UiFile.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { z } from 'zod'
import { PluginEditorViewSchema } from '@core/plugins/contracts'
import {
  InstallationSchema,
  InstallationListSchema,
  type Installation
} from '@core/plugins/install/contracts'
import { MarketViewSchema, PluginCatalogSourceSchema } from '@core/plugins/market/contracts'
import { request, mutate, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useDraft } from '@/composables/drafts'
const emit = defineEmits<{ (event: 'changed'): void }>()
const notifications = useNotifications()
const market = ref<z.infer<typeof MarketViewSchema>>()
const installations = ref<Installation[]>([])
const sources = ref('[]')
const sourceChanges = useDraft(sources)
const revision = ref('')
const search = ref('')
const mode = ref('url')
const location = ref('')
const targetId = ref('')
const file = ref<File[]>([])
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const pending = computed(() => {
  return installations.value.some((job) => {
    return ['queued', 'downloading', 'verifying', 'applying'].includes(job.stage)
  })
})
async function poll() {
  installations.value = await request('/api/plugins/installations', InstallationListSchema)
  if (disposed) {
    return
  }
  if (pending.value) {
    timer = setTimeout(() => {
      void notifications.run(poll)
    }, 1500)
  } else {
    emit('changed')
  }
}
async function load() {
  const [state, catalog] = await Promise.all([
    request('/api/plugins', PluginEditorViewSchema),
    request('/api/plugins/market', MarketViewSchema)
  ])
  revision.value = state.revision
  market.value = catalog
  sources.value = JSON.stringify(catalog.sources, null, 2)
  sourceChanges.clean()
  await poll()
}
async function install(key?: string) {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    revision.value = (await request('/api/plugins', PluginEditorViewSchema)).revision
    let path = '/api/plugins/install'
    let data: object = { revision: revision.value, [mode.value]: location.value }
    if (targetId.value) {
      Object.assign(data, { targetId: targetId.value })
    }
    if (key) {
      path = '/api/plugins/market/install'
      data = { revision: revision.value, key }
    }
    if (!key && mode.value === 'upload') {
      if (file.value.length !== 1) {
        throw new Error('请选择一个 ZIP 插件包')
      }
      path += '/upload'
      const form = new FormData()
      form.set('revision', revision.value)
      if (targetId.value) {
        form.set('targetId', targetId.value)
      }
      form.set('archive', file.value[0])
      data = form
    }
    const job = await request(path, InstallationSchema, { method: 'POST', data })
    notifications.show('安装已受理：' + job.id)
  } finally {
    busy.value = false
    clearTimeout(timer)
    await poll()
  }
}
async function refreshMarket() {
  market.value = await request('/api/plugins/market/refresh', MarketViewSchema, { method: 'POST' })
}
async function saveSources() {
  const parsed = z.array(PluginCatalogSourceSchema).parse(JSON.parse(sources.value))
  revision.value = (await request('/api/plugins', PluginEditorViewSchema)).revision
  market.value = await request('/api/plugins/market/sources', MarketViewSchema, {
    method: 'PUT',
    data: { revision: revision.value, sources: parsed }
  })
  sourceChanges.clean()
}
async function cancel(job: Installation) {
  await mutate('/api/plugins/installations/' + id(job.id) + '/cancel')
  await poll()
}
onMounted(() => {
  void notifications.run(load)
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
})
</script>
<template>
  <div class="pi-row mb-5">
    <UiCol cols="12" md="7"
      ><UiCard title="安装插件"
        ><div class="pi-section">
          <UiChoice
            v-model="mode"
            label="来源"
            aria-label="来源"
            :items="[
              { title: 'GitHub / ZIP URL', value: 'url' },
              { title: '开发目录', value: 'directory' },
              { title: '上传 ZIP', value: 'upload' }
            ]"
          />
          <UiFile v-if="mode === 'upload'" v-model="file" label="插件包" accept=".zip" multiple />
          <UiText v-else v-model="location" label="来源地址或标识" />
          <UiText v-model="targetId" label="更新已有实例 ID（可选）" />
          <UiButton
            color="primary"
            variant="flat"
            prepend-icon="mdi-plus"
            :loading="busy"
            @click="notifications.run(() => install())"
            >安装插件</UiButton
          >
        </div></UiCard
      ></UiCol
    >
    <UiCol cols="12" md="5"
      ><UiCard title="目录源"
        ><div class="pi-section">
          <UiText multiline v-model="sources" label="目录源 JSON" rows="6" /><UiButton
            color="primary"
            variant="tonal"
            @click="notifications.run(saveSources)"
            >保存目录源</UiButton
          >
        </div></UiCard
      ></UiCol
    >
  </div>
  <header class="pi-toolbar">
    <div class="pi-toolbar-title">发现插件</div>
    <UiButton @click="notifications.run(refreshMarket)">刷新目录</UiButton>
  </header>
  <div class="pi-alert" v-for="error in market?.errors" :key="error" data-tone="warning">{{ error }}</div>
  <UiText v-model="search" label="搜索目录" />
  <UiDataTable
    :items="market?.entries ?? []"
    :headers="[
      { title: '名称', key: 'name' },
      { title: '说明', key: 'description' },
      { title: '版本', key: 'version' },
      { title: '来源', key: 'source' },
      { title: '操作', key: 'actions' }
    ]"
    :search="search"
    :items-per-page="25"
    ><template #item.actions="{ item }"
      ><UiButton :loading="busy" @click="notifications.run(() => install(item.key))"
        >安装 / 更新</UiButton
      ></template
    ></UiDataTable
  >
  <hr class="pi-divider my-5" />
  <h2 class="text-h6">安装记录</h2>
  <UiButton variant="text" @click="notifications.run(poll)">核对原任务</UiButton>
  <UiDataTable
    :items="installations"
    :headers="[
      { title: '任务', key: 'name' },
      { title: 'ID', key: 'id' },
      { title: '状态', key: 'stage' },
      { title: '错误', key: 'error' },
      { title: '操作', key: 'actions' }
    ]"
    :items-per-page="10"
    ><template #item.actions="{ item }"
      ><UiButton
        v-if="['queued', 'downloading', 'verifying', 'applying'].includes(item.stage)"
        @click="notifications.run(() => cancel(item))"
        >取消</UiButton
      ></template
    ></UiDataTable
  >
</template>
