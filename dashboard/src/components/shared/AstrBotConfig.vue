<script setup>
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiListItem from '@/ui/UiListItem.vue'
import { VueMonacoEditor } from '@/composables/monaco'
import { ref, computed, inject } from 'vue'
import { useAppearance } from '@/ui/appearance'
import { ConfigurationKey, pointer } from '@/api/plugin-configuration'
import ConfigItemRenderer from './ConfigItemRenderer.vue'
import ConfigDefaultReset from './ConfigDefaultReset.vue'
import TemplateListEditor from './TemplateListEditor.vue'
import { useI18n, useModuleI18n } from '@/i18n/composables'
import { useConfigTextResolver } from '@/composables/useConfigTextResolver'
import { useToast } from '@/utils/toast'

const props = defineProps({
  flatObjects: { type: Boolean, default: false },
  pointerPrefix: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  metadata: {
    type: Object,
    required: true
  },
  iterable: {
    type: Object,
    required: true
  },
  metadataKey: {
    type: String,
    required: true
  },
  pluginName: {
    type: String,
    default: ''
  },
  pluginI18n: {
    type: Object,
    default: () => ({})
  },
  pathPrefix: {
    type: String,
    default: ''
  },
  isEditing: {
    type: Boolean,
    default: false
  },
  enableDefaultReset: {
    type: Boolean,
    default: false
  },
  fieldLinks: {
    type: Object,
    default: () => ({})
  }
})

const { t } = useI18n()
const theme = useAppearance()
const fullscreenTheme = computed(() => {
  if (currentEditingTheme.value) {
    return currentEditingTheme.value
  }
  if (theme.dark.value) {
    return 'vs-dark'
  }
  return 'vs-light'
})
const { getRaw } = useModuleI18n('features/config-metadata')
const { translateIfKey, resolveConfigText } = useConfigTextResolver(props)
const currentConfigPath = computed(() => props.pathPrefix || props.metadataKey)

const filteredIterable = computed(() => props.metadata[props.metadataKey]?.items || {})
const configuration = inject(ConfigurationKey, null)
function fieldPointer(key) {
  return pointer(props.pointerPrefix, String(key))
}
function fieldMeta(key) {
  const field = props.metadata[props.metadataKey].items[key]
  return {
    ...field,
    readonly:
      props.disabled ||
      field.readonly ||
      Boolean(configuration && !configuration.editable(fieldPointer(key), field))
  }
}
function overrideEnabled(key) {
  return Boolean(configuration?.draft.overrides[fieldPointer(key)])
}
function changeOverride(key, enabled) {
  configuration?.inherit(fieldPointer(key), Boolean(enabled))
}
function resetField(key, value) {
  const field = props.metadata[props.metadataKey].items[key]
  if (field.secret && configuration) {
    configuration.draft.secrets[fieldPointer(key)] = { action: 'set', value }
    return
  }
  props.iterable[key] = value
}
function scopedField(key) {
  const field = props.metadata[props.metadataKey].items[key]
  return (
    configuration &&
    configuration.view.target.level !== 'instance' &&
    field.type !== 'object' &&
    !props.pointerPrefix.includes('/@')
  )
}
function fieldColumns(field, width = 6) {
  if (field?.editor_mode) {
    return 12
  }
  return width
}

const providerHint = computed(() => {
  const hint = props.iterable?.hint
  if (typeof hint !== 'string' || !hint) return ''

  if (
    hint === 'provider_group.provider.openai_embedding.hint' ||
    hint === 'provider_group.provider.gemini_embedding.hint'
  ) {
    return ''
  }

  return hint
})

const getItemHint = (itemKey, itemMeta) => {
  if (itemMeta?.hint) return itemMeta.hint

  if (itemKey !== 'embedding_api_base') return ''

  const providerType = props.iterable?.type
  if (providerType === 'openai_embedding') {
    return getRaw('provider_group.provider.openai_embedding.hint')
      ? 'provider_group.provider.openai_embedding.hint'
      : ''
  }
  if (providerType === 'gemini_embedding') {
    return getRaw('provider_group.provider.gemini_embedding.hint')
      ? 'provider_group.provider.gemini_embedding.hint'
      : ''
  }

  return ''
}

