<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDataTable from '@/ui/table/UiDataTable.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiText from '@/ui/fields/UiText.vue'
import { usePasswordVisibility } from '@/composables/password-visibility'
import { SecretValueSchema } from '@core/plugins/configuration/secret-editor'

import { onMounted, ref } from 'vue'
import {
  ProviderEditorSnapshotSchema,
  ProviderDraftSchema,
  RemoteModelsSchema,
  ModelProbeResultSchema,
  type ProviderEditorSnapshot,
  type ProviderView
} from '@core/providers/editor-contracts'
import { ProviderGroupSchema, ModelConfigSchema, type ProviderGroup } from '@core/providers/schema'
import { request, mutate, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useDraft } from '@/composables/drafts'
import { confirmAction } from '@/utils/confirm'
const notifications = useNotifications()
const state = ref<ProviderEditorSnapshot>()
const dialog = ref(false)
const groupDialog = ref(false)
const originalId = ref('')
const busy = ref(false)
const draft = ref(ProviderDraftSchema.parse({ id: 'provider', baseUrl: 'https://api.example.com/v1' }))
const headers = ref('{}')
const body = ref('{}')
const group = ref(ProviderGroupSchema.parse({ id: 'group' }))
const changes = useDraft(draft)
const groupChanges = useDraft(group)
const headerChanges = useDraft(headers)
const bodyChanges = useDraft(body)
const availableModels = ref<string[]>([])
const modelSearch = ref('')
const selectedModels = ref<string[]>([])
const modelTexts = ref<{ headers: string; body: string }[]>([])
const modelChanges = useDraft(modelTexts)
const result = ref('')
const keyVisibility = usePasswordVisibility()
async function load() {
  state.value = await request('/api/providers/config', ProviderEditorSnapshotSchema)
}
async function setDefault(provider: string, model: string) {
  await mutate('/api/provider-groups/default-candidate', {
    revision: state.value!.revision,
    candidate: { provider, model }
  })
  await load()
}
async function open(provider?: ProviderView) {
  await notifications.run(async () => {
    keyVisibility.reset()
    originalId.value = provider?.id ?? ''
    if (provider) {
      const stored = await request('/api/providers/' + id(provider.id) + '/api-key', SecretValueSchema, {
        method: 'POST',
        data: { revision: state.value!.revision }
      })
      draft.value = ProviderDraftSchema.parse({ ...provider, apiKey: stored.value })
      draft.value.models = draft.value.models.map((model) => {
        return { ...model, originalId: model.id }
      })
    } else {
      draft.value = {
        ...ProviderDraftSchema.parse({ id: 'provider', baseUrl: 'https://example.com/v1' }),
        id: '',
        baseUrl: ''
      }
    }
    headers.value = JSON.stringify(draft.value.headers, null, 2)
    body.value = JSON.stringify(draft.value.body, null, 2)
    modelTexts.value = draft.value.models.map((model) => {
      return { headers: JSON.stringify(model.headers, null, 2), body: JSON.stringify(model.body, null, 2) }
    })
    availableModels.value = []
    selectedModels.value = []
    result.value = ''
    changes.clean()
    headerChanges.clean()
    bodyChanges.clean()
    modelChanges.clean()
    dialog.value = true
  })
}
function updateApiKey(value: string | null) {
  draft.value.apiKey = value ?? ''
  draft.value.clearApiKey = !value
}
function payload() {
  const models = draft.value.models.map((model, index) => {
    return {
      ...model,
      headers: JSON.parse(modelTexts.value[index].headers),
      body: JSON.parse(modelTexts.value[index].body)
    }
  })
  return ProviderDraftSchema.parse({
    ...draft.value,
    models,
    headers: JSON.parse(headers.value),
    body: JSON.parse(body.value)
  })
}
function addModel(name = 'new-model') {
  draft.value.models.push(ModelConfigSchema.parse({ id: name }))
  modelTexts.value.push({ headers: '{}', body: '{}' })
}
function removeModel(index: number) {
  draft.value.models.splice(index, 1)
  modelTexts.value.splice(index, 1)
}
async function save() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    let path = '/api/providers'
    let method = 'POST'
    if (originalId.value) {
      path += '/' + id(originalId.value)
      method = 'PUT'
    }
    await mutate(path, { revision: state.value!.revision, provider: payload() }, method)
    changes.clean()
    headerChanges.clean()
    bodyChanges.clean()
    modelChanges.clean()
    dialog.value = false
    await load()
  } finally {
    busy.value = false
  }
}
async function close() {
  if (
    (await changes.discard()) &&
    (await headerChanges.discard()) &&
    (await bodyChanges.discard()) &&
    (await modelChanges.discard())
  ) {
    changes.clean()
    headerChanges.clean()
    bodyChanges.clean()
    modelChanges.clean()
    dialog.value = false
  }
}
async function listModels() {
  const value = await request('/api/providers/models/list', RemoteModelsSchema, {
    method: 'POST',
    data: { revision: state.value!.revision, providerId: originalId.value || undefined, provider: payload() }
  })
  availableModels.value = value.models.map((model) => {
    return model.id
  })
}
function addModels() {
  for (const name of selectedModels.value) {
    if (
      !draft.value.models.some((model) => {
        return model.id === name
      })
    ) {
      addModel(name)
    }
  }
}
async function testModel(modelId: string) {
  const probe = await request('/api/providers/models/test', ModelProbeResultSchema, {
    method: 'POST',
    data: {
      revision: state.value!.revision,
      providerId: originalId.value || undefined,
      provider: payload(),
      modelId
    }
  })
  result.value = JSON.stringify(probe, null, 2)
}
async function removeProvider(provider: ProviderView) {
  if (await confirmAction('删除 Provider', provider.name ?? provider.id)) {
    await mutate('/api/providers/' + id(provider.id), { revision: state.value!.revision }, 'DELETE')
    await load()
  }
}
function openGroup(value?: ProviderGroup) {
  group.value = ProviderGroupSchema.parse(value ?? { id: 'group' })
  originalId.value = value?.id ?? ''
  groupChanges.clean()
  groupDialog.value = true
}
async function saveGroup() {
  let path = '/api/provider-groups'
  let method = 'POST'
  if (originalId.value) {
    path += '/' + id(originalId.value)
    method = 'PUT'
  }
  await mutate(path, { revision: state.value!.revision, group: group.value }, method)
  groupChanges.clean()
  groupDialog.value = false
  await load()
}
async function groupAction(value: ProviderGroup, action: string) {
  if (action === 'delete' && !(await confirmAction('删除模型组', value.id))) {
    return
  }
  let method = 'POST'
  let suffix = '/default'
  if (action === 'delete') {
    method = 'DELETE'
    suffix = ''
  }
  await mutate('/api/provider-groups/' + id(value.id) + suffix, { revision: state.value!.revision }, method)
  await load()
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <header class="pi-toolbar">
    <div class="pi-toolbar-title">模型与 Provider</div>
    <UiButton @click="notifications.run(load)">刷新</UiButton
    ><UiButton @click="open()" prepend-icon="mdi-plus">新增 Provider</UiButton>
  </header>
  <UiCard
    ><UiDataTable
      show-expand
      :items="state?.providers ?? []"
      :headers="[
        { title: 'Provider', key: 'id' },
        { title: '名称', key: 'name' },
        { title: '地址', key: 'baseUrl' },
        { title: '启用', key: 'enabled' },
        { title: '操作', key: 'actions' }
      ]"
      ><template #item.actions="{ item }"
        ><UiButton variant="text" @click="open(item)">配置</UiButton
        ><UiButton variant="text" color="error" @click="notifications.run(() => removeProvider(item))"
          >删除</UiButton
        ></template
      ><template #expanded-row="{ item, columns }"
        ><tr>
          <td :colspan="columns.length">
            <div class="pi-list">
              <UiListItem
                v-for="model in item.models"
                :key="model.id"
                :title="model.name || model.id"
                :subtitle="'上下文 ' + model.contextWindow + ' · 输出 ' + model.maxOutputTokens"
                ><template #append
                  ><UiButton variant="text" @click="notifications.run(() => setDefault(item.id, model.id))"
                    >设为主选模型</UiButton
                  ></template
                ></UiListItem
              >
            </div>
          </td>
        </tr></template
      ></UiDataTable
    ></UiCard
  >
  <UiCard title="模型组与故障转移"
    ><footer class="pi-actions">
      <UiChip>默认：{{ state?.defaultGroup }}</UiChip
      ><span class="pi-spacer" /><UiButton @click="openGroup()">新增模型组</UiButton>
    </footer>
    <UiDataTable
      :items="state?.groups ?? []"
      :headers="[
        { title: '组', key: 'id' },
        { title: '名称', key: 'name' },
        { title: '候选模型', key: 'candidates' },
        { title: '冷却毫秒', key: 'cooldownMs' },
        { title: '操作', key: 'actions' }
      ]"
      ><template #item.candidates="{ item }"
        ><UiChip
          v-for="candidate in item.candidates"
          :key="candidate.provider + candidate.model"
          size="small"
          class="ma-1"
          >{{ candidate.provider }}/{{ candidate.model }}</UiChip
        ></template
      ><template #item.actions="{ item }"
        ><UiButton variant="text" @click="openGroup(item)">编辑</UiButton
        ><UiButton variant="text" @click="notifications.run(() => groupAction(item, 'default'))"
          >设为默认</UiButton
        ><UiButton variant="text" color="error" @click="notifications.run(() => groupAction(item, 'delete'))"
          >删除</UiButton
        ></template
      ></UiDataTable
    ></UiCard
  >
  <UiDialog v-model="dialog" persistent max-width="1050"
    ><UiCard title="Provider 配置"
      ><div class="pi-section" :inert="busy">
        <div class="pi-row">
          <UiCol cols="12" md="6"
            ><UiText v-model="draft.id" label="ID" :disabled="Boolean(originalId)" /><UiText
              v-model="draft.name"
              label="名称" /><UiText v-model="draft.baseUrl" label="API 基址" /><UiText
              v-model.number="draft.timeoutMs"
              type="number"
              label="请求超时（毫秒）" /></UiCol
          ><UiCol cols="12" md="6"
            ><UiCheck v-model="draft.enabled" label="启用" /><UiText
              :model-value="draft.apiKey"
              @update:model-value="updateApiKey"
              label="API Key"
              aria-label="API Key"
              :type="keyVisibility.type.value"
              :append-inner-icon="keyVisibility.icon.value"
              @click:append-inner="keyVisibility.toggle"
              clearable
              autocomplete="new-password" /><UiText v-model="draft.apiKeyEnv" label="凭据环境变量（可选）"
          /></UiCol>
        </div>
        <section class="form-section">
          <h3 class="form-section-title">请求 Header 与 Body</h3>
          <div class="pi-row">
            <UiCol cols="12" md="6"
              ><UiText
                multiline
                v-model="headers"
                label="Header JSON（保留占位值表示原值不变）"
                rows="4" /></UiCol
            ><UiCol cols="12" md="6"><UiText multiline v-model="body" label="Body JSON" rows="4" /></UiCol>
          </div>
        </section>
        <header class="pi-toolbar">
          <div class="pi-toolbar-title">模型</div>
          <UiButton @click="notifications.run(listModels)">从服务拉取模型列表</UiButton
          ><UiButton @click="addModel()">手动添加</UiButton>
        </header>
        <UiChoice
          searchable
          v-if="availableModels.length"
          v-model="selectedModels"
          :items="availableModels"
          multiple
          label="选择模型"
          aria-label="选择模型"
        /><UiButton v-if="availableModels.length" @click="addModels">添加选中模型</UiButton>
        <div class="provider-models">
          <UiCard
            v-for="(model, index) in draft.models"
            :key="index"
            :title="model.name || model.id"
            class="mb-4"
            ><div class="pi-section">
              <div class="pi-row">
                <UiCol
                  ><UiText v-model="model.id" label="模型 ID" /><UiText
                    v-model="model.name"
                    label="显示名称" /></UiCol
                ><UiCol
                  ><UiText v-model.number="model.contextWindow" label="上下文窗口" type="number" /><UiText
                    v-model.number="model.maxOutputTokens"
                    label="最大输出 Token"
                    type="number"
                /></UiCol>
              </div>
              <div class="pi-row">
                <UiCol><UiCheck v-model="model.enabled" label="启用" /></UiCol
                ><UiCol><UiCheck v-model="model.reasoning" label="支持推理" /></UiCol
                ><UiCol><UiCheck v-model="model.images" label="支持图片" /></UiCol>
              </div>
              <UiText
                multiline
                v-model="modelTexts[index].headers"
                label="模型 Header JSON"
                rows="3"
              /><UiText multiline v-model="modelTexts[index].body" label="模型 Body JSON" rows="3" />
              <UiButton @click="notifications.run(() => testModel(model.id))">测试模型（会请求上游）</UiButton
              ><UiButton color="error" @click="removeModel(index)">删除模型</UiButton>
            </div></UiCard
          >
        </div>
        <pre v-if="result">{{ result }}</pre>
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="close">取消</UiButton
        ><UiButton variant="flat" :loading="busy" color="primary" @click="notifications.run(save)"
          >保存 Provider</UiButton
        >
      </footer></UiCard
    ></UiDialog
  >
  <UiDialog v-model="groupDialog" persistent max-width="750"
    ><UiCard title="模型组"
      ><div class="pi-section" :inert="busy">
        <UiText v-model="group.id" label="组 ID" :disabled="Boolean(originalId)" /><UiText
          v-model="group.name"
          label="名称"
        /><UiText v-model.number="group.cooldownMs" type="number" label="失败冷却（毫秒）" />
        <div class="pi-row" v-for="(candidate, index) in group.candidates" :key="index">
          <UiCol
            ><UiChoice
              v-model="candidate.provider"
              :items="state?.providers ?? []"
              item-title="id"
              item-value="id"
              label="Provider"
              aria-label="Provider" /></UiCol
          ><UiCol
            ><UiText
              v-model="candidate.model"
              :suggestions="
                state?.providers
                  .find((provider) => provider.id === candidate.provider)
                  ?.models.map((model) => model.id) ?? []
              "
              label="模型" /></UiCol
          ><UiCol cols="auto"
            ><UiButton
              icon="mdi-arrow-up"
              :disabled="index === 0"
              variant="text"
              aria-label="提高优先级"
              @click="group.candidates.splice(index - 1, 0, ...group.candidates.splice(index, 1))" /><UiButton
              icon="mdi-delete-outline"
              variant="text"
              aria-label="删除候选"
              @click="group.candidates.splice(index, 1)"
          /></UiCol>
        </div>
        <UiButton @click="group.candidates.push({ provider: '', model: '' })">添加候选模型</UiButton>
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton
          @click="
            groupChanges.discard().then((leave) => {
              if (leave) {
                groupChanges.clean()
                groupDialog = false
              }
            })
          "
          >取消</UiButton
        ><UiButton variant="flat" color="primary" @click="notifications.run(saveGroup)">保存模型组</UiButton>
      </footer></UiCard
    ></UiDialog
  >
</template>
