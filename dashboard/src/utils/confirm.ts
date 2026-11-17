interface Confirmation {
  title: string
  message: string
}
let handler: (options: Confirmation) => Promise<boolean> = async () => {
  return false
}
export function bindConfirmation(next: typeof handler) {
  handler = next
}
export function confirmAction(title: string, message: string) {
  return handler({ title, message })
}