const dialog = ref(false)
const currentEditingKey = ref('')
const currentEditingLanguage = ref('json')
const currentEditingTheme = ref('')
let currentEditingKeyIterable = null
const loadingEmbeddingDim = ref(false)

function openEditorDialog(key, value, theme, language) {
  currentEditingKey.value = key
  currentEditingLanguage.value = language || 'json'
  if (currentEditingLanguage.value === 'text') {
    currentEditingLanguage.value = 'plaintext'
  }
  currentEditingTheme.value = theme || ''
  currentEditingKeyIterable = value
  dialog.value = true
}

function saveEditedContent() {
  dialog.value = false
}

function getValueBySelector(obj, selector) {
  const keys = selector.split('.')
  let current = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key]
    } else {
      return undefined
    }
  }
  return current
}

function shouldShowItem(itemMeta, itemKey) {
  if (!itemMeta?.condition) {
    return true
  }
  for (const [conditionKey, expectedValue] of Object.entries(itemMeta.condition)) {
    const actualValue = getValueBySelector(props.iterable, conditionKey)
    if (actualValue !== expectedValue) {
      return false
    }
  }
  return true
}

function getItemPath(key) {
  return props.pathPrefix ? `${props.pathPrefix}.${key}` : key
}

function hasVisibleItemsAfter(items, currentIndex) {
  const itemEntries = Object.entries(items)

  // 检查当前索引之后是否还有可见的配置项
  for (let i = currentIndex + 1; i < itemEntries.length; i++) {
    const [itemKey, itemValue] = itemEntries[i]
    const itemMeta = props.metadata[props.metadataKey].items[itemKey]
    if (!itemMeta?.invisible && shouldShowItem(itemMeta, itemKey)) {
      return true
    }
  }

  return false
}
</script>

