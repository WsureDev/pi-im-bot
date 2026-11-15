import { deadlineScope } from '../../runtime/deadline'
export function gsviDeadline(parent: AbortSignal, timeoutMs: number) {
  return deadlineScope(parent, Date.now() + timeoutMs)
}
