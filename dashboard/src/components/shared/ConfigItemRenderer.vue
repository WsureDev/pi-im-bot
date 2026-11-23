<template>
  <div class="w-100" :inert="Boolean(itemMeta?.readonly)">
    <UiText
      v-if="itemMeta?.secret && itemMeta.type !== 'list'"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :type="stringInputType"
      :append-inner-icon="secretToggleIcon"
      @click:append-inner="secretVisible = !secretVisible"
      autocomplete="new-password"
      clearable
      class="config-field"
      :disabled="itemMeta.readonly"
      :aria-label="itemMeta.description || configKey"
    />
    <ConfigFileItem
      v-else-if="itemMeta?.type === 'file'"
      :model-value="inputValue"
      :field="configPointer"
      :file-types="itemMeta.file_types"
      @update:model-value="emitUpdate"
    />
    <ListConfigItem
      v-else-if="itemMeta?.secret && itemMeta.type === 'list'"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :secret="true"
      class="config-field"
    />
    <div
      v-else-if="itemMeta?.type === 'list' && itemMeta?.options && itemMeta?.render_type === 'checkbox'"
      class="checkbox-group d-flex flex-wrap"
    >
      <UiCheck
        checkbox
        v-for="(option, optionIndex) in itemMeta.options"
        :key="optionIndex"
        :model-value="inputValue"
        @update:model-value="emitUpdate"
        :label="getLabel(itemMeta, optionIndex, option)"
        :value="option"
        class="config-checkbox"
      ></UiCheck>
    </div>

    <UiChoice
      searchable
      v-else-if="itemMeta?.type === 'list' && itemMeta?.options"
      :model-value="inputValue"
      @update:model-value="
        (val) => {
          emitUpdate(val)
          listSearchText = ''
        }
      "
      v-model:search="listSearchText"
      :items="listSelectItems"
      item-title="title"
      item-value="value"
      class="config-field"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
      multiple
    ></UiChoice>

    <UiChoice
      searchable
      v-else-if="itemMeta?.options"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :items="getSelectItems(itemMeta)"
      class="config-field"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
    ></UiChoice>

    <div v-else-if="itemMeta?.editor_mode" class="editor-container">
      <div class="pi-sheet editor-toolbar">
        <UiChip size="x-small" color="primary">{{ editorLanguage }}</UiChip>
        <span class="text-caption text-medium-emphasis">直接编辑内容</span>
        <span class="pi-spacer" />
        <UiButton
          v-if="showFullscreenBtn"
          size="small"
          variant="text"
          color="primary"
          prepend-icon="mdi-fullscreen"
          @click="$emit('open-fullscreen')"
          :aria-label="(itemMeta?.description || configKey) + ' · 全屏编辑'"
          >全屏编辑</UiButton
        >
      </div>
      <UiLazy class="editor-viewport" :min-height="280" :options="{ threshold: 0 }">
        <Suspense>
          <VueMonacoEditor
            width="100%"
            height="100%"
            :options="{
              readOnly: Boolean(itemMeta?.readonly),
              automaticLayout: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineHeight: 22,
              padding: { top: 12, bottom: 12 }
            }"
            :theme="editorTheme"
            :language="editorLanguage"
            :value="inputValue"
            @update:value="emitUpdate"
          />
          <template #fallback
            ><div height="280" class="pi-sheet d-flex align-center justify-center">
              <span class="pi-spinner" size="28" aria-label="加载编辑器" /></div
          ></template>
        </Suspense>
      </UiLazy>
    </div>

    <UiText
      v-else-if="itemMeta?.type === 'string'"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :type="stringInputType"
      :clearable="Boolean(itemMeta?.secret)"
      :append-inner-icon="secretToggleIcon"
      :autocomplete="itemMeta?.secret ? 'new-password' : undefined"
      @click:append-inner="secretVisible = !secretVisible"
      class="config-field"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
    ></UiText>

    <div v-else-if="itemMeta?.type === 'int' || itemMeta?.type === 'float'" class="d-flex align-center gap-3">
      <UiSlider
        :disabled="itemMeta?.readonly"
        :aria-label="(itemMeta?.description || configKey) + '滑块'"
        v-if="itemMeta?.slider"
        :model-value="toNumber(numericTemp ?? modelValue)"
        @update:model-value="
          (val) => {
            numericTemp = val
            emitUpdate(toNumber(val))
          }
        "
        @end="numericTemp = null"
        :min="itemMeta?.slider?.min ?? 0"
        :max="itemMeta?.slider?.max ?? 100"
        :step="itemMeta?.slider?.step ?? 1"
        style="flex: 1"
      ></UiSlider>
      <UiText
        :model-value="numericTemp ?? modelValue"
        @update:model-value="(val) => (numericTemp = val)"
        @blur="
          () => {
            if (numericTemp != null) {
              emitUpdate(toNumber(numericTemp))
            }
            numericTemp = null
          }
        "
        class="config-field"
        :min="itemMeta?.min ?? itemMeta?.slider?.min"
        :max="itemMeta?.max ?? itemMeta?.slider?.max"
        :step="itemMeta?.slider?.step"
        :disabled="itemMeta?.readonly"
        :aria-label="itemMeta?.description || configKey"
        type="number"
        style="flex: 1"
      ></UiText>
    </div>

    <UiText
      multiline
      v-else-if="itemMeta?.type === 'text'"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      rows="3"
      class="config-field"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
    ></UiText>

    <UiCheck
      v-else-if="itemMeta?.type === 'bool'"
      class="config-switch"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
    ></UiCheck>

    <ListConfigItem
      v-else-if="itemMeta?.type === 'list'"
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :secret="Boolean(itemMeta?.secret)"
      class="config-field"
    />

    <ObjectEditor
      v-else-if="itemMeta?.type === 'dict'"
      :model-value="inputValue"
      :item-meta="itemMeta"
      :plugin-name="pluginName"
      :plugin-i18n="pluginI18n"
      :config-key="configKey"
      @update:model-value="emitUpdate"
      class="config-field"
    />

    <UiText
      v-else
      :model-value="inputValue"
      @update:model-value="emitUpdate"
      :type="stringInputType"
      :clearable="Boolean(itemMeta?.secret)"
      :append-inner-icon="secretToggleIcon"
      :autocomplete="itemMeta?.secret ? 'new-password' : undefined"
      @click:append-inner="secretVisible = !secretVisible"
      class="config-field"
      :disabled="itemMeta?.readonly"
      :aria-label="itemMeta?.description || configKey"
    ></UiText>
  </div>
