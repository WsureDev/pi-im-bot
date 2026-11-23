<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiDrawer from '@/ui/UiDrawer.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiText from '@/ui/fields/UiText.vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { navigation } from '@/router'
import { useWorkspace } from '@/stores/workspace'
import { useNotifications } from '@/stores/notifications'
import { request } from '@/api/http'
import { RoomSchema } from '@core/domain/message'
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
const workspace = useWorkspace()
const notifications = useNotifications()
const router = useRouter()
const groups = [
  { title: '工作区', paths: ['/chat', '/jobs', '/schedules', '/onebot'] },
  { title: '编排与权限', paths: ['/orchestration', '/capabilities', '/trigger-context'] },
  { title: '配置与资源', paths: ['/settings', '/plugins', '/resource-providers', '/resources', '/providers'] }
].map((group) => {
  return {
    title: group.title,
    items: group.paths.flatMap((path) => navigation.filter((entry) => entry.path === path))
  }
})
const create = ref(false)
const name = ref('')
const kind = ref<'group' | 'direct'>('group')
const busy = ref(false)
async function createRoom() {
  busy.value = true
  try {
    const room = await request('/api/rooms', RoomSchema, {
      method: 'POST',
      data: { name: name.value, kind: kind.value }
    })
    await workspace.refresh()
    create.value = false
    name.value = ''
    await router.push('/chat/' + room.id)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <UiDrawer :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" width="264">
    <nav aria-label="主要功能">
      <section v-for="group in groups" :key="group.title">
        <h2 class="pi-nav-heading">{{ group.title }}</h2>
        <UiListItem
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          :prepend-icon="item.icon"
          :title="item.title"
        />
      </section>
    </nav>
    <hr class="pi-divider" />
    <div class="pi-group-heading">
      渠道<span class="pi-spacer" /><UiButton
        icon="mdi-plus"
        variant="text"
        size="small"
        aria-label="新建 Mock 渠道"
        @click="create = true"
      />
    </div>
    <div class="pi-list" aria-label="渠道列表">
      <UiListItem
        v-for="room in workspace.snapshot?.rooms"
        :key="room.id"
        :to="'/chat/' + room.id"
        :title="room.name"
        :subtitle="room.address.channel + ' · ' + room.address.accountId + ' / ' + room.address.chatId"
        prepend-icon="mdi-pound"
      />
    </div>
  </UiDrawer>
  <UiDialog v-model="create" max-width="480" persistent
    ><UiCard title="新建 Mock 渠道">
      <div class="pi-section">
        <UiText v-model="name" label="渠道名称" maxlength="80" autofocus /><UiChoice
          v-model="kind"
          label="渠道类型"
          :items="[
            { title: '群聊', value: 'group' },
            { title: '私聊', value: 'direct' }
          ]"
          aria-label="渠道类型"
        />
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="create = false">取消</UiButton
        ><UiButton
          variant="flat"
          color="primary"
          :loading="busy"
          :disabled="!name.trim()"
          @click="notifications.run(createRoom)"
          >创建渠道</UiButton
        >
      </footer>
    </UiCard></UiDialog
  >
</template>
