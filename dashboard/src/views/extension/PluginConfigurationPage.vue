<script setup lang="ts">
import { computed, ref, provide, onMounted, toRaw } from 'vue'
import {
  PluginConfigViewSchema,
  type PluginConfigView,
  type PluginConfigTarget
} from '@core/plugins/configuration/contracts'
import type { ConfigField } from '@core/plugins/configuration/schema'
import { containsConfigSecrets } from '@core/plugins/configuration/values'
import { request, id, ApiError } from '@/api/http'
import {
  ConfigurationKey,
  createConfigurationDraft,
  readConfigurationSecrets,
  configurationDefinition,
  configurationPayload,
  setConfigurationOverride,
  type ConfigurationDraft
} from '@/api/plugin-configuration'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
import { useDraft } from '@/composables/drafts'
import { useNotifications } from '@/stores/notifications'

const props = defineProps<{ pluginId: string }>()
const emit = defineEmits<{ (event: 'saved'): void }>()
const notifications = useNotifications()
const view = ref<PluginConfigView>()
const draft = ref<ConfigurationDraft>({ values: {}, secrets: {}, overrides: {}, bindings: [] })
const changes = useDraft(draft)
const busy = ref(false)
const error = ref('')
const issues = ref<{ path: string; message: string }[]>([])
const target = computed(() => {
  return JSON.stringify(view.value?.target ?? { level: 'instance' })
})
const metadata = computed(() => {
  if (!view.value) {
    return {}
  }
  return {
    plugin: { type: 'object', items: configurationDefinition(toRaw(view.value), toRaw(draft.value.values)) }
  }
})
function canOverride(field: ConfigField) {
  return Boolean(
    view.value &&
      field.scope.includes(view.value.target.level) &&
      !field.readonly &&
      !containsConfigSecrets({ field })
  )
}
provide(ConfigurationKey, {
  get view() {
    return view.value!
  },
  get draft() {
    return draft.value
  },
  canOverride,
  editable(path, field) {
    if (field.readonly) {
      return false
    }
    if (view.value?.target.level === 'instance') {
      return true
    }
    if (path.includes('/@')) {
      return Boolean(draft.value.overrides[path.split('/@')[0]])
    }
    return canOverride(field) && Boolean(draft.value.overrides[path])
  },
  inherit(path, enabled) {
    if (view.value) {
      setConfigurationOverride(view.value, draft.value, path, enabled)
    }
  }
})
async function load(selected: PluginConfigTarget = { level: 'instance' }) {
  if (!(await changes.discard())) {
    return
  }
  busy.value = true
  try {
    const query = new URLSearchParams(selected)
    const next = await request(
      '/api/plugins/' + id(props.pluginId) + '/configuration?' + query,
      PluginConfigViewSchema
    )
    const nextDraft = createConfigurationDraft(
      next,
      await readConfigurationSecrets('/api/plugins/' + id(props.pluginId) + '/configuration', next)
    )
    view.value = next
    draft.value = nextDraft
    issues.value = next.issues
    error.value = ''
    changes.clean()
  } finally {
    busy.value = false
  }
}
async function selectTarget(value: string) {
  const selected = view.value?.targets.find((entry) => {
    return JSON.stringify(entry.target) === value
  })
  if (selected) {
    await load(selected.target)
  }
}
async function save() {
  if (!view.value || busy.value) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    const next = await request(
      '/api/plugins/' + id(props.pluginId) + '/configuration',
      PluginConfigViewSchema,
      { method: 'PUT', data: configurationPayload(view.value, draft.value) }
    )
    const nextDraft = createConfigurationDraft(
      next,
      await readConfigurationSecrets('/api/plugins/' + id(props.pluginId) + '/configuration', next)
    )
    view.value = next
    draft.value = nextDraft
    issues.value = next.issues
    changes.clean()
    emit('saved')
    notifications.show('插件配置已保存。')
  } catch (reason) {
    error.value = String(reason)
    if (reason instanceof ApiError) {
      issues.value = reason.issues
      if (reason.status === 409) {
        error.value += ' 当前草稿已保留；核对服务器的新版本后再保存。'
      }
    }
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void notifications.run(load)
})
</script>
<template>
  <v-progress-linear v-if="busy" indeterminate />
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
  <v-form v-if="view" @submit.prevent="save">
    <v-select
      :model-value="target"
      @update:model-value="notifications.run(() => selectTarget($event))"
      label="配置范围"
      :items="view.targets.map((entry) => ({ title: entry.name, value: JSON.stringify(entry.target) }))"
      :disabled="busy"
      aria-label="配置范围"
    />
    <v-alert v-if="view.gsviConfiguration" type="info" variant="tonal" class="mb-4"
      >{{ view.gsviConfiguration.voiceHint
      }}<span v-if="view.gsviConfiguration.refreshDisabled"
        >当前插件或执行环境未启用，上游音色不会被请求。</span
      ></v-alert
    >
    <v-alert
      v-for="issue in issues"
      :key="issue.path + issue.message"
      type="error"
      variant="tonal"
      class="mb-2"
      >{{ issue.path }}：{{ issue.message }}</v-alert
    >
    <AstrBotConfig
      :metadata="metadata"
      metadata-key="plugin"
      :iterable="draft.values"
      :plugin-name="pluginId"
      :enable-default-reset="true"
      :disabled="busy"
    />
    <v-card v-if="draft.bindings.length" title="服务与能力绑定" class="mt-4"
      ><v-card-text>
        <v-select
          v-for="binding in draft.bindings"
          :key="binding.kind + binding.alias"
          v-model="binding.value"
          :label="binding.title"
          :items="binding.choices.map((choice) => ({ title: choice.name, value: choice.id }))"
          :disabled="busy"
          :hint="binding.kind"
          persistent-hint
          :aria-label="binding.title"
        /> </v-card-text
    ></v-card>
    <v-card-actions class="mt-4"
      ><v-chip v-if="changes.dirty.value" color="warning">有未保存的修改</v-chip><v-spacer /><v-btn
        :disabled="busy"
        @click="notifications.run(() => load(view!.target))"
        >放弃修改并刷新</v-btn
      ><v-btn type="submit" color="primary" variant="flat" :loading="busy">保存配置</v-btn></v-card-actions
    >
  </v-form>
</template>
