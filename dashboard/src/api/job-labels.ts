import type { JobSummary } from '@core/jobs/schema'

const states: Record<JobSummary['state'], string> = {
  queued: '排队中',
  running: '运行中',
  waiting_external: '等待外部操作',
  waiting_input: '远端等待输入',
  succeeded: '已完成',
  failed: '失败',
  cancel_requested: '已请求取消',
  cancelled: '已取消',
  outcome_unknown: '外部结果未知'
}
const deliveries: Record<JobSummary['delivery'], string> = {
  pending: '等待交付',
  accepted: '交付已受理',
  sent: '已发送',
  unknown: '发送结果未知',
  suppressed: '已抑制交付',
  none: '无需交付',
  partial: '部分已发送'
}
export function jobStateLabel(state: JobSummary['state']) {
  return states[state]
}
export function deliveryLabel(state: JobSummary['delivery']) {
  return deliveries[state]
}
