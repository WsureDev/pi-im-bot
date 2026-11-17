import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ControlSnapshotSchema, type ControlSnapshot } from '@core/control/contracts'
import { request } from '@/api/http'
import { mayLeave } from '@/composables/drafts'
export const useControl = defineStore('control', () => {
  const scopeId = ref('global')
  const snapshot = ref<ControlSnapshot>()
  const loading = ref(false)
  async function refresh() {
    snapshot.value = await request(
      '/api/control/snapshot?scope=' + encodeURIComponent(scopeId.value),
      ControlSnapshotSchema
    )
  }
  async function selectScope(id: string) {
    if (id === scopeId.value || !(await mayLeave())) {
      return
    }
    loading.value = true
    try {
      const next = await request(
        '/api/control/snapshot?scope=' + encodeURIComponent(id),
        ControlSnapshotSchema
      )
      snapshot.value = next
      scopeId.value = id
    } finally {
      loading.value = false
    }
  }
  function pluginName(id: string) {
    if (id === 'core') {
      return 'Bot 核心'
    }
    return (
      snapshot.value?.plugins.find((entry) => {
        return entry.id === id
      })?.name ?? id
    )
  }
  return { scopeId, snapshot, loading, refresh, selectScope, pluginName }
})
