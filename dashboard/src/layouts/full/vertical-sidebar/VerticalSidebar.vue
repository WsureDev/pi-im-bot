<script setup lang="ts">
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
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    width="264"
  >
    <v-list nav aria-label="主要功能"
      ><v-list-item
        v-for="item in navigation"
        :key="item.path"
        :to="item.path"
        :prepend-icon="item.icon"
        :title="item.title"
        color="primary"
    /></v-list>
    <v-divider />
    <v-list-subheader
      >渠道<v-spacer /><v-btn
        icon="mdi-plus"
        variant="text"
        size="small"
        aria-label="新建 Mock 渠道"
        @click="create = true"
    /></v-list-subheader>
    <v-list nav density="compact" aria-label="渠道列表"
      ><v-list-item
        v-for="room in workspace.snapshot?.rooms"
        :key="room.id"
        :to="'/chat/' + room.id"
        :title="room.name"
        :subtitle="room.address.channel + ' · ' + room.address.accountId + ' / ' + room.address.chatId"
        prepend-icon="mdi-pound"
        color="primary"
    /></v-list>
  </v-navigation-drawer>
  <v-dialog v-model="create" max-width="480" persistent
    ><v-card title="新建 Mock 渠道">
      <v-card-text
        ><v-text-field v-model="name" label="渠道名称" maxlength="80" autofocus /><v-select
          v-model="kind"
          label="渠道类型"
          :items="[
            { title: '群聊', value: 'group' },
            { title: '私聊', value: 'direct' }
          ]"
          aria-label="渠道类型"
      /></v-card-text>
      <v-card-actions
        ><v-spacer /><v-btn @click="create = false">取消</v-btn
        ><v-btn
          variant="flat"
          color="primary"
          :loading="busy"
          :disabled="!name.trim()"
          @click="notifications.run(createRoom)"
          >创建渠道</v-btn
        ></v-card-actions
      >
    </v-card></v-dialog
  >
</template>
