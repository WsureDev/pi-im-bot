<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, provide, ref, toRaw, watch } from 'vue'
import {
  FrameworkEditorSchema,
  RoomDetailSchema,
  type FrameworkEditorState,
  type RoomDetail
} from '@core/http/contracts'
import { SettingsSchema, SettingsPatchSchema, PersonaSchema, type SettingsPatch } from '@core/settings/schema'
import { RoomSchema } from '@core/domain/message'
import { ConversationSchema } from '@core/conversations/schema'
import { ConfigValuesSchema } from '@core/plugins/configuration/schema'
import { PluginConfigViewSchema, type PluginConfigView } from '@core/plugins/configuration/contracts'
import { mergeConfig } from '@core/plugins/configuration/values'
import { request, id } from '@/api/http'
import { settingsDefinition } from '@/api/settings-definition'
import {
  ConfigurationKey,
  createConfigurationDraft,
  configurationPayload,
  setConfigurationOverride,
  type ConfigurationDraft
} from '@/api/plugin-configuration'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { useDraft, mayLeave } from '@/composables/drafts'
import { settingsSections } from './settings/sections'
const workspace = useWorkspace()
const notifications = useNotifications()
const library = ref<FrameworkEditorState>()
const detail = ref<RoomDetail>()
const target = ref('defaults')
const configView = ref<PluginConfigView>()
const originalPatch = ref<SettingsPatch>({})
const draft = ref<ConfigurationDraft>({ values: {}, overrides: {}, secrets: {}, bindings: [] })
const changes = useDraft(draft)
const personae = ref<{ id: string; name: string; prompt: string }[]>([])
const personaChanges = useDraft(personae)
const busy = ref(false)
const toolbar = ref<HTMLElement>()
const activeSection = ref('preferences')
let sectionObserver: IntersectionObserver | undefined
const sections = computed(() => {
  return settingsSections(configView.value?.definition ?? {})
})
const navigation = computed(() => {
  const items = sections.value.map((section) => {
    return { key: section.key, title: section.title, icon: section.icon }
  })
  items.push({ key: 'personae', title: '人格库', icon: 'mdi-account-edit-outline' })
  if (detail.value) {
    items.push({ key: 'effective', title: '生效设置', icon: 'mdi-information-outline' })
  }
  return items
})
const targets = computed(() => {
  const result = [{ title: '全局默认', value: 'defaults' }]
  const accounts = new Set<string>()
  for (const room of workspace.snapshot?.rooms ?? []) {
    const key = JSON.stringify([room.address.channel, room.address.accountId])
    if (!accounts.has(key)) {
      accounts.add(key)
      result.push({
        title: '账号 · ' + room.address.channel + '/' + room.address.accountId,
        value: 'account:' + key
      })
    }
    result.push(
      { title: '渠道 · ' + room.name, value: 'room:' + room.id },
      { title: '会话 · ' + room.name, value: 'conversation:' + room.id }
    )
  }
  return result
})
function jumpToSection(key: string) {
  const element = document.getElementById('settings-' + key)
  if (!element) {
    return
  }
  activeSection.value = key
  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY - (toolbar.value?.offsetHeight ?? 80) - 88,
    behavior: 'smooth'
  })
}
async function observeSections() {
  await nextTick()
  sectionObserver?.disconnect()
  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => {
        return entry.isIntersecting
      })
      visible.sort((left, right) => {
        return left.boundingClientRect.top - right.boundingClientRect.top
      })
      const key = visible[0]?.target.getAttribute('id')
      if (key) {
        activeSection.value = key.slice('settings-'.length)
      }
    },
    { rootMargin: '-200px 0px -55% 0px' }
  )
  for (const element of document.querySelectorAll('.settings-section-card[id]')) {
    sectionObserver.observe(element)
  }
}
watch(configView, observeSections, { flush: 'post' })
onBeforeUnmount(() => {
  sectionObserver?.disconnect()
})
provide(ConfigurationKey, {
  get view() {
    return configView.value!
  },
  get draft() {
    return draft.value
  },
  canOverride() {
    return true
  },
  editable(path, field) {
    return !field.readonly && (target.value === 'defaults' || Boolean(draft.value.overrides[path]))
  },
  inherit(path, enabled) {
    if (configView.value) {
      setConfigurationOverride(configView.value, draft.value, path, enabled)
    }
  }
})
function values(settings: SettingsPatch) {
  const result = ConfigValuesSchema.parse(settings)
  if (settings.permissions) {
    result.permissions = JSON.stringify(settings.permissions, null, 2)
  }
  if (settings.resources) {
    const resources = ConfigValuesSchema.parse(result.resources)
    for (const key of ['tools', 'mcp', 'skills', 'plugins'] as const) {
      if (settings.resources[key]) {
        resources[key] = JSON.stringify(settings.resources[key], null, 2)
      }
    }
    result.resources = resources
  }
  return result
}
async function load(selected = target.value) {
  if (!(await mayLeave())) {
    return
  }
  busy.value = true
  try {
    if (!workspace.snapshot) {
      await workspace.refresh()
    }
    const next = await request('/api/framework', FrameworkEditorSchema)
    const definition = settingsDefinition(next, workspace.snapshot!)
    let inherited = values(next.config.defaults)
    let patch: SettingsPatch = next.config.defaults
    let scope: PluginConfigView['target'] = { level: 'instance' }
    detail.value = undefined
    if (selected.startsWith('account:')) {
      const [channel, accountId] = JSON.parse(selected.slice(8)) as [string, string]
      patch =
        next.config.accounts.find((entry) => {
          return entry.channel === channel && entry.accountId === accountId
        })?.settings ?? {}
      scope = { level: 'account', channel, accountId }
    } else if (selected !== 'defaults') {
      const [level, roomId] = selected.split(':', 2)
      const current = await request('/api/rooms/' + id(roomId), RoomDetailSchema)
      detail.value = current
      const account =
        next.config.accounts.find((entry) => {
          return (
            entry.channel === current.room.address.channel &&
            entry.accountId === current.room.address.accountId
          )
        })?.settings ?? {}
      inherited = mergeConfig(inherited, values(account), definition)
      patch = current.room.settings
      scope = { level: 'room', roomId }
      if (level === 'conversation') {
        inherited = mergeConfig(inherited, values(current.room.settings), definition)
        const conversation = current.conversations.find((entry) => {
          return entry.id === current.room.currentConversationId
        })!
        patch = conversation.settings
        scope = { level: 'conversation', roomId, conversationId: conversation.id }
      }
    }
    const view = PluginConfigViewSchema.parse({
      revision: next.version,
      release: '',
      target: scope,
      targets: [],
      definition,
      values: values(patch),
      inherited,
      secrets: [],
      issues: [],
      choices: { select_mcp: [], select_provider: [], select_model_group: [], select_persona: [] }
    })
    library.value = next
    originalPatch.value = patch
    configView.value = view
    draft.value = createConfigurationDraft(view)
    target.value = selected
    personae.value = structuredClone(next.config.personas)
    changes.clean()
    personaChanges.clean()
  } finally {
    busy.value = false
  }
}
async function save() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await saveRequest()
  } finally {
    busy.value = false
  }
}
async function saveRequest() {
  if (!library.value || !configView.value) {
    return
  }
  const payload = configurationPayload(configView.value, draft.value).values
  if (typeof payload.permissions === 'string') {
    payload.permissions = JSON.parse(payload.permissions)
  }
  if (payload.resources) {
    const resources = ConfigValuesSchema.parse(payload.resources)
    for (const key of ['tools', 'mcp', 'skills', 'plugins']) {
      const value = resources[key]
      if (typeof value === 'string') {
        resources[key] = JSON.parse(value)
      }
    }
    payload.resources = resources
  }
  const settings = SettingsPatchSchema.parse({ ...payload, extensions: originalPatch.value.extensions })
  const config = structuredClone(toRaw(library.value.config))
  if (target.value === 'defaults') {
    config.defaults = SettingsSchema.parse(settings)
    library.value = await request('/api/framework', FrameworkEditorSchema, {
      method: 'PUT',
      data: { version: library.value.version, config }
    })
  } else if (configView.value.target.level === 'account') {
    const selected = configView.value.target
    config.accounts = config.accounts.filter((entry) => {
      return entry.channel !== selected.channel || entry.accountId !== selected.accountId
    })
    config.accounts.push({ channel: selected.channel, accountId: selected.accountId, settings })
    library.value = await request('/api/framework', FrameworkEditorSchema, {
      method: 'PUT',
      data: { version: library.value.version, config }
    })
  } else if (detail.value) {
    let path = '/api/rooms/' + id(detail.value.room.id)
    let revision = detail.value.room.revision
    if (configView.value.target.level === 'conversation') {
      const conversationId = configView.value.target.conversationId
      const conversation = detail.value.conversations.find((entry) => {
        return entry.id === conversationId
      })!
      path += '/conversations/' + id(conversation.id)
      revision = conversation.revision
    }
    if (configView.value.target.level === 'conversation') {
      const saved = await request(path, ConversationSchema, { method: 'PATCH', data: { revision, settings } })
      const index = detail.value.conversations.findIndex((entry) => {
        return entry.id === saved.id
      })
      detail.value.conversations[index] = saved
    } else {
      detail.value.room = await request(path, RoomSchema, { method: 'PATCH', data: { revision, settings } })
    }
  }
  configView.value.revision = library.value.version
  configView.value.values = values(settings)
  originalPatch.value = settings
  changes.clean()
  notifications.show('设置已保存。')
  refreshEffective()
}
async function savePersonas() {
  if (busy.value) {
    return
  }
  busy.value = true
  try {
    await savePersonasRequest()
  } finally {
    busy.value = false
  }
}
async function savePersonasRequest() {
  if (!library.value) {
    return
  }
  const personas = personae.value.map((persona) => {
    return PersonaSchema.parse(persona)
  })
  library.value = await request('/api/framework', FrameworkEditorSchema, {
    method: 'PUT',
    data: { version: library.value.version, config: { ...library.value.config, personas } }
  })
  if (configView.value) {
    configView.value.revision = library.value.version
    configView.value.definition = settingsDefinition(library.value, workspace.snapshot!)
  }
  personaChanges.clean()
  notifications.show('人格已保存。')
  refreshEffective()
}
function refreshEffective() {
  if (!detail.value) {
    return
  }
  const roomId = detail.value.room.id
  void notifications.run(async () => {
    const current = await request('/api/rooms/' + id(roomId), RoomDetailSchema)
    if (detail.value?.room.id === roomId) {
      detail.value.effective = current.effective
    }
  })
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <div class="settings-page">
    <header class="settings-heading">
      <div>
        <h1 class="text-h5 font-weight-bold">Bot 设置</h1>
        <p class="text-body-2 text-medium-emphasis mt-2">
          配置回复行为、资源与权限。选择范围后，按需覆盖或恢复继承。
        </p>
      </div>
    </header>
    <div ref="toolbar" class="settings-toolbar">
      <v-card class="settings-toolbar-card" elevation="2">
        <v-card-text class="settings-toolbar-content">
          <v-select
            :model-value="target"
            @update:model-value="notifications.run(() => load($event))"
            :items="targets"
            label="设置范围"
            :disabled="busy"
            aria-label="设置范围"
            hide-details
            class="scope-select"
          />
          <div class="settings-toolbar-actions">
            <v-chip v-if="changes.dirty.value" color="warning" size="small" variant="tonal"
              >有未保存的设置</v-chip
            >
            <v-btn
              variant="text"
              prepend-icon="mdi-refresh"
              :disabled="busy"
              @click="notifications.run(() => load())"
              >刷新</v-btn
            >
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="mdi-content-save"
              :loading="busy"
              @click="notifications.run(save)"
              >保存设置</v-btn
            >
          </div>
        </v-card-text>
        <v-progress-linear v-if="busy" indeterminate color="primary" />
      </v-card>
    </div>
    <div class="settings-workspace">
      <nav class="settings-navigation" aria-label="设置分组导航">
        <div class="text-overline text-medium-emphasis px-3 mb-2">配置分组</div>
        <v-list nav density="compact" bg-color="transparent">
          <v-list-item
            v-for="item in navigation"
            :key="item.key"
            :title="item.title"
            :prepend-icon="item.icon"
            :active="activeSection === item.key"
            color="primary"
            @click="jumpToSection(item.key)"
          />
        </v-list>
      </nav>
      <div class="settings-main">
        <v-select
          class="settings-mobile-navigation"
          :model-value="activeSection"
          @update:model-value="jumpToSection($event)"
          :items="navigation"
          item-title="title"
          item-value="key"
          label="跳转到配置分组"
          aria-label="跳转到配置分组"
          hide-details
        />
        <template v-if="configView">
          <v-card
            v-for="section in sections"
            :key="section.key"
            :id="'settings-' + section.key"
            class="settings-section-card"
            :class="{ 'settings-section-card--single': section.single }"
          >
            <v-card-item class="settings-section-heading">
              <template #prepend
                ><v-avatar color="primary" variant="tonal" rounded="lg" size="36"
                  ><v-icon :icon="section.icon" size="20" /></v-avatar
              ></template>
              <v-card-title
                ><h2 class="text-subtitle-1 font-weight-bold">{{ section.heading }}</h2></v-card-title
              >
              <v-card-subtitle v-if="section.hint">{{ section.hint }}</v-card-subtitle>
            </v-card-item>
            <v-divider />
            <v-card-text :inert="busy" class="settings-section-fields">
              <AstrBotConfig
                :metadata="section.metadata"
                metadata-key="settings"
                :iterable="draft.values"
                :enable-default-reset="true"
                :disabled="busy"
                flat-objects
              />
            </v-card-text>
          </v-card>
        </template>
        <v-card id="settings-personae" class="settings-section-card">
          <v-card-item class="settings-section-heading">
            <template #prepend
              ><v-avatar color="primary" variant="tonal" rounded="lg" size="36"
                ><v-icon icon="mdi-account-edit-outline" size="20" /></v-avatar
            ></template>
            <v-card-title><h2 class="text-subtitle-1 font-weight-bold">人格库</h2></v-card-title>
            <v-card-subtitle>人格可供不同范围选择；在这里编辑名称与提示词。</v-card-subtitle>
          </v-card-item>
          <v-divider />
          <v-card-text :inert="busy">
            <v-sheet
              v-for="(persona, index) in personae"
              :key="index"
              class="persona-editor"
              rounded="lg"
              border
              color="inputBg"
            >
              <div class="d-flex align-center justify-space-between mb-4">
                <h3 class="text-subtitle-2">{{ persona.name || '新建人格' }}</h3>
                <v-btn
                  color="error"
                  variant="text"
                  size="small"
                  prepend-icon="mdi-delete-outline"
                  @click="personae.splice(index, 1)"
                  >删除人格</v-btn
                >
              </div>
              <v-row
                ><v-col cols="12" sm="6"
                  ><v-text-field v-model="persona.id" label="人格 ID" hide-details /></v-col
                ><v-col cols="12" sm="6"
                  ><v-text-field v-model="persona.name" label="名称" hide-details /></v-col
              ></v-row>
              <v-textarea v-model="persona.prompt" label="人格提示词" rows="6" class="mt-5" hide-details />
            </v-sheet>
            <v-alert v-if="!personae.length" type="info" variant="tonal"
              >添加一个人格后即可填写提示词。</v-alert
            >
          </v-card-text>
          <v-card-actions class="pa-4"
            ><v-btn
              variant="tonal"
              prepend-icon="mdi-plus"
              :disabled="busy"
              @click="personae.push({ id: '', name: '', prompt: '' })"
              >新增人格</v-btn
            ><v-spacer /><v-chip v-if="personaChanges.dirty.value" color="warning" size="small"
              >人格有未保存的修改</v-chip
            ><v-btn color="primary" variant="flat" :loading="busy" @click="notifications.run(savePersonas)"
              >保存人格库</v-btn
            ></v-card-actions
          >
        </v-card>
        <v-card v-if="detail" id="settings-effective" class="settings-section-card" title="最终生效值与来源">
          <v-card-text
            ><v-table density="comfortable"
              ><thead>
                <tr>
                  <th>设置项</th>
                  <th>生效来源</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(source, key) in detail.effective.sources" :key="key">
                  <td>{{ key }}</td>
                  <td>{{ source }}</td>
                </tr>
              </tbody></v-table
            >
            <v-expansion-panels class="mt-4" variant="accordion"
              ><v-expansion-panel title="查看原始生效数据"
                ><v-expansion-panel-text>
                  <pre>{{ JSON.stringify(detail.effective, null, 2) }}</pre>
                </v-expansion-panel-text></v-expansion-panel
              ></v-expansion-panels
            >
          </v-card-text>
        </v-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1320px;
  margin-inline: auto;
}
.settings-heading {
  padding: 8px 0 24px;
  color: rgb(var(--v-theme-primaryText));
}
.settings-toolbar {
  position: sticky;
  top: 76px;
  z-index: 5;
  margin-bottom: 24px;
}
.settings-toolbar-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
}
.scope-select {
  flex: 1;
  max-width: 500px;
  min-width: 220px;
}
.settings-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.settings-workspace {
  display: grid;
  grid-template-columns: 164px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.settings-navigation {
  position: sticky;
  top: 180px;
}
.settings-main {
  min-width: 0;
}
.settings-mobile-navigation {
  display: none;
}
.settings-section-card {
  margin: 0 0 24px !important;
  overflow: hidden;
}
.settings-section-heading {
  background: rgba(var(--v-theme-primary), 0.035);
  padding: 18px 20px;
}
.settings-section-fields {
  padding: 8px 16px 16px;
}
.settings-section-card--single :deep(.property-info) {
  display: none;
}
.settings-section-card--single :deep(.config-row--editor) {
  padding-top: 8px;
}
.settings-main :deep(.property-info .v-list-item) {
  padding-left: 0;
}
.persona-editor {
  padding: 18px;
  margin-bottom: 16px;
}
.persona-editor:last-child {
  margin-bottom: 0;
}
@media (max-width: 1100px) {
  .settings-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-navigation {
    display: none;
  }
  .settings-mobile-navigation {
    display: block;
    margin-bottom: 20px;
  }
}
@media (max-width: 600px) {
  .settings-heading {
    padding-bottom: 16px;
  }
  .settings-toolbar {
    top: 68px;
    margin-bottom: 16px;
  }
  .settings-toolbar-content {
    flex-wrap: wrap;
    padding: 12px;
    gap: 10px;
  }
  .scope-select {
    min-width: 0;
    flex-basis: 100%;
    max-width: none;
  }
  .settings-toolbar-actions {
    width: 100%;
  }
  .settings-section-heading {
    padding: 14px;
  }
  .settings-section-fields {
    padding: 4px 12px 12px;
  }
  .persona-editor {
    padding: 12px;
  }
}
</style>
