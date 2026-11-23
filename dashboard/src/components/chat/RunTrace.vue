<script setup lang="ts">
import { computed } from 'vue'
import type { Trace } from '@core/domain/run'
import {
  Timeline,
  TimelineItem,
  TimelineMarker,
  TimelineConnector,
  TimelineTitle,
  TimelineTime,
  TimelineDescription
} from '@ui-sdk/vue/timeline'
import {
  Waterfall,
  WaterfallHeaderRow,
  WaterfallColumnHeader,
  WaterfallAxis,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallBar,
  type WaterfallData
} from '@ui-sdk/vue/waterfall'
const props = defineProps<{ events: Trace[] }>()
const ordered = computed(() => [...props.events].sort((a, b) => a.at - b.at))
const spans = computed<WaterfallData>(() => {
  const start = ordered.value.reduce(
    (earliest, entry) => Math.min(earliest, entry.at - (entry.durationMs ?? 0)),
    Infinity
  )
  return ordered.value.flatMap((entry) => {
    if (entry.durationMs === undefined || entry.durationMs < 0) {
      return []
    }
    return [
      {
        value: entry.id,
        label: entry.title,
        start: entry.at - entry.durationMs - start,
        duration: entry.durationMs
      }
    ]
  })
})
function clock(time: number) {
  return new Date(time).toLocaleTimeString('zh-CN', { hour12: false })
}
</script>
<template>
  <Waterfall
    v-if="spans.length"
    :items="spans"
    aria-label="已记录耗时"
    class="pi-waterfall"
    :format="{ style: 'unit', unit: 'millisecond', unitDisplay: 'narrow' }"
  >
    <WaterfallHeaderRow
      ><WaterfallColumnHeader>步骤</WaterfallColumnHeader
      ><WaterfallColumnHeader><WaterfallAxis /></WaterfallColumnHeader
    ></WaterfallHeaderRow>
    <WaterfallRow v-for="span in spans" :key="span.value" :value="span.value"
      ><WaterfallRowHeader>{{ span.label }}</WaterfallRowHeader
      ><WaterfallBar
        ><span>{{ Math.round(span.duration) }} ms</span></WaterfallBar
      ></WaterfallRow
    >
  </Waterfall>
  <Timeline v-if="ordered.length" aria-label="运行时间线" class="pi-timeline">
    <TimelineItem v-for="entry in ordered" :key="entry.id" :value="entry.id"
      ><TimelineMarker /><TimelineConnector /> <TimelineTitle>{{ entry.title }}</TimelineTitle
      ><TimelineTime :datetime="new Date(entry.at).toISOString()"
        >{{ clock(entry.at) }} · {{ entry.kind }}</TimelineTime
      >
      <TimelineDescription v-if="entry.detail">
        <pre>{{ entry.detail }}</pre>
      </TimelineDescription>
    </TimelineItem>
  </Timeline>
</template>
