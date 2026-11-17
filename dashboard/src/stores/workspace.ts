import { defineStore } from 'pinia'
import { ref } from 'vue'
import { SnapshotSchema, RoomDetailSchema, type Snapshot, type RoomDetail } from '@core/http/contracts'
import { AppEventSchema, type AppEvent } from '@core/runtime/events'
import { request, id } from '@/api/http'
import { useNotifications } from './notifications'

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((entry) => {
    return entry.id === item.id
  })
  if (index < 0) {
    items.push(item)
  } else {
    items[index] = item
  }
}

export const useWorkspace = defineStore('workspace', () => {
  const snapshot = ref<Snapshot>()
  const details = ref<Record<string, RoomDetail>>({})
  const previews = ref<Record<string, string>>({})
  const connected = ref(false)
  const connectionError = ref('')
  const configVersion = ref(0)
  const activeRoom = ref(localStorage.getItem('pi.activeRoom') ?? '')
  const loading = ref(false)
  const buffered = new Map<string, AppEvent[]>()
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let snapshotLoad: Promise<void> | undefined
  const snapshotEvents: AppEvent[] = []

  async function refresh() {
    if (snapshotLoad) {
      return snapshotLoad
    }
    snapshotLoad = refreshSnapshot()
    try {
      await snapshotLoad
      connectionError.value = ''
    } catch (error) {
      connectionError.value = String(error)
      throw error
    } finally {
      snapshotLoad = undefined
    }
  }

  async function refreshSnapshot() {
    const next = await request('/api/state', SnapshotSchema)
    snapshot.value = next
    for (const event of snapshotEvents.splice(0)) {
      receive(event, false)
    }
    if (
      !next.rooms.some((room) => {
        return room.id === activeRoom.value
      })
    ) {
      activeRoom.value = next.rooms[0]?.id ?? ''
    }
  }

  async function loadRoom(roomId: string, activate = true) {
    if (activate) {
      activeRoom.value = roomId
      localStorage.setItem('pi.activeRoom', roomId)
    }
    if (buffered.has(roomId)) {
      return
    }
    buffered.set(roomId, [])
    loading.value = true
    try {
      const detail = await request('/api/rooms/' + id(roomId), RoomDetailSchema)
      details.value[roomId] = detail
      const pending = buffered.get(roomId) ?? []
      buffered.delete(roomId)
      for (const event of pending) {
        receive(event, false)
      }
    } finally {
      buffered.delete(roomId)
      loading.value = buffered.size > 0
    }
  }

  function receive(event: AppEvent, incoming = true) {
    if (incoming) {
      if (snapshotLoad && ['room', 'run', 'job', 'schedules', 'onebot_status'].includes(event.type)) {
        snapshotEvents.push(event)
      }
      let roomId: string | undefined
      if (event.type === 'message') {
        roomId = event.message.roomId
      }
      if (event.type === 'run') {
        roomId = event.run.roomId
      }
      if (event.type === 'trace') {
        roomId = event.trace.roomId
      }
      if (event.type === 'room') {
        roomId = event.room.id
      }
      if (roomId) {
        buffered.get(roomId)?.push(event)
      }
    }
    if (!snapshot.value) {
      return
    }
    if (event.type === 'config') {
      configVersion.value += 1
      void useNotifications().run(refresh)
    }
    if (event.type === 'room') {
      upsert(snapshot.value.rooms, event.room)
      const detail = details.value[event.room.id]
      if (detail) {
        const changed = detail.room.currentConversationId !== event.room.currentConversationId
        detail.room = event.room
        if (changed && !buffered.has(event.room.id)) {
          void useNotifications().run(() => {
            return loadRoom(event.room.id, false)
          })
        }
      }
    }
    if (event.type === 'job') {
      upsert(snapshot.value.jobs, event.job)
    }
    if (event.type === 'run') {
      upsert(snapshot.value.runs, event.run)
      const detail = details.value[event.run.roomId]
      if (detail) {
        upsert(detail.runs, event.run)
      }
    }
    if (event.type === 'message') {
      const detail = details.value[event.message.roomId]
      if (detail) {
        detail.messages = detail.messages.filter((entry) => {
          return !event.removedIds?.includes(entry.id)
        })
        upsert(detail.messages, event.message)
        detail.messages.sort((left, right) => {
          return left.createdAt - right.createdAt
        })
      }
    }
    if (event.type === 'trace') {
      const detail = details.value[event.trace.roomId]
      if (detail) {
        upsert(detail.traces, event.trace)
      }
    }
    if (event.type === 'preview') {
      previews.value[event.runId] = event.text
    }
    if (event.type === 'schedules') {
      snapshot.value.schedules = event.schedules
    }
    if (event.type === 'onebot_status') {
      snapshot.value.onebot = event.status
    }
  }

  function connect() {
    stopped = false
    let protocol = 'ws:'
    if (location.protocol === 'https:') {
      protocol = 'wss:'
    }
    socket = new WebSocket(protocol + '//' + location.host + '/api/events')
    socket.onopen = () => {
      connected.value = true
      void useNotifications().run(refresh)
    }
    socket.onmessage = (message) => {
      try {
        receive(AppEventSchema.parse(JSON.parse(String(message.data))))
      } catch {
        useNotifications().show('实时事件格式无效，请重新加载状态。', true)
      }
    }
    socket.onclose = () => {
      connected.value = false
      if (!stopped) {
        timer = setTimeout(connect, 2000)
      }
    }
  }

  function disconnect() {
    stopped = true
    clearTimeout(timer)
    socket?.close()
  }
  return {
    snapshot,
    details,
    previews,
    connected,
    connectionError,
    configVersion,
    activeRoom,
    loading,
    refresh,
    loadRoom,
    connect,
    disconnect
  }
})
