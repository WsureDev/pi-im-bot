<script setup lang="ts">
import { TabsTab } from '@ui-sdk/vue/tabs'
import UiAccordion from '@/ui/UiAccordion.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDataTable from '@/ui/table/UiDataTable.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiDisclosure from '@/ui/UiDisclosure.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiTabs from '@/ui/UiTabs.vue'
import UiText from '@/ui/fields/UiText.vue'
import { usePasswordVisibility } from '@/composables/password-visibility'
import { SecretValueSchema } from '@core/plugins/configuration/secret-editor'

import { computed, onMounted, ref } from 'vue'
import { z } from 'zod'
import { ResourcesViewSchema, McpServerDraftSchema, type ResourcesView } from '@core/resources/contracts'
import { SkillConfigSchema } from '@core/resources/skills/schema'
import { GsviDraftSchema } from '@core/services/gsvi/configuration'
import { ComfyDraftSchema } from '@core/services/comfy/configuration'
import { WorkflowSchema } from '@core/services/comfy/resources'
import { StorageOverviewSchema } from '@core/plugins/storage/status'
import { ObserverStatusSchema } from '@core/plugins/observations/schema'
import { VueMonacoEditor } from '@/composables/monaco'
import { request, mutate, id } from '@/api/http'
import { useDraft } from '@/composables/drafts'
import { confirmAction } from '@/utils/confirm'
import { useNotifications } from '@/stores/notifications'
import { useRoute } from 'vue-router'
const route = useRoute()
const showConnections = computed(() => {
  return route.query.connections === '1'
})
const notifications = useNotifications()
const keyVisibility = usePasswordVisibility()
const state = ref<ResourcesView>()
const tab = ref('mcp')
const search = ref('')
const kind = ref('mcp')
const originalId = ref('')
const dialog = ref(false)
const busy = ref(false)
function formatBytes(bytes?: number) {
  if (bytes === undefined) {
    return '尚未测量'
  }
  return (bytes / (1024 * 1024)).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' MiB'
}
const mcp = ref(McpServerDraftSchema.parse({ id: 'mcp', name: 'MCP', url: '' }))
const skill = ref(SkillConfigSchema.parse({ id: 'skill', name: 'Skill', sourceDir: '.' }))
const service = ref(GsviDraftSchema.parse({ id: 'gsvi', name: 'GSVI', kind: 'gsvi', url: '' }))
const extraHeaders = ref('{}')
const headerEnv = ref('{}')
const tasks = ref('{}')
const downloadHeaders = ref('{}')
const downloadOrigins = ref('[]')
const nativeHeaders = ref('')
const nativeDownloadHeaders = ref('')
const document = ref('{}')
const allDrafts = computed(() => {
  return {
    mcp: mcp.value,
    skill: skill.value,
    service: service.value,
    headers: extraHeaders.value,
    headerEnv: headerEnv.value,
    tasks: tasks.value,
    downloadHeaders: downloadHeaders.value,
    downloadOrigins: downloadOrigins.value,
    nativeHeaders: nativeHeaders.value,
    nativeDownloadHeaders: nativeDownloadHeaders.value,
    document: document.value
  }
})
const changes = useDraft(allDrafts)
const storage = ref<z.infer<typeof StorageOverviewSchema>>()
const observers = ref<z.infer<typeof ObserverStatusSchema>>()
const toolsDialog = ref(false)
const toolRows = ref<ResourcesView['mcp'][number]['tools']>([])
const rows = computed(() => {
  if (!state.value) {
    return []
  }
  if (tab.value === 'mcp') {
    return state.value.mcp.map((item) => {
      return { id: item.id, name: item.name, summary: item.endpoint, status: item.state }
    })
  }
  if (tab.value === 'skills') {
    return state.value.skills.map((item) => {
      return {
        id: item.id,
        name: item.name,
        summary: item.manifest?.description ?? item.sourceDir,
        status: item.state
      }
    })
  }
  if (tab.value === 'services') {
    return state.value.services.map((item) => {
      return { id: item.id, name: item.name, summary: item.endpoint, status: item.state }
    })
  }
  if (tab.value === 'comfy') {
    return state.value.comfyServices.map((item) => {
      return { id: item.id, name: item.name, summary: item.endpoint, status: String(item.enabled) }
    })
  }
  return state.value.workflows.map((item) => {
    return { id: item.id, name: item.name, summary: item.description, status: item.digest }
  })
})
async function load() {
  state.value = await request('/api/resources', ResourcesViewSchema)
}
async function selectTab(value: string) {
  tab.value = value
  if (value === 'storage') {
    storage.value = await request('/api/plugins/storage', StorageOverviewSchema)
  }
  if (value === 'observers') {
    observers.value = await request('/api/plugins/observers', ObserverStatusSchema)
  }
}
async function open(resourceKind: string, resourceId = '') {
  keyVisibility.reset()
  kind.value = resourceKind
  originalId.value = resourceId
  if (resourceKind === 'mcp') {
    const source = state.value?.mcp.find((entry) => {
      return entry.id === resourceId
    })
    mcp.value = McpServerDraftSchema.parse({ id: 'mcp', name: 'MCP', url: '' })
    if (source) {
      mcp.value = McpServerDraftSchema.parse({
        id: source.id,
        name: source.name,
        enabled: source.enabled,
        timeoutMs: source.timeoutMs,
        headers: source.headers,
        headerEnv: source.headerEnv,
        tasks: source.tasks,
        url: ''
      })
    }
    extraHeaders.value = JSON.stringify(mcp.value.headers, null, 2)
    headerEnv.value = JSON.stringify(mcp.value.headerEnv, null, 2)
    tasks.value = JSON.stringify(mcp.value.tasks, null, 2)
  }
  if (resourceKind === 'skills') {
    const source = state.value?.skills.find((entry) => {
      return entry.id === resourceId
    })
    skill.value = SkillConfigSchema.parse({ id: 'skill', name: 'Skill', sourceDir: '.' })
    if (source) {
      skill.value = { id: source.id, name: source.name, enabled: source.enabled, sourceDir: source.sourceDir }
    }
  }
  if (resourceKind === 'services') {
    const source = state.value?.services.find((entry) => {
      return entry.id === resourceId
    })
    service.value = GsviDraftSchema.parse({ id: 'gsvi', name: 'GSVI', kind: 'gsvi', url: '' })
    if (source) {
      const { endpoint, state: _state, ...rest } = source
      const stored = await request(
        '/api/resources/services/' + id(resourceId) + '/api-key',
        SecretValueSchema,
        { method: 'POST', data: { revision: state.value!.revision } }
      )
      service.value = GsviDraftSchema.parse({ ...rest, url: '', apiKey: stored.value })
    }
    extraHeaders.value = JSON.stringify(service.value.headers, null, 2)
    downloadHeaders.value = JSON.stringify(service.value.downloadHeaders, null, 2)
    downloadOrigins.value = JSON.stringify(service.value.downloadOrigins, null, 2)
    nativeHeaders.value = JSON.stringify(service.value.nativeRequestHeaders ?? null, null, 2)
    nativeDownloadHeaders.value = JSON.stringify(service.value.nativeDownloadHeaders ?? null, null, 2)
  }
  if (resourceKind === 'comfy') {
    const source = state.value?.comfyServices.find((entry) => {
      return entry.id === resourceId
    })
    let value: object = {
      id: 'comfy',
      name: 'ComfyUI',
      kind: 'comfy',
      enabled: false,
      url: '',
      headers: {},
      workflows:
        state.value?.workflows.map((entry) => {
          return entry.id
        }) ?? []
    }
    if (source) {
      const { endpoint, ...rest } = source
      value = { ...rest, url: '' }
    }
    document.value = JSON.stringify(value, null, 2)
  }
  if (resourceKind === 'workflows') {
    let value: object = {
      id: 'workflow',
      name: '已审查模板',
      description: '',
      graph: {},
      parameters: {},
      bindings: { positive: 'prompt', loras: [] },
      outputs: [],
      models: [],
      loras: []
    }
    if (resourceId) {
      const current = await request(
        '/api/resources/workflows/' + id(resourceId),
        z.object({ revision: z.string(), workflow: WorkflowSchema })
      )
      value = current.workflow
      state.value!.revision = current.revision
    }
    document.value = JSON.stringify(value, null, 2)
  }
  changes.clean()
  dialog.value = true
}
async function save() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    let data: object
    if (kind.value === 'mcp') {
      data = {
        revision: state.value!.revision,
        server: McpServerDraftSchema.parse({
          ...mcp.value,
          headers: JSON.parse(extraHeaders.value),
          headerEnv: JSON.parse(headerEnv.value),
          tasks: JSON.parse(tasks.value)
        })
      }
    } else if (kind.value === 'skills') {
      data = { revision: state.value!.revision, skill: SkillConfigSchema.parse(skill.value) }
    } else if (kind.value === 'services') {
      data = {
        revision: state.value!.revision,
        service: GsviDraftSchema.parse({
          ...service.value,
          headers: JSON.parse(extraHeaders.value),
          downloadHeaders: JSON.parse(downloadHeaders.value),
          downloadOrigins: JSON.parse(downloadOrigins.value),
          nativeRequestHeaders: JSON.parse(nativeHeaders.value) ?? undefined,
          nativeDownloadHeaders: JSON.parse(nativeDownloadHeaders.value) ?? undefined
        })
      }
    } else if (kind.value === 'comfy') {
      data = { revision: state.value!.revision, service: ComfyDraftSchema.parse(JSON.parse(document.value)) }
    } else {
      data = { revision: state.value!.revision, workflow: WorkflowSchema.parse(JSON.parse(document.value)) }
    }
    let path = '/api/resources/' + kind.value
    let method = 'POST'
    if (originalId.value && kind.value !== 'workflows') {
      path += '/' + id(originalId.value)
      method = 'PUT'
    }
    await mutate(path, data, method)
    changes.clean()
    dialog.value = false
    await load()
  } finally {
    busy.value = false
  }
}
async function action(resourceId: string, action: string) {
  let path = '/api/resources/' + tab.value + '/' + id(resourceId)
  let method = 'POST'
  if (action === 'delete') {
    if (!(await confirmAction('删除资源', resourceId))) {
      return
    }
    method = 'DELETE'
  } else {
    path += '/' + action
  }
  await mutate(path, { revision: state.value!.revision }, method)
  await load()
}
async function reconcile() {
  await mutate('/api/plugins/storage/reconcile')
  await selectTab('storage')
}
async function cancelObserver(taskId: number) {
  await mutate('/api/plugins/observers/' + id(String(taskId)) + '/cancel')
  await selectTab('observers')
}
function showTools(resourceId: string) {
  toolRows.value =
    state.value?.mcp.find((entry) => {
      return entry.id === resourceId
    })?.tools ?? []
  toolsDialog.value = true
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <header class="pi-toolbar">
    <div class="pi-toolbar-title">MCP、Skill 与资源</div>
    <UiButton @click="notifications.run(load)">刷新</UiButton>
  </header>
  <UiTabs :model-value="tab" @update:model-value="notifications.run(() => selectTab(String($event)))"
    ><TabsTab value="mcp">MCP</TabsTab><TabsTab value="skills">Skill</TabsTab
    ><TabsTab v-if="showConnections" value="services">GSVI 服务</TabsTab
    ><TabsTab v-if="showConnections" value="comfy">ComfyUI 服务</TabsTab
    ><TabsTab v-if="showConnections" value="workflows">工作流</TabsTab><TabsTab value="storage">存储</TabsTab
    ><TabsTab value="observers">观察任务</TabsTab></UiTabs
  >
  <UiCard v-if="!['storage', 'observers'].includes(tab)" class="mt-4"
    ><div class="pi-section" :inert="busy">
      <div class="pi-row">
        <UiCol><UiText v-model="search" label="搜索资源" /></UiCol
        ><UiCol cols="auto"
          ><UiButton variant="flat" color="primary" @click="notifications.run(() => open(tab))"
            >新增 / 导入</UiButton
          ></UiCol
        >
      </div>
      <UiDataTable
        :items="rows"
        :search="search"
        :items-per-page="25"
        :headers="[
          { title: '名称', key: 'name' },
          { title: 'ID', key: 'id' },
          { title: '说明', key: 'summary' },
          { title: '状态', key: 'status' },
          { title: '操作', key: 'actions' }
        ]"
        ><template #item.actions="{ item }"
          ><UiButton variant="text" @click="notifications.run(() => open(tab, item.id))">配置</UiButton
          ><UiButton
            v-if="tab === 'mcp'"
            variant="text"
            @click="notifications.run(() => action(item.id, 'refresh'))"
            >刷新工具</UiButton
          ><UiButton v-if="tab === 'mcp'" variant="text" @click="showTools(item.id)">工具列表</UiButton
          ><UiButton
            v-if="tab === 'skills'"
            variant="text"
            @click="notifications.run(() => action(item.id, 'import'))"
            >导入</UiButton
          ><UiButton variant="text" color="error" @click="notifications.run(() => action(item.id, 'delete'))"
            >删除</UiButton
          ></template
        ></UiDataTable
      >
    </div></UiCard
  >
  <UiCard v-else-if="tab === 'storage'" class="mt-4" title="插件数据与产物额度"
    ><div class="pi-section" :inert="busy">
      <UiButton @click="notifications.run(() => selectTab('storage'))">刷新存储状态</UiButton
      ><UiButton @click="notifications.run(reconcile)">核对已移除的产物文件</UiButton>
      <template v-if="storage">
        <div class="pi-list">
          <UiListItem
            title="插件数据预留"
            :subtitle="formatBytes(storage.data.reservedBytes) + ' / ' + formatBytes(storage.data.totalBytes)"
          />
          <UiListItem
            title="卷与插件额度"
            :subtitle="
              '每卷 ' +
              formatBytes(storage.data.volumeBytes) +
              '，每插件 ' +
              formatBytes(storage.data.pluginBytes) +
              '，最多 ' +
              storage.data.maxVolumes +
              ' 卷'
            "
          />
          <UiListItem
            title="产物"
            :subtitle="
              formatBytes(storage.artifacts.bytes) +
              ' / ' +
              formatBytes(storage.artifacts.limits.maxTotalBytes) +
              ' · ' +
              storage.artifacts.items +
              ' 项 · 正在写入 ' +
              storage.artifacts.pending
            "
          />
          <UiListItem title="单文件上限" :subtitle="formatBytes(storage.artifacts.limits.maxFileBytes)" />
        </div>
        <div v-if="!storage.data.dependenciesReady" data-tone="warning" class="pi-alert mb-4">
          持久数据文件系统依赖尚未就绪，请在插件运行环境中检查。
        </div>
        <UiDataTable
          :items="storage.data.volumes"
          :headers="[
            { title: '插件', key: 'instanceId' },
            { title: '范围', key: 'scopeKey' },
            { title: '状态', key: 'state' },
            { title: '预留', key: 'bytes' },
            { title: '已用', key: 'usedBytes' },
            { title: '错误', key: 'error' }
          ]"
          :items-per-page="25"
        >
          <template #item.bytes="{ item }">{{ formatBytes(item.bytes) }}</template>
          <template #item.usedBytes="{ item }">{{ formatBytes(item.usedBytes) }}</template>
        </UiDataTable>
      </template>
    </div></UiCard
  >
  <UiCard v-else class="mt-4" title="观察任务与后续动作"
    ><div class="pi-section" :inert="busy">
      <UiButton @click="notifications.run(() => selectTab('observers'))">刷新观察状态</UiButton>
      <div class="pi-alert" v-if="observers?.lastError" data-tone="error">{{ observers.lastError }}</div>
      <UiDataTable
        :items="observers?.active ?? []"
        :headers="[
          { title: '处理器', key: 'handler' },
          { title: '状态', key: 'state' },
          { title: '错误', key: 'error' },
          { title: '操作', key: 'actions' }
        ]"
        ><template #item.actions="{ item }"
          ><UiButton @click="notifications.run(() => cancelObserver(item.taskId))"
            >停止此动作</UiButton
          ></template
        ></UiDataTable
      ><UiAccordion
        ><UiDisclosure title="近期观察记录"
          ><div class="pi-disclosure-body">
            <UiDataTable
              :items="observers?.recent ?? []"
              :headers="[
                { title: '处理器', key: 'handler' },
                { title: '状态', key: 'state' },
                { title: '计划时间', key: 'dueAt' },
                { title: '错误', key: 'error' }
              ]"
              :items-per-page="25"
            /></div></UiDisclosure
      ></UiAccordion></div
  ></UiCard>
  <UiDialog v-model="dialog" persistent max-width="900"
    ><UiCard title="资源配置"
      ><div class="pi-section" :inert="busy">
        <template v-if="kind === 'mcp'"
          ><UiText v-model="mcp.id" label="ID" :disabled="Boolean(originalId)" /><UiText
            v-model="mcp.name"
            label="名称" /><UiText v-model="mcp.url" label="HTTP 地址（编辑时留空保留）" /><UiCheck
            v-model="mcp.enabled"
            label="启用" /><UiText v-model.number="mcp.timeoutMs" label="超时（毫秒）" type="number" /><UiText
            multiline
            v-model="extraHeaders"
            label="Header JSON" /><UiText multiline v-model="headerEnv" label="Header 环境变量 JSON" /><UiText
            multiline
            v-model="tasks"
            label="MCP Tasks 策略 JSON"
        /></template>
        <template v-else-if="kind === 'skills'"
          ><UiText v-model="skill.id" label="ID" :disabled="Boolean(originalId)" /><UiText
            v-model="skill.name"
            label="名称" /><UiText v-model="skill.sourceDir" label="来源目录" /><UiCheck
            v-model="skill.enabled"
            label="启用"
        /></template>
        <template v-else-if="kind === 'services'"
          ><UiText v-model="service.id" label="ID" :disabled="Boolean(originalId)" /><UiText
            v-model="service.name"
            label="名称" /><UiText v-model="service.url" label="GSVI 地址（编辑时留空保留）" /><UiText
            :model-value="service.apiKey"
            @update:model-value="service.apiKey = $event ?? ''"
            :type="keyVisibility.type.value"
            :append-inner-icon="keyVisibility.icon.value"
            @click:append-inner="keyVisibility.toggle"
            clearable
            autocomplete="new-password"
            label="API Key"
            aria-label="API Key" /><UiCheck v-model="service.enabled" label="启用具名服务" /><UiText
            v-model.number="service.timeoutMs"
            type="number"
            label="超时（毫秒）" /><UiText multiline v-model="extraHeaders" label="请求 Header JSON" /><UiText
            multiline
            v-model="downloadHeaders"
            label="下载 Header JSON" /><UiText
            multiline
            v-model="downloadOrigins"
            label="下载来源 JSON" /><UiText
            multiline
            v-model="nativeHeaders"
            label="原生请求 Header JSON（null 使用默认）" /><UiText
            multiline
            v-model="nativeDownloadHeaders"
            label="原生下载 Header JSON（null 使用默认）" /><UiCheck
            v-model="service.sourceCompatibleDownloads"
            label="采用源插件下载语义"
        /></template>
        <VueMonacoEditor
          v-else
          v-model:value="document"
          language="json"
          :options="{ automaticLayout: true, minimap: { enabled: false } }"
          style="height: 65vh"
        />
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton
          @click="
            changes.discard().then((leave) => {
              if (leave) {
                changes.clean()
                dialog = false
              }
            })
          "
          >取消</UiButton
        ><UiButton variant="flat" color="primary" :loading="busy" @click="notifications.run(save)"
          >保存</UiButton
        >
      </footer></UiCard
    ></UiDialog
  >
  <UiDialog v-model="toolsDialog" max-width="1000"
    ><UiCard title="MCP 工具与能力"
      ><div class="pi-section" :inert="busy">
        <UiDataTable
          :items="toolRows"
          :headers="[
            { title: '名称', key: 'name' },
            { title: '能力 ID', key: 'capabilityId' },
            { title: '模型名称', key: 'modelName' },
            { title: '说明', key: 'description' },
            { title: '可用', key: 'available' }
          ]"
          :items-per-page="25"
        />
      </div>
      <footer class="pi-actions"><UiButton @click="toolsDialog = false">关闭</UiButton></footer></UiCard
    ></UiDialog
  >
</template>