</template>

<script setup>
import UiButton from '@/ui/UiButton.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiLazy from '@/ui/UiLazy.vue'
import UiSlider from '@/ui/fields/UiSlider.vue'
import UiText from '@/ui/fields/UiText.vue'
import { VueMonacoEditor } from '@/composables/monaco'
import ListConfigItem from './ListConfigItem.vue'
import ConfigFileItem from './ConfigFileItem.vue'
import ObjectEditor from './ObjectEditor.vue'
import { computed, ref, inject, watch } from 'vue'
import { useAppearance } from '@/ui/appearance'
import { ConfigurationKey } from '@/api/plugin-configuration'
import { useI18n, useModuleI18n } from '@/i18n/composables'
import { usePluginI18n } from '@/utils/pluginI18n'

const configuration = inject(ConfigurationKey, null)
const inputValue = computed(() => {
  if (props.itemMeta?.secret && configuration) {
    const saved = configuration.draft.secrets[props.configPointer]
    if (saved) {
      return saved.value
    }
    if (props.itemMeta.type === 'list') {
      return []
    }
    return ''
  }
  return props.modelValue
})
watch(
  () => configuration?.view.revision,
  () => {
    secretVisible.value = false
  }
)
const numericTemp = ref(null)
const theme = useAppearance()
const editorTheme = computed(() => {
  if (props.itemMeta?.editor_theme) {
    return props.itemMeta.editor_theme
  }
  if (theme.dark.value) {
    return 'vs-dark'
  }
  return 'vs-light'
})
const editorLanguage = computed(() => {
  const language = props.itemMeta?.editor_language || 'json'
  if (language === 'text') {
    return 'plaintext'
  }
  return language
})
const listSearchText = ref('')
const secretVisible = ref(false)

