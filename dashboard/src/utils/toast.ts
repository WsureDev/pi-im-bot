import { useNotifications } from '@/stores/notifications'

export function useToast() {
  const notifications = useNotifications()
  return {
    success(message: string) {
      notifications.show(message)
    },
    warning(message: string) {
      notifications.show(message)
    },
    error(message: string) {
      notifications.show(message, true)
    }
  }
}
