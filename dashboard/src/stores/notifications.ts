import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotifications = defineStore('notifications', () => {
  const text = ref('')
  const visible = ref(false)
  const error = ref(false)
  function show(message: unknown, failed = false) {
    text.value = String(message)
    error.value = failed
    visible.value = true
  }
  async function run<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (reason) {
      show(reason, true)
      return undefined
    }
  }
  return { text, visible, error, show, run }
})