<template>
  <div
    class="config-section"
    v-if="
      iterable &&
      metadata[metadataKey]?.type === 'object' &&
      (metadata[metadataKey]?.description || metadata[metadataKey]?.hint)
    "
  >
    <div class="pi-list-title config-title">
      {{ resolveConfigText(currentConfigPath, 'description', metadata[metadataKey]?.description) }}
      <span v-if="metadata[metadataKey]?.show_key" class="metadata-key">({{ metadataKey }})</span>
    </div>
    <div class="pi-subtitle config-hint">
      <span v-if="metadata[metadataKey]?.obvious_hint && metadata[metadataKey]?.hint" class="important-hint"
        >‼️</span
      >
      {{ resolveConfigText(currentConfigPath, 'hint', metadata[metadataKey]?.hint) }}
    </div>
  </div>

  <div class="pi-section px-0 py-1">
    <!-- Object Type Configuration -->
    <div
      v-if="metadata[metadataKey]?.type === 'object' || metadata[metadataKey]?.config_template"
      class="object-config"
    >
      <!-- Provider-level hint -->
      <div v-if="providerHint" data-tone="info" class="pi-alert mb-4">
        {{ translateIfKey(providerHint) }}
      </div>

      <div
        v-for="(val, key, index) in filteredIterable"
        :key="key"
        class="config-item"
        :data-config-path="getItemPath(key)"
      >
        <!-- Nested Object -->
        <div
          v-if="metadata[metadataKey].items[key]?.type === 'object'"
          class="nested-object"
          :class="{ 'nested-object--flat': flatObjects }"
        >
          <div
            v-if="
              metadata[metadataKey].items[key] &&
              !metadata[metadataKey].items[key]?.invisible &&
              shouldShowItem(metadata[metadataKey].items[key], key)
            "
            class="nested-container"
            :class="{ 'nested-container--flat': flatObjects }"
          >
            <Transition>
              <AstrBotConfig
                :metadata="metadata[metadataKey].items"
                :iterable="iterable[key]"
                :metadataKey="key"
                :pluginName="pluginName"
                :pluginI18n="pluginI18n"
                :pathPrefix="getItemPath(key)"
                :pointer-prefix="fieldPointer(key)"
                :disabled="disabled || metadata[metadataKey].items[key]?.readonly"
                :enable-default-reset="enableDefaultReset"
              >
              </AstrBotConfig>
            </Transition>
          </div>
        </div>

        <!-- Template List -->
        <div
          v-else-if="metadata[metadataKey].items[key]?.type === 'template_list'"
          class="nested-object w-100"
        >
          <div
            v-if="
              !metadata[metadataKey].items[key]?.invisible &&
              shouldShowItem(metadata[metadataKey].items[key], key)
            "
            class="nested-container"
          >
            <div class="config-section mb-2">
              <div class="pi-list-title config-title">
                <span v-if="metadata[metadataKey].items[key]?.description">
                  {{
                    resolveConfigText(
                      getItemPath(key),
                      'description',
                      metadata[metadataKey].items[key]?.description
                    )
                  }}
                  <span v-if="metadata[metadataKey].items[key]?.show_key" class="property-key"
                    >({{ key }})</span
                  >
                </span>
                <span v-else>{{ key }}</span>
              </div>
              <div class="pi-subtitle config-hint">
                <span
                  v-if="
                    metadata[metadataKey].items[key]?.obvious_hint && metadata[metadataKey].items[key]?.hint
                  "
                  class="important-hint"
                  >‼️</span
                >
                {{ resolveConfigText(getItemPath(key), 'hint', metadata[metadataKey].items[key]?.hint) }}
              </div>
            </div>
            <UiCheck
              checkbox
              v-if="scopedField(key)"
              :model-value="overrideEnabled(key)"
              @update:model-value="changeOverride(key, $event)"
              :disabled="!configuration.canOverride(metadata[metadataKey].items[key]) || disabled"
              label="在此范围覆盖（关闭后恢复继承）"
            />
            <ConfigDefaultReset
              :model-value="iterable[key]"
              :item-meta="fieldMeta(key)"
              :enabled="enableDefaultReset && !disabled"
              @reset="resetField(key, $event)"
            >
              <TemplateListEditor
                :disabled="disabled || fieldMeta(key).readonly"
                v-model="iterable[key]"
                :templates="metadata[metadataKey].items[key]?.templates || {}"
                :plugin-name="pluginName"
                :plugin-i18n="pluginI18n"
                :config-path="getItemPath(key)"
                :config-pointer="fieldPointer(key)"
                class="config-field"
              />
            </ConfigDefaultReset>
          </div>
        </div>

        <!-- Regular Property -->
        <template v-else>
          <div
            v-if="
              !metadata[metadataKey].items[key]?.invisible &&
              shouldShowItem(metadata[metadataKey].items[key], key)
            "
            class="pi-row config-row"
            :class="{ 'config-row--editor': metadata[metadataKey].items[key]?.editor_mode }"
          >
            <UiCol cols="12" :sm="fieldColumns(metadata[metadataKey].items[key])" class="property-info">
              <UiListItem>
                <div class="pi-list-title property-name">
                  <span v-if="metadata[metadataKey].items[key]?.description">
                    {{
                      resolveConfigText(
                        getItemPath(key),
                        'description',
                        metadata[metadataKey].items[key]?.description
                      )
                    }}
                    <span v-if="metadata[metadataKey].items[key]?.show_key" class="property-key"
                      >({{ key }})</span
                    >
                  </span>
                  <span v-else>{{ key }}</span>
                </div>

                <div class="pi-subtitle property-hint">
                  <span :class="{ 'property-hint__content--linked': fieldLinks[key] }">
                    <span
                      v-if="
                        metadata[metadataKey].items[key]?.obvious_hint &&
                        getItemHint(key, metadata[metadataKey].items[key])
                      "
                      class="important-hint"
                      >‼️</span
                    >
                    <span>{{
                      resolveConfigText(
                        getItemPath(key),
                        'hint',
                        getItemHint(key, metadata[metadataKey].items[key])
                      )
                    }}</span>
                    <a
                      v-if="fieldLinks[key]"
                      class="property-link"
                      :href="fieldLinks[key].href"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click.stop
                      >{{ fieldLinks[key].label }}</a
                    >
                  </span>
                </div>
              </UiListItem>
            </UiCol>

            <UiCol cols="12" :sm="fieldColumns(metadata[metadataKey].items[key])" class="config-input">
              <UiCheck
                checkbox
                v-if="scopedField(key)"
                :model-value="overrideEnabled(key)"
                @update:model-value="changeOverride(key, $event)"
                :disabled="!configuration.canOverride(metadata[metadataKey].items[key]) || disabled"
                label="在此范围覆盖（关闭后恢复继承）"
              />
              <UiChip v-if="scopedField(key) && !overrideEnabled(key)" size="small" class="mb-2"
                >继承上级配置</UiChip
              >
              <ConfigDefaultReset
                :model-value="iterable[key]"
                :item-meta="fieldMeta(key)"
                :enabled="enableDefaultReset && !disabled"
                @reset="resetField(key, $event)"
              >
                <ConfigItemRenderer
                  v-model="iterable[key]"
                  :item-meta="fieldMeta(key)"
                  :plugin-name="pluginName"
                  :plugin-i18n="pluginI18n"
                  :config-key="getItemPath(key)"
                  :config-pointer="fieldPointer(key)"
                  :loading="loadingEmbeddingDim"
                  :show-fullscreen-btn="!!metadata[metadataKey].items[key]?.editor_mode"
                  @open-fullscreen="
                    openEditorDialog(
                      key,
                      iterable,
                      metadata[metadataKey].items[key]?.editor_theme,
                      metadata[metadataKey].items[key]?.editor_language
                    )
                  "
                />
              </ConfigDefaultReset>
            </UiCol>
          </div>

          <hr
            v-if="
              hasVisibleItemsAfter(filteredIterable, index) &&
              !metadata[metadataKey].items[key]?.invisible &&
              shouldShowItem(metadata[metadataKey].items[key], key)
            "
            class="pi-divider config-divider"
          />
        </template>
      </div>
    </div>

    <!-- Simple Value Configuration -->
    <div v-else class="simple-config">
      <div class="pi-row config-row">
        <UiCol cols="12" :sm="fieldColumns(metadata[metadataKey], 7)" class="property-info">
          <UiListItem>
            <div class="pi-list-title property-name">
              {{
                resolveConfigText(getItemPath(metadataKey), 'description', metadata[metadataKey]?.description)
              }}
              <span v-if="metadata[metadataKey]?.show_key" class="property-key">({{ metadataKey }})</span>
            </div>

            <div class="pi-subtitle property-hint">
              <span
                v-if="metadata[metadataKey]?.obvious_hint && metadata[metadataKey]?.hint"
                class="important-hint"
                >‼️</span
              >
              {{ resolveConfigText(getItemPath(metadataKey), 'hint', metadata[metadataKey]?.hint) }}
            </div>
          </UiListItem>
        </UiCol>

        <UiCol cols="12" :sm="fieldColumns(metadata[metadataKey], 5)" class="config-input">
          <ConfigDefaultReset
            :model-value="iterable[metadataKey]"
            :item-meta="metadata[metadataKey]"
            :enabled="enableDefaultReset && !disabled"
            @reset="iterable[metadataKey] = $event"
          >
            <TemplateListEditor
              :disabled="disabled || metadata[metadataKey]?.readonly"
              v-if="metadata[metadataKey]?.type === 'template_list' && !metadata[metadataKey]?.invisible"
              v-model="iterable[metadataKey]"
              :templates="metadata[metadataKey]?.templates || {}"
              :plugin-name="pluginName"
              :plugin-i18n="pluginI18n"
              :config-path="getItemPath(metadataKey)"
              class="config-field"
            />
            <ConfigItemRenderer
              v-else
              v-model="iterable[metadataKey]"
              :item-meta="metadata[metadataKey]"
              :plugin-name="pluginName"
              :plugin-i18n="pluginI18n"
              :config-key="getItemPath(metadataKey)"
            />
          </ConfigDefaultReset>
        </UiCol>
      </div>

      <hr class="pi-divider my-2 config-divider" />
    </div>
  </div>

  <!-- Full Screen Editor Dialog -->
  <UiDialog v-model="dialog" fullscreen>
    <UiCard class="fullscreen-editor">
      <header class="pi-toolbar">
        <UiButton icon variant="text" color="on-primary" aria-label="返回配置" @click="dialog = false">
          <UiIcon icon="mdi-close"></UiIcon>
        </UiButton>
        <div class="pi-toolbar-title">
          {{ t('core.common.editor.editingTitle') }} - {{ currentEditingKey }}
        </div>
        <span class="pi-spacer"></span>
        <div class="pi-toolbar-items">
          <UiButton variant="tonal" color="on-primary" @click="saveEditedContent">完成编辑</UiButton>
        </div>
      </header>
      <div class="pi-section pa-0 editor-dialog-body">
        <VueMonacoEditor
          :theme="fullscreenTheme"
          :language="currentEditingLanguage"
          height="100%"
          width="100%"
          :options="{
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            readOnly: disabled
          }"
          v-model:value="currentEditingKeyIterable[currentEditingKey]"
        >
        </VueMonacoEditor>
      </div>
    </UiCard>
  </UiDialog>
