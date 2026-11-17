<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { z } from 'zod'
import { CapabilityAccessSchema, BotAdministratorSchema } from '@core/permissions/capability-policy'
import { useDraft } from '@/composables/drafts'
import { mutate, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useControl } from './store'
import ScopeBar from './ScopeBar.vue'
const control = useControl()
const notices = useNotifications()
const search = ref('')
const draft = ref<{
  policies: Record<string, z.infer<typeof CapabilityAccessSchema>>
  administrators: z.infer<typeof BotAdministratorSchema>[]
}>({ policies: {}, administrators: [] })
const changes = useDraft(draft)
const revision = ref('')
let original: typeof draft.value = { policies: {}, administrators: [] }
const busy = ref(false)
const error = ref('')
const rows = computed(() => {
  return (
    control.snapshot?.capabilities.filter((entry) => {
      return [entry.title, entry.pluginId, entry.id, ...entry.commands, entry.tool ?? '']
        .join(' ')
        .toLowerCase()
        .includes(search.value.toLowerCase())
    }) ?? []
  )
})
const groupOptions = [
  { title: '禁用群聊', value: 'disabled' },
  { title: '仅 Bot 管理', value: 'bot_admin' },
  { title: '仅渠道管理', value: 'channel_admin' },
  { title: 'Bot 管理 + 渠道管理', value: 'bot_admin,channel_admin' },
  { title: '任何人', value: 'everyone' }
]
const directOptions = [
  { title: '禁用私聊', value: 'disabled' },
  { title: '仅 Bot 管理', value: 'bot_admin' },
  { title: '任何人', value: 'everyone' }
]
function audience(value: z.infer<typeof CapabilityAccessSchema>['group']) {
  if (!value.enabled) {
    return 'disabled'
  }
  if (value.roles.includes('everyone')) {
    return 'everyone'
  }
  return [...value.roles].sort().join(',')
}
function setAudience(key: string, scene: 'group' | 'direct', value: string) {
  const roles: z.infer<typeof CapabilityAccessSchema>['group']['roles'] = []
  for (const role of ['bot_admin', 'channel_admin', 'everyone'] as const) {
    if (value.split(',').includes(role)) {
      roles.push(role)
    }
  }
  draft.value.policies[key][scene] = { enabled: value !== 'disabled', roles }
}
function adopt() {
  if (!control.snapshot) {
    return
  }
  draft.value = {
    policies: structuredClone(toRaw(control.snapshot.policies)),
    administrators: structuredClone(toRaw(control.snapshot.administrators))
  }
  original = structuredClone(toRaw(draft.value))
  revision.value = control.snapshot.revision
  changes.clean()
}
async function load() {
  await control.refresh()
  adopt()
}
async function refresh() {
  if (await changes.discard()) {
    await load()
  }
}
async function save() {
  busy.value = true
  error.value = ''
  try {
    const policies = Object.fromEntries(
      Object.entries(draft.value.policies).filter(([key, value]) => {
        return JSON.stringify(value) !== JSON.stringify(original.policies[key])
      })
    )
    const payload: {
      revision: string
      policies: typeof policies
      administrators?: typeof draft.value.administrators
    } = { revision: revision.value, policies }
    if (
      control.scopeId === 'global' &&
      JSON.stringify(draft.value.administrators) !== JSON.stringify(original.administrators)
    ) {
      payload.administrators = draft.value.administrators
    }
    await mutate('/api/control/scopes/' + id(control.scopeId) + '/policies', payload, 'PUT')
    await load()
    notices.show('权限配置已保存，后续调用会按当前策略检查。')
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
watch(() => control.scopeId, adopt)
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <ScopeBar :disabled="busy" />
  <h1 class="text-h5 font-weight-bold mb-3">指令与 Tool</h1>
  <v-alert type="info" variant="tonal" class="mb-4"
    >目录来自核心、实际安装插件及已发现的 MCP。相同操作的指令与 Tool 共用角色策略；能力开关关闭全部入口，Tool
    开关只控制模型入口。现有权限规则和原任务权限上限仍然生效。</v-alert
  >
  <v-text-field
    v-model="search"
    label="搜索指令、Tool 或插件"
    prepend-inner-icon="mdi-magnify"
    class="mb-3"
    hide-details
  />
  <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
  <v-card :inert="busy"
    ><v-table class="access-table"
      ><thead>
        <tr>
          <th>能力 / 所属插件</th>
          <th>启用</th>
          <th>指令入口</th>
          <th>Tool 入口</th>
          <th>群聊范围</th>
          <th>私聊范围</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.id"
          ><tr v-if="draft.policies[row.id]" :id="'capability-' + row.id">
            <td>
              <strong>{{ row.title }}</strong>
              <p class="text-caption text-medium-emphasis">{{ control.pluginName(row.pluginId) }}</p>
              <p class="text-caption">{{ row.id }}</p>
            </td>
            <td>
              <v-switch
                v-model="draft.policies[row.id].enabled"
                :aria-label="row.title + '启用'"
                hide-details
              />
            </td>
            <td>
              <template v-if="row.commands.length"
                ><p>{{ row.commands.join(' · ') }}</p>
                <v-switch
                  v-model="draft.policies[row.id].commandEnabled"
                  :aria-label="row.title + '指令启用'"
                  hide-details /></template
              ><span v-else>—</span>
            </td>
            <td>
              <template v-if="row.tool"
                ><code>{{ row.tool }}</code
                ><v-switch
                  v-model="draft.policies[row.id].toolEnabled"
                  :aria-label="row.title + 'Tool启用'"
                  hide-details /></template
              ><span v-else>—</span>
            </td>
            <td>
              <v-select
                :model-value="audience(draft.policies[row.id].group)"
                :items="groupOptions"
                hide-details
                density="compact"
                :aria-label="row.title + '群聊权限'"
                @update:model-value="setAudience(row.id, 'group', $event)"
              />
            </td>
            <td>
              <v-select
                :model-value="audience(draft.policies[row.id].direct)"
                :items="directOptions"
                hide-details
                density="compact"
                :aria-label="row.title + '私聊权限'"
                @update:model-value="setAudience(row.id, 'direct', $event)"
              />
            </td></tr
        ></template></tbody></v-table
  ></v-card>
  <v-card :inert="busy" v-if="control.scopeId === 'global'" class="mt-5" title="Bot 管理员"
    ><v-card-text
      ><p class="text-caption text-medium-emphasis mb-3">
        按平台、Bot 账号和用户 ID 精确匹配。渠道管理员与群主来自当前群的平台事件；Mock 昵称不能声明管理身份。
      </p>
      <v-row v-for="(administrator, index) in draft.administrators" :key="index"
        ><v-col><v-text-field v-model="administrator.channel" label="平台" hide-details /></v-col
        ><v-col><v-text-field v-model="administrator.accountId" label="Bot 账号 ID" hide-details /></v-col
        ><v-col><v-text-field v-model="administrator.actorId" label="管理员用户 ID" hide-details /></v-col
        ><v-col cols="auto"
          ><v-btn
            icon="mdi-delete-outline"
            variant="text"
            aria-label="移除管理员"
            @click="draft.administrators.splice(index, 1)" /></v-col></v-row
      ><v-btn
        class="mt-3"
        variant="tonal"
        @click="draft.administrators.push({ channel: 'onebot-v11', accountId: '', actorId: '' })"
        >添加管理员</v-btn
      ></v-card-text
    ></v-card
  >
  <div class="d-flex align-center ga-3 mt-4">
    <v-chip v-if="changes.dirty.value" color="warning">有未保存的修改</v-chip><v-spacer /><v-btn
      @click="notices.run(refresh)"
      >刷新</v-btn
    ><v-btn color="primary" variant="flat" :loading="busy" :disabled="!changes.dirty.value" @click="save"
      >保存权限策略</v-btn
    >
  </div>
</template>
<style scoped>
.access-table :deep(table) {
  min-width: 1000px;
}
.access-table td {
  padding: 14px !important;
}
.access-table td:nth-child(5) {
  min-width: 220px;
}
.access-table td:nth-child(6) {
  min-width: 170px;
}
.access-table code {
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
