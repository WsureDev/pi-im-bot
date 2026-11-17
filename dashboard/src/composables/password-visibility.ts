import { computed, ref } from 'vue'

export function usePasswordVisibility() {
  const visible = ref(false)
  const type = computed(() => {
    if (visible.value) {
      return 'text'
    }
    return 'password'
  })
  const icon = computed(() => {
    if (visible.value) {
      return 'mdi-eye-off-outline'
    }
    return 'mdi-eye-outline'
  })
  function toggle() {
    visible.value = !visible.value
  }
  function reset() {
    visible.value = false
  }
  return { type, icon, toggle, reset }
}
