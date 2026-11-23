<script setup lang="ts">
import { TabsTab } from '@ui-sdk/vue/tabs'
import UiAccordion from '@/ui/UiAccordion.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiDataTable from '@/ui/table/UiDataTable.vue'
import UiDisclosure from '@/ui/UiDisclosure.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiTabs from '@/ui/UiTabs.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { z } from 'zod'
import { PluginEditorViewSchema, type PluginEditorView, type PluginView } from '@core/plugins/contracts'
import { request, mutate, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useWorkspace } from '@/stores/workspace'
import { mayLeave } from '@/composables/drafts'
import { confirmAction } from '@/utils/confirm'
import PluginConfigurationPage from './PluginConfigurationPage.vue'
const PluginInstallPage = defineAsyncComponent(() => {
  return import('./PluginInstallPage.vue')
})
const PluginRuntimePage = defineAsyncComponent(() => {
  return import('./PluginRuntimePage.vue')
})
const PipelinePage = defineAsyncComponent(() => {
  return import('@/control/flow/FlowPage.vue')
})
const PluginOrderPage = defineAsyncComponent(() => {
  return import('./PluginOrderPage.vue')
})
const MarkdownMessagePart = defineAsyncComponent(() => {
  return import('@/components/chat/message_list_comps/MarkdownMessagePart.vue')
})
const route = useRoute()
const router = useRouter()
const notifications = useNotifications()
const workspace = useWorkspace()
const state = ref<PluginEditorView>()
const tab = ref('installed')
const detailTab = ref('configuration')
const search = ref('')
const readme = ref('')
const releases = ref<{ release: string; version: string; importedAt: number }[]>([])
const selected = computed(() => {
  return state.value?.plugins.find((plugin) => {
    return plugin.id === route.params.pluginId
  })
})
const headers = [
  { title: '插件', key: 'name' },
  { title: '版本', key: 'bundle.manifest.version' },
  { title: '状态', key: 'state' },
  { title: '操作', key: 'actions', sortable: false }
]
async function load() {
  state.value = await request('/api/plugins', PluginEditorViewSchema)
}
function toggleLabel(enabled: boolean) {
  if (enabled) {
    return '停用'
  }
  return '启用'
}
function grants(plugin: PluginView) {
  return [
    ...new Set(
      [...(plugin.bundle?.manifest.operations ?? []), ...(plugin.bundle?.manifest.hooks ?? [])].flatMap(
        (operation) => {
          return operation.grants
        }
      )
    )
  ]
}
async function toggle(plugin: PluginView) {
  let allowed = plugin.grants
  if (!plugin.enabled) {
    allowed = [...new Set([...allowed, ...grants(plugin)])]
  }
  await mutate(
    '/api/plugins/' + id(plugin.id),
    { revision: state.value!.revision, patch: { enabled: !plugin.enabled, grants: allowed } },
    'PATCH'
  )
  await load()
}
async function allow(plugin: PluginView) {
  await mutate(
    '/api/plugins/' + id(plugin.id),
    {
      revision: state.value!.revision,
      patch: { grants: [...new Set([...plugin.grants, ...grants(plugin)])] }
    },
    'PATCH'
  )
  await load()
}
async function remove(plugin: PluginView) {
  if (!(await confirmAction('删除 ' + plugin.name, '移除插件，保留已有数据与配置归档。'))) {
    return
  }
  await mutate('/api/plugins/' + id(plugin.id), { revision: state.value!.revision }, 'DELETE')
  await router.push('/plugins')
  await load()
}
async function update(plugin: PluginView) {
  if (
    !(await confirmAction('强制更新 ' + plugin.name, '从原来源重新获取并校验，安装进度可在安装记录中核对。'))
  ) {
    return
  }
  await mutate('/api/plugins/' + id(plugin.id) + '/update', { revision: state.value!.revision })
  await router.push('/plugins')
  tab.value = 'install'
}
async function section(value: string) {
  if (!(await mayLeave())) {
    return
  }
  detailTab.value = value
  if (value === 'documents' && selected.value) {
    const result = await request(
      '/api/plugins/' + id(selected.value.id) + '/documents/README.md',
      z.object({ text: z.string(), name: z.string() })
    )
    readme.value = result.text
    releases.value = await request(
      '/api/plugins/' + id(selected.value.id) + '/releases',
      z.array(z.object({ release: z.string(), version: z.string(), importedAt: z.number() }))
    )
  }
}
async function chooseRelease(release: string) {
  if (
    !selected.value ||
    !(await confirmAction('回选历史版本', '保留配置及数据，并切换到选定的已保存版本。'))
  ) {
    return
  }
  await mutate('/api/plugins/' + id(selected.value.id) + '/releases/select', {
    revision: state.value!.revision,
    release
  })
  await load()
}
async function changeTab(value: string) {
  if (await mayLeave()) {
    tab.value = value
  }
}
watch(
  () => workspace.configVersion,
  () => {
    void notifications.run(load)
  }
)
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <div class="plugin-workspace">
    <header class="pi-toolbar">
      <div class="pi-toolbar-title">插件中心</div>
      <UiButton prepend-icon="mdi-refresh" @click="notifications.run(load)">刷新</UiButton
      ><UiButton to="/plugins" prepend-icon="mdi-puzzle-outline">插件列表</UiButton>
    </header>
    <div v-if="state && !state.runtimeEnabled" data-tone="warning" class="pi-alert mb-4">
      插件执行环境未启用。<UiButton variant="text" @click="changeTab('runtime')">配置运行环境</UiButton>
    </div>
    <template v-if="selected">
      <UiCard :title="selected.name" :subtitle="selected.bundle?.manifest.description">
        <footer class="pi-actions">
          <UiChip>{{ selected.state }}</UiChip
          ><span class="pi-spacer" /><UiButton @click="notifications.run(() => toggle(selected!))">{{
            toggleLabel(selected.enabled)
          }}</UiButton
          ><UiButton @click="notifications.run(() => allow(selected!))">允许所需能力</UiButton
          ><UiButton @click="notifications.run(() => update(selected!))">强制更新</UiButton
          ><UiButton color="error" @click="notifications.run(() => remove(selected!))">删除</UiButton>
        </footer>
        <UiTabs
          :model-value="detailTab"
          @update:model-value="notifications.run(() => section(String($event)))"
          ><TabsTab value="configuration">配置</TabsTab><TabsTab value="order">范围与顺序</TabsTab
          ><TabsTab value="documents">使用方法与版本</TabsTab
          ><TabsTab value="pipeline">执行流程</TabsTab></UiTabs
        >
        <div class="pi-section">
          <PluginConfigurationPage
            v-if="detailTab === 'configuration'"
            :key="selected.id"
            :plugin-id="selected.id"
            @saved="notifications.run(load)"
          />
          <PipelinePage v-else-if="detailTab === 'pipeline'" :plugin-id="selected.id" />
          <PluginOrderPage v-else-if="detailTab === 'order'" :plugin-id="selected.id" />
          <template v-else>
            <div class="pi-list">
              <UiListItem
                v-for="command in selected.bundle?.manifest.commands"
                :key="command.names.join(',')"
                :title="command.names.join(' / ')"
                :subtitle="command.description"
              /><UiListItem
                v-for="operation in selected.bundle?.manifest.operations"
                :key="operation.id"
                :title="operation.title"
                :subtitle="operation.grants.join('、')"
              />
            </div>
            <UiAccordion class="mb-4"
              ><UiDisclosure title="已保存的版本"
                ><div class="pi-disclosure-body">
                  <div class="pi-list">
                    <UiListItem
                      v-for="release in releases"
                      :key="release.release"
                      :title="release.version"
                      :subtitle="new Date(release.importedAt).toLocaleString()"
                      ><template #append
                        ><UiButton @click="notifications.run(() => chooseRelease(release.release))"
                          >回选此版本</UiButton
                        ></template
                      ></UiListItem
                    >
                  </div>
                </div></UiDisclosure
              ></UiAccordion
            >
            <UiButton
              :href="'/api/plugins/' + id(selected.id) + '/archive'"
              prepend-icon="mdi-download"
              class="mb-4"
              >导出插件包</UiButton
            >
            <MarkdownMessagePart :content="readme" :refs="null" :is-dark="false" :custom-html-tags="[]" />
          </template>
        </div>
      </UiCard>
    </template>
    <template v-else>
      <UiTabs :model-value="tab" @update:model-value="changeTab(String($event))"
        ><TabsTab value="installed">已安装</TabsTab><TabsTab value="install">发现与安装</TabsTab
        ><TabsTab value="pipeline">编排</TabsTab><TabsTab value="runtime">运行环境</TabsTab></UiTabs
      >
      <UiCard class="mt-4"
        ><div class="pi-section">
          <template v-if="tab === 'installed'"
            ><UiText
              v-model="search"
              label="搜索插件"
              prepend-inner-icon="mdi-magnify"
              clearable /><UiDataTable
              :items="state?.plugins ?? []"
              :headers="headers"
              :search="search"
              :items-per-page="25"
              :loading="!state"
              ><template #item.actions="{ item }"
                ><UiButton :to="'/plugins/' + item.id" variant="text">配置</UiButton
                ><UiCheck
                  :model-value="item.enabled"
                  @update:model-value="notifications.run(() => toggle(item))"
                  :aria-label="item.name + ' 启用'" /></template></UiDataTable
          ></template>
          <PluginInstallPage v-else-if="tab === 'install'" @changed="notifications.run(load)" />
          <PipelinePage v-else-if="tab === 'pipeline'" />
          <PluginRuntimePage v-else @changed="notifications.run(load)" /></div
      ></UiCard>
    </template>
  </div>
</template>
