import { computed, onBeforeUnmount, ref, type Ref } from 'vue'

const drafts = new Map<symbol, () => boolean>()
let confirm: () => Promise<boolean> = async () => {
  return false
}

export function setDiscardConfirmation(handler: () => Promise<boolean>) {
  confirm = handler
}

export async function mayLeave() {
  if (
    ![...drafts.values()].some((dirty) => {
      return dirty()
    })
  ) {
    return true
  }
  return confirm()
}

export function useDraft<T>(value: Ref<T>) {
  const baseline = ref(JSON.stringify(value.value))
  const dirty = computed(() => {
    return JSON.stringify(value.value) !== baseline.value
  })
  const key = Symbol('draft')
  drafts.set(key, () => {
    return JSON.stringify(value.value) !== baseline.value
  })
  onBeforeUnmount(() => {
    drafts.delete(key)
  })
  function clean() {
    baseline.value = JSON.stringify(value.value)
  }
  async function discard() {
    if (JSON.stringify(value.value) === baseline.value) {
      return true
    }
    return confirm()
  }
  return { dirty, clean, discard }
}

window.addEventListener('beforeunload', (event) => {
  if (
    [...drafts.values()].some((dirty) => {
      return dirty()
    })
  ) {
    event.preventDefault()
    event.returnValue = ''
  }
})