const props = defineProps({
  configPointer: { type: String, default: '' },
  modelValue: {
    type: [String, Number, Boolean, Array, Object],
    default: null
  },
  itemMeta: {
    type: Object,
    default: null
  },
  pluginName: {
    type: String,
    default: ''
  },
  pluginI18n: {
    type: Object,
    default: () => ({})
  },
  configKey: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  },
  showFullscreenBtn: {
    type: Boolean,
    default: false
  },
  configRoot: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'get-embedding-dim', 'open-fullscreen'])
const { t } = useI18n()
const { getRaw } = useModuleI18n('features/config-metadata')
const { configText } = usePluginI18n()

function emitUpdate(val) {
  if (props.itemMeta?.secret && configuration) {
    let value = val ?? ''
    if (props.itemMeta.type === 'list' && !Array.isArray(value)) {
      value = []
    }
    let action = 'set'
    if (value.length === 0) {
      action = 'clear'
    }
    configuration.draft.secrets[props.configPointer] = { action, value }
    return
  }
  if (
    props.itemMeta?._special === 'agent_runner_type' &&
    props.configRoot?.agent_runner &&
    props.itemMeta?.runner_defaults?.[val]
  ) {
    props.configRoot.agent_runner.config = JSON.parse(JSON.stringify(props.itemMeta.runner_defaults[val]))
  }
  emit('update:modelValue', val)
}

const listSelectItems = computed(() =>
  props.itemMeta?.type === 'list' && props.itemMeta?.options ? getSelectItems(props.itemMeta) : []
)

const stringInputType = computed(() => (props.itemMeta?.secret && !secretVisible.value ? 'password' : 'text'))
const secretToggleIcon = computed(() => {
  if (!props.itemMeta?.secret) return undefined
  return secretVisible.value ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
})

function toNumber(val) {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

function getLabel(itemMeta, index, option) {
  const labels = getTranslatedLabels(itemMeta)
  return labels ? labels[index] : option
}

function getTranslatedLabels(itemMeta) {
  if (props.pluginName && props.configKey && props.pluginI18n && Object.keys(props.pluginI18n).length > 0) {
    const translatedLabels = configText(props.pluginI18n, props.configKey, 'labels', null)
    if (Array.isArray(translatedLabels)) {
      return translatedLabels
    }
  }
  if (!itemMeta?.labels) return null
  if (typeof itemMeta.labels === 'string') {
    const translatedLabels = getRaw(itemMeta.labels)
    if (Array.isArray(translatedLabels)) {
      return translatedLabels
    }
  }
  if (Array.isArray(itemMeta.labels)) {
    return itemMeta.labels
  }
  return null
}

function getSelectItems(itemMeta) {
  const labels = getTranslatedLabels(itemMeta)
  if (labels && itemMeta.options) {
    return itemMeta.options.map((value, index) => ({
      title: labels[index] || value,
      value: value
    }))
  }
  return itemMeta.options || []
}
</script>

<style scoped>
.config-field {
  margin-bottom: 0;
}

.editor-container {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgb(var(--pi-borderLight));
  border-radius: 10px;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 12px;
}
.editor-viewport {
  height: 280px;
  min-height: 280px;
  min-width: 0;
  width: 100%;
}

.checkbox-group {
  gap: 6px 12px;
}

.config-checkbox {
  margin-right: 0;
  min-height: 28px;
}

.config-checkbox :deep(label) {
  font-size: 0.9rem;
}

:deep(input) {
  font-size: 14px;
}

:deep(.config-field input[type='number']::-webkit-inner-spin-button),
:deep(.config-field input[type='number']::-webkit-outer-spin-button) {
  -webkit-appearance: none;
}

:deep(.config-field input[type='number']) {
  -moz-appearance: textfield;
}
</style>
