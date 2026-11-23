<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
  CommandGroupLabel,
  CommandEmpty
} from '@ui-sdk/vue/command'
import UiDialog from '@/ui/UiDialog.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { navigation } from '@/router'
import { useWorkspace } from '@/stores/workspace'
const open = ref(false)
const router = useRouter()
const workspace = useWorkspace()
const rooms = computed(() => workspace.snapshot?.rooms ?? [])
function shortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
    if (!open.value && document.querySelector('[aria-modal=true],dialog[open]')) {
      return
    }
    event.preventDefault()
    open.value = !open.value
  }
}
async function choose(path: string) {
  open.value = false
  await router.push(path)
}
onMounted(() => window.addEventListener('keydown', shortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut))
</script>
<template>
  <button class="pi-search-trigger" type="button" aria-label="搜索页面或渠道" @click="open = true">
    <UiIcon icon="mdi-magnify" /><span>搜索页面或渠道</span><kbd>Ctrl K</kbd>
  </button>
  <UiDialog v-model="open" label="搜索页面或渠道" max-width="520">
    <Command class="pi-command" @action="choose">
      <CommandInput autofocus aria-label="搜索页面或渠道" placeholder="搜索页面或渠道…" />
      <CommandEmpty>没有匹配项</CommandEmpty>
      <CommandList>
        <CommandGroup
          ><CommandGroupLabel>功能</CommandGroupLabel>
          <CommandItem
            v-for="item in navigation"
            :key="item.path"
            :value="item.path"
            :label="item.title"
            :keywords="[item.title]"
            ><UiIcon :icon="item.icon" />{{ item.title }}</CommandItem
          >
        </CommandGroup>
        <CommandGroup v-if="rooms.length"
          ><CommandGroupLabel>渠道</CommandGroupLabel>
          <CommandItem
            v-for="room in rooms"
            :key="room.id"
            :value="'/chat/' + room.id"
            :label="room.name"
            :keywords="[room.name, room.address.chatId]"
            ><UiIcon icon="mdi-pound" />{{ room.name }}</CommandItem
          >
        </CommandGroup>
      </CommandList>
    </Command>
  </UiDialog>
</template>
