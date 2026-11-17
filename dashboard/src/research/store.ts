import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DemoSnapshotSchema, type DemoSnapshot } from '@demo/contracts/presets'
import { request } from '@/api/http'
import { mayLeave } from '@/composables/drafts'

export const useResearch = defineStore('research', () => {
  const snapshot = ref<DemoSnapshot>()
  const presetId = ref(localStorage.getItem('pi.research.preset') ?? 'community')
  const preset = computed(() => {
    return snapshot.value?.presets.find((item) => {
      return item.id === presetId.value
    })
  })
  async function refresh() {
    snapshot.value = await request('/api/research/snapshot', DemoSnapshotSchema)
    if (!preset.value) {
      presetId.value = snapshot.value.defaultPresetId
    }
  }
  async function selectPreset(id: string) {
    if (id === presetId.value || !(await mayLeave())) {
      return
    }
    presetId.value = id
    localStorage.setItem('pi.research.preset', id)
  }
  function pluginName(id: string) {
    if (id === 'core') {
      return 'Bot 核心'
    }
    return (
      snapshot.value?.plugins.find((plugin) => {
        return plugin.id === id
      })?.name ?? id
    )
  }
  return { snapshot, presetId, preset, refresh, selectPreset, pluginName }
})