</template>

<style scoped>
.config-section {
  margin-bottom: 12px;
}

.config-title {
  font-weight: 600;
  font-size: 1rem;
  color: rgb(var(--pi-primaryText));
}

.config-hint {
  font-size: 0.75rem;
  color: rgb(var(--pi-secondaryText));
  margin-top: 2px;
  opacity: 1;
}

.metadata-key,
.property-key {
  color: rgba(var(--pi-on-surface), 0.45);
  font-size: 0.82em;
  font-weight: normal;
  margin-left: 4px;
}

.important-hint {
  opacity: 1;
  margin-right: 4px;
}

.object-config,
.simple-config {
  width: 100%;
}

.config-item {
  margin-bottom: 2px;
}

.nested-object {
  padding-left: 16px;
}

.nested-container {
  border: 1px solid rgb(var(--pi-borderLight));
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  background-color: rgba(var(--pi-primary), 0.025);
}
.nested-object--flat {
  padding: 0;
}
.nested-container--flat {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  margin: 0;
}

.config-row {
  margin: 0;
  align-items: center;
  padding: 12px 4px;
  border-radius: 4px;
}

.config-row:hover {
  background-color: rgba(var(--pi-primary), 0.025);
}
.config-row--editor {
  align-items: flex-start;
}
.config-row--editor .property-info {
  padding-bottom: 12px;
}

