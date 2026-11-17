<script setup lang="ts">
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
  <v-toolbar color="transparent"
    ><v-toolbar-title>模型与 Provider</v-toolbar-title
    ><v-btn @click="notifications.run(load)">刷新</v-btn> ><v-btn @click="open()" prepend-icon="mdi-plus"
      >新增 Provider</v-btn
    ></v-toolbar
  >
  <v-card
    ><v-data-table
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
        ><v-btn variant="text" @click="open(item)">配置</v-btn
        ><v-btn variant="text" color="error" @click="notifications.run(() => removeProvider(item))"
          >删除</v-btn
        ></template
      ><template #expanded-row="{ item, columns }"
        ><tr>
          <td :colspan="columns.length">
            <v-list
              ><v-list-item
                v-for="model in item.models"
                :key="model.id"
                :title="model.name || model.id"
                :subtitle="'上下文 ' + model.contextWindow + ' · 输出 ' + model.maxOutputTokens"
                ><template #append
                  ><v-btn variant="text" @click="notifications.run(() => setDefault(item.id, model.id))"
                    >设为主选模型</v-btn
                  ></template
                ></v-list-item
              ></v-list
            >
          </td>
        </tr></template
      ></v-data-table
    ></v-card
  >
  <v-card title="模型组与故障转移"
    ><v-card-actions
      ><v-chip>默认：{{ state?.defaultGroup }}</v-chip
      ><v-spacer /><v-btn @click="openGroup()">新增模型组</v-btn></v-card-actions
    ><v-data-table
      :items="state?.groups ?? []"
      :headers="[
        { title: '组', key: 'id' },
        { title: '名称', key: 'name' },
        { title: '候选模型', key: 'candidates' },
        { title: '冷却毫秒', key: 'cooldownMs' },
        { title: '操作', key: 'actions' }
      ]"
      ><template #item.candidates="{ item }"
        ><v-chip
          v-for="candidate in item.candidates"
          :key="candidate.provider + candidate.model"
          size="small"
          class="ma-1"
          >{{ candidate.provider }}/{{ candidate.model }}</v-chip
        ></template
      ><template #item.actions="{ item }"
        ><v-btn variant="text" @click="openGroup(item)">编辑</v-btn
        ><v-btn variant="text" @click="notifications.run(() => groupAction(item, 'default'))">设为默认</v-btn
        ><v-btn variant="text" color="error" @click="notifications.run(() => groupAction(item, 'delete'))"
          >删除</v-btn
        ></template
      ></v-data-table
    ></v-card
  >
  <v-dialog v-model="dialog" persistent max-width="1050" scrollable
    ><v-card title="Provider 配置"
      ><v-card-text :inert="busy">
        <v-row
          ><v-col cols="12" md="6"
            ><v-text-field v-model="draft.id" label="ID" :disabled="Boolean(originalId)" /><v-text-field
              v-model="draft.name"
              label="名称" /><v-text-field v-model="draft.baseUrl" label="API 基址" /><v-text-field
              v-model.number="draft.timeoutMs"
              type="number"
              label="请求超时（毫秒）" /></v-col
          ><v-col cols="12" md="6"
            ><v-switch v-model="draft.enabled" label="启用" /><v-text-field
              :model-value="draft.apiKey"
              @update:model-value="updateApiKey"
              label="API Key"
              aria-label="API Key"
              :type="keyVisibility.type.value"
              :append-inner-icon="keyVisibility.icon.value"
              @click:append-inner="keyVisibility.toggle"
              clearable
              autocomplete="new-password" /><v-text-field
              v-model="draft.apiKeyEnv"
              label="凭据环境变量（可选）" /></v-col
        ></v-row>
        <section class="form-section">
          <h3 class="form-section-title">请求 Header 与 Body</h3>
          <v-row
            ><v-col cols="12" md="6"
              ><v-textarea v-model="headers" label="Header JSON（保留占位值表示原值不变）" rows="4" /></v-col
            ><v-col cols="12" md="6"><v-textarea v-model="body" label="Body JSON" rows="4" /></v-col
          ></v-row>
        </section>
        <v-toolbar color="transparent"
          ><v-toolbar-title>模型</v-toolbar-title
          ><v-btn @click="notifications.run(listModels)">从服务拉取模型列表</v-btn
          ><v-btn @click="addModel()">手动添加</v-btn></v-toolbar
        >
        <v-autocomplete
          v-if="availableModels.length"
          v-model="selectedModels"
          :items="availableModels"
          multiple
          chips
          label="选择模型"
          aria-label="选择模型"
        /><v-btn v-if="availableModels.length" @click="addModels">添加选中模型</v-btn>
        <div class="provider-models">
          <v-card
            v-for="(model, index) in draft.models"
            :key="index"
            :title="model.name || model.id"
            class="mb-4"
            ><v-card-text>
              <v-row
                ><v-col
                  ><v-text-field v-model="model.id" label="模型 ID" /><v-text-field
                    v-model="model.name"
                    label="显示名称" /></v-col
                ><v-col
                  ><v-text-field
                    v-model.number="model.contextWindow"
                    label="上下文窗口"
                    type="number" /><v-text-field
                    v-model.number="model.maxOutputTokens"
                    label="最大输出 Token"
                    type="number" /></v-col></v-row
              ><v-row
                ><v-col><v-switch v-model="model.enabled" label="启用" /></v-col
                ><v-col><v-switch v-model="model.reasoning" label="支持推理" /></v-col
                ><v-col><v-switch v-model="model.images" label="支持图片" /></v-col
              ></v-row>
              <v-textarea v-model="modelTexts[index].headers" label="模型 Header JSON" rows="3" /><v-textarea
                v-model="modelTexts[index].body"
                label="模型 Body JSON"
                rows="3"
              />
              <v-btn @click="notifications.run(() => testModel(model.id))">测试模型（会请求上游）</v-btn
              ><v-btn color="error" @click="removeModel(index)">删除模型</v-btn>
            </v-card-text></v-card
          >
        </div>
        <pre v-if="result">{{ result }}</pre></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="close">取消</v-btn
        ><v-btn variant="flat" :loading="busy" color="primary" @click="notifications.run(save)"
          >保存 Provider</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
  <v-dialog v-model="groupDialog" persistent max-width="750"
    ><v-card title="模型组"
      ><v-card-text :inert="busy"
        ><v-text-field v-model="group.id" label="组 ID" :disabled="Boolean(originalId)" /><v-text-field
          v-model="group.name"
          label="名称"
        /><v-text-field v-model.number="group.cooldownMs" type="number" label="失败冷却（毫秒）" />
        <v-row v-for="(candidate, index) in group.candidates" :key="index"
          ><v-col
            ><v-select
              v-model="candidate.provider"
              :items="state?.providers ?? []"
              item-title="id"
              item-value="id"
              label="Provider"
              aria-label="Provider" /></v-col
          ><v-col
            ><v-combobox
              v-model="candidate.model"
              :items="
                state?.providers
                  .find((provider) => provider.id === candidate.provider)
                  ?.models.map((model) => model.id) ?? []
              "
              label="模型" /></v-col
          ><v-col cols="auto"
            ><v-btn
              icon="mdi-arrow-up"
              :disabled="index === 0"
              variant="text"
              aria-label="提高优先级"
              @click="group.candidates.splice(index - 1, 0, ...group.candidates.splice(index, 1))" /><v-btn
              icon="mdi-delete-outline"
              variant="text"
              aria-label="删除候选"
              @click="group.candidates.splice(index, 1)" /></v-col></v-row
        ><v-btn @click="group.candidates.push({ provider: '', model: '' })">添加候选模型</v-btn> </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn
          @click="
            groupChanges.discard().then((leave) => {
              if (leave) {
                groupChanges.clean()
                groupDialog = false
              }
            })
          "
          >取消</v-btn
        ><v-btn variant="flat" color="primary" @click="notifications.run(saveGroup)"
          >保存模型组</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
