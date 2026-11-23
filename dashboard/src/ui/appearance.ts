import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

const saved = localStorage.getItem('pi.theme')
const dark = ref(
  saved === 'PurpleThemeDark' ||
    saved === 'dark' ||
    (!saved && matchMedia('(prefers-color-scheme: dark)').matches)
)
export function applyTheme() {
  let mode = 'light'
  if (dark.value) {
    mode = 'dark'
  }
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}
export function useAppearance() {
  function toggle() {
    dark.value = !dark.value
    applyTheme()
    localStorage.setItem('pi.theme', document.documentElement.dataset.theme!)
  }
  return { dark, toggle }
}
export function useViewport() {
  const width = ref(window.innerWidth)
  function resize() {
    width.value = window.innerWidth
  }
  onMounted(() => window.addEventListener('resize', resize))
  onBeforeUnmount(() => window.removeEventListener('resize', resize))
  return { width, mobile: computed(() => width.value < 960) }
}
