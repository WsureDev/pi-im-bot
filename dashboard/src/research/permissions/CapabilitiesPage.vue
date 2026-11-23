<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiTableFrame from '@/ui/table/UiTableFrame.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, onMounted, ref, toRaw } from 'vue'
import type { CapabilityPolicy } from '@demo/contracts/capabilities'
import { useDraft } from '@/composables/drafts'
import { mutate, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import { useResearch } from '../store'
import { groupOptions, directOptions, audienceValue, setAudience } from './options'

const research = useResearch()
const notices = useNotifications()
const search = ref('')
const filter = ref('all')
const policies = ref<Record<string, CapabilityPolicy>>({})
const revision = ref(0)
const changes = useDraft(policies)
const busy = ref(false)
const error = ref('')
const entries = computed(() => {
  return (
    research.snapshot?.capabilities.filter((capability) => {
      if (filter.value === 'commands' && !capability.commands.length) {
        return false
      }
      if (filter.value === 'tools' && !capability.tool) {
        return false
      }
      const haystack = [capability.title, capability.pluginId, ...capability.commands, capability.tool ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(search.value.toLowerCase())
    }) ?? []
  )
})
async function load() {
  await research.refresh()
  if (!research.preset) {
    return
  }
  policies.value = structuredClone(toRaw(research.preset.policies))
  revision.value = research.preset.revision
  changes.clean()
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
    await mutate(
      '/api/research/presets/' + id(research.presetId) + '/policies',
      { revision: revision.value, policies: policies.value },
      'PUT'
    )
    await load()
    notices.show('权限策略已保存，指令与 Tool 共用当前能力策略。')
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <div>
      <h1 class="text-h5 font-weight-bold">指令与 Tool</h1>
      <p class="text-medium-emphasis mt-1">在一份预设中管理所有入口，分别定义群聊与私聊的使用范围。</p>
    </div>
    <span class="pi-spacer" /><UiButton color="primary" variant="tonal" to="/trigger-context"
      >验证权限</UiButton
    >
  </div>
  <div data-tone="info" class="pi-alert mb-5">
    同一能力的指令和 Tool 共用角色策略，分别控制入口启停。Tool
    使用原始触发人的身份，不能通过模型调用绕过群聊权限。
  </div>
  <div class="d-flex flex-wrap ga-3 mb-4">
    <UiText
      v-model="search"
      label="搜索指令、Tool 或插件"
      prepend-inner-icon="mdi-magnify"
      clearable
      @click:clear="search = ''"
      style="min-width: 240px"
    /><UiChoice
      v-model="filter"
      label="显示入口"
      :items="[
        { title: '全部能力', value: 'all' },
        { title: '包含指令', value: 'commands' },
        { title: '包含 Tool', value: 'tools' }
      ]"
      style="max-width: 230px"
    />
  </div>
  <div v-if="error" data-tone="error" class="pi-alert mb-4">{{ error }}</div>
  <UiCard>
    <UiTableFrame class="capability-table"
      ><thead>
        <tr>
          <th>能力 / 所属插件</th>
          <th>能力开关</th>
          <th>指令入口</th>
          <th>Tool 入口</th>
          <th>群聊允许范围</th>
          <th>私聊允许范围</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="capability in entries" :key="capability.id"
          ><tr v-if="policies[capability.id]" :id="'capability-' + capability.id">
            <td>
              <strong>{{ capability.title }}</strong>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ research.pluginName(capability.pluginId) }}
              </div>
              <div class="text-caption text-medium-emphasis">{{ capability.id }}</div>
            </td>
            <td>
              <UiCheck
                v-model="policies[capability.id].enabled"
                :aria-label="capability.title + '能力启用'"
              />
            </td>
            <td>
              <template v-if="capability.commands.length"
                ><div class="text-caption mb-1">{{ capability.commands.join(' · ') }}</div>
                <UiCheck
                  v-model="policies[capability.id].commandEnabled"
                  :disabled="!policies[capability.id].enabled"
                  :aria-label="capability.title + '指令启用'" /></template
              ><span v-else class="text-medium-emphasis">无指令</span>
            </td>
            <td>
              <template v-if="capability.tool"
                ><code>{{ capability.tool }}</code
                ><UiCheck
                  v-model="policies[capability.id].toolEnabled"
                  :disabled="!policies[capability.id].enabled"
                  :aria-label="capability.title + 'Tool启用'" /></template
              ><span v-else class="text-medium-emphasis">无 Tool</span>
            </td>
            <td>
              <UiChoice
                :model-value="audienceValue(policies[capability.id].group)"
                :items="groupOptions"
                :disabled="!policies[capability.id].enabled"
                :aria-label="capability.title + '群聊权限'"
                @update:model-value="setAudience(policies[capability.id], 'group', $event)"
              />
            </td>
            <td>
              <UiChoice
                :model-value="audienceValue(policies[capability.id].direct)"
                :items="directOptions"
                :disabled="!policies[capability.id].enabled"
                :aria-label="capability.title + '私聊权限'"
                @update:model-value="setAudience(policies[capability.id], 'direct', $event)"
              />
            </td></tr
        ></template>
      </tbody>
    </UiTableFrame>
    <div class="pi-section" v-if="!entries.length">没有匹配的能力。</div>
  </UiCard>
  <p class="text-caption text-medium-emphasis mt-3">
    渠道管理仅指当前群的管理员或群主，私聊没有此身份。Bot
    管理员也遵守显式策略；“任何人”包含所有身份。上表为完整演示能力目录。
  </p>
  <div class="d-flex align-center ga-2 mt-4">
    <UiChip v-if="changes.dirty.value" color="warning">有未保存的修改</UiChip
    ><span class="pi-spacer" /><UiButton @click="notices.run(refresh)">刷新</UiButton
    ><UiButton color="primary" variant="flat" :loading="busy" :disabled="!changes.dirty.value" @click="save"
      >保存权限策略</UiButton
    >
  </div>
</template>
<style scoped>
.capability-table th {
  white-space: nowrap;
}
.capability-table td {
  padding: 16px !important;
}
.capability-table td:nth-child(5) {
  min-width: 220px;
}
.capability-table td:nth-child(6) {
  min-width: 180px;
}
.capability-table code {
  font-size: 12px;
  white-space: nowrap;
}
</style>
