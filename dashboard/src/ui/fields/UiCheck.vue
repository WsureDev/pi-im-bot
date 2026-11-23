<script setup lang="ts" generic="Value">
import { computed, useId } from 'vue'
import { Switch, SwitchThumb } from '@ui-sdk/vue/switch'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/vue/checkbox'
const props = defineProps<{
  modelValue?: Value
  value?: unknown
  checkbox?: boolean
  disabled?: boolean
  label?: string
  ariaLabel?: string
  hint?: string
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: Value): void }>()
const id = useId()
const checked = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.includes(props.value)
  }
  return Boolean(props.modelValue)
})
function change(value: unknown) {
  const on = value === true
  if (Array.isArray(props.modelValue)) {
    const rest = props.modelValue.filter((item) => item !== props.value)
    if (on) {
      rest.push(props.value)
    }
    emit('update:modelValue', rest as Value)
  } else {
    emit('update:modelValue', on as Value)
  }
}
</script>
<template>
  <div class="pi-check">
    <Checkbox
      v-if="checkbox"
      :id="id"
      :checked="checked"
      :disabled="disabled"
      class="pi-checkbox"
      :aria-label="ariaLabel || label"
      @update:checked="change"
      ><CheckboxIndicator>✓</CheckboxIndicator></Checkbox
    >
    <Switch
      v-else
      :id="id"
      class="pi-switch"
      :checked="checked"
      :disabled="disabled"
      :aria-label="ariaLabel || label"
      @update:checked="change"
      ><SwitchThumb class="pi-switch-thumb"
    /></Switch>
    <label v-if="label" :for="id">{{ label }}</label
    ><small v-if="hint">{{ hint }}</small>
  </div>
</template>
