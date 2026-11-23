<script setup lang="ts">
import { Slider, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@ui-sdk/vue/slider'
const props = defineProps<{
  modelValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  ariaLabel?: string
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
  (event: 'end', value: number): void
}>()
function numeric(value: number | number[]) {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}
</script>
<template>
  <Slider
    :value="props.modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @update:value="emit('update:modelValue', numeric($event))"
    @value-commit="emit('end', numeric($event))"
  >
    <SliderControl class="pi-slider"
      ><SliderTrack class="pi-slider-track"
        ><SliderIndicator class="pi-slider-indicator" /><SliderThumb
          :aria-label="ariaLabel || '数值'"
          class="pi-slider-thumb" /></SliderTrack
    ></SliderControl>
  </Slider>
</template>