.property-info {
  padding: 0;
}

.property-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--pi-primaryText));
  white-space: normal;
}

.property-link {
  color: rgb(var(--pi-primary));
  font-size: 0.75rem;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}

.property-link:hover {
  text-decoration: underline;
}

.property-hint {
  font-size: 0.75rem;
  color: rgb(var(--pi-secondaryText));
  margin-top: 2px;
  display: block;
  overflow: visible;
  white-space: normal;
  -webkit-line-clamp: unset;
  line-height: 1.5;
  opacity: 1;
}

.property-hint__content--linked {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.type-indicator {
  display: flex;
  justify-content: center;
}

.config-input {
  padding: 4px 8px;
}
.config-row:not(.config-row--editor) :deep(.config-default-reset) {
  max-width: 360px;
  margin-left: auto;
}
@media (min-width: 600px) {
  .config-input :deep(.config-switch) {
    display: flex;
    justify-content: flex-end;
  }
}

.config-field {
  margin-bottom: 0;
}

.config-divider {
  border-color: rgb(var(--pi-borderLight));
  margin: 0px 16px;
}
.fullscreen-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.editor-dialog-body {
  height: calc(100dvh - 64px);
  min-height: 0;
  overflow: hidden;
}

.editor-container {
  position: relative;
  display: flex;
  width: 100%;
}

.editor-fullscreen-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.editor-fullscreen-btn:hover {
  background-color: rgba(0, 0, 0, 0.5);
}

@media (max-width: 600px) {
  .nested-object {
    padding-left: 8px;
  }

  .config-row {
    padding: 8px 0;
  }

  .property-info {
    padding: 4px 4px;
  }

  .property-info :deep(.pi-list-item) {
    padding-inline: 0;
  }

  .type-indicator,
  .config-input {
    padding: 4px;
  }

  .config-divider {
    display: none;
  }
}
</style>
