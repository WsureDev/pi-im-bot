<script setup lang="ts">
import { computed, onMounted, provide, ref, toRaw } from 'vue'
import { IndependentConfigSchema } from '@core/resource-providers/api-schema'
import type { z } from 'zod'
import { request, id } from '@/api/http'
import {
  ConfigurationKey,
  createConfigurationDraft,
  readConfigurationSecrets,
  configurationDefinition,
  configurationPayload,
  type ConfigurationDraft
} from '@/api/plugin-configuration'
import AstrBotConfig from '@/components/shared/AstrBotConfig.vue'
import { useDraft } from '@/composables/drafts'

const props = defineProps<{ subjectId: string }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'saved'): void }>()
const view = ref<z.infer<typeof IndependentConfigSchema>>()
const draft = ref<ConfigurationDraft>({ values: {}, secrets: {}, overrides: {}, bindings: [] })
const changes = useDraft(draft)
const busy = ref(false)
const error = ref('')
const path = '/api/resource-providers/instances/' + id(props.subjectId) + '/configuration'
const metadata = computed(() => {
  if (!view.value) {
    return {}
  }
  return {
    resource: { type: 'object', items: configurationDefinition(toRaw(view.value), toRaw(draft.value.values)) }
  }
})
provide(ConfigurationKey, {
  get view() {
    return view.value!
  },
  get draft() {
    return draft.value
  },
  canOverride() {
    return false
  },
  editable(_path, field) {
    return !field.readonly
  },
  inherit() {}
})
async function load() {
  busy.value = true
  try {
    const next = await request(path, IndependentConfigSchema)
    const nextDraft = createConfigurationDraft(next, await readConfigurationSecrets(path, next))
    view.value = next
    draft.value = nextDraft
    changes.clean()
    error.value = ''
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
async function save() {
  if (!view.value) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    const payload = configurationPayload(view.value, draft.value)
    const next = await request(path, IndependentConfigSchema, {
      method: 'PUT',
      data: {
        revision: payload.revision,
        release: payload.release,
        target: payload.target,
        values: payload.values,
        secrets: payload.secrets
      }
    })
    const nextDraft = createConfigurationDraft(next, await readConfigurationSecrets(path, next))
    view.value = next
    draft.value = nextDraft
    changes.clean()
    emit('saved')
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
async function close() {
  if (await changes.discard()) {
    emit('close')
  }
}
async function refresh() {
  if (await changes.discard()) {
    await load()
  }
}
onMounted(load)
</script>
<template>
  <v-dialog :model-value="true" persistent max-width="780" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center"
        ><span>{{ view?.title ?? '加载配置' }}</span
        ><v-spacer /><v-btn icon="mdi-close" variant="text" aria-label="关闭资源配置" @click="close"
      /></v-card-title>
      <v-card-subtitle>由独立 Provider 定义生成配置表单 · {{ subjectId }}</v-card-subtitle>
      <v-progress-linear v-if="busy" indeterminate />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4"
          >{{ error }} 草稿保留在当前窗口。</v-alert
        >
        <v-alert type="info" variant="tonal" class="mb-4"
          >保存的配置供绑定此资源的调用方使用；本页不会发起业务调用。</v-alert
        >
        <AstrBotConfig
          v-if="view"
          :metadata="metadata"
          metadata-key="resource"
          :iterable="draft.values"
          :plugin-name="view.provider"
          :enable-default-reset="true"
          :disabled="busy"
        />
      </v-card-text>
      <v-card-actions
        ><v-chip v-if="changes.dirty.value" size="small" color="warning">未保存</v-chip><v-spacer /><v-btn
          @click="refresh"
          >刷新</v-btn
        ><v-btn @click="close">关闭</v-btn
        ><v-btn color="primary" variant="flat" :loading="busy" :disabled="!view" @click="save"
          >保存配置</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>
