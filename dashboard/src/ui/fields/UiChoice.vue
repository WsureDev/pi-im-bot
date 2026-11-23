<script setup lang="ts" generic="Value">
import { computed, useId, type StyleValue } from 'vue'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@ui-sdk/vue/select'
import {
  Combobox,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxValue
} from '@ui-sdk/vue/combobox'
import UiIcon from '../UiIcon.vue'
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    modelValue?: Value
    items?: readonly unknown[]
    itemValue?: string
    itemTitle?: string
    label?: string
    hint?: string
    searchable?: boolean
    multiple?: boolean
    clearable?: boolean
    disabled?: boolean
    required?: boolean
    search?: string
  }>(),
  { itemValue: 'value', itemTitle: 'title' }
)
const emit = defineEmits<{
  (event: 'update:modelValue', value: Value): void
  (event: 'update:search', value: string): void
}>()
const id = useId()
function property(value: unknown, key: string) {
  if (value && typeof value === 'object' && key in value) {
    return Reflect.get(value, key) as unknown
  }
  return value
}
const choices = computed(() =>
  (props.items ?? []).map((item) => ({
    label: String(property(item, props.itemTitle) ?? ''),
    value: property(item, props.itemValue)
  }))
)
function labelOf(value: unknown) {
  return choices.value.find((item) => Object.is(item.value, value))?.label ?? String(value ?? '')
}
function change(value: unknown) {
  emit('update:modelValue', value as Value)
}
const hasSelection = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.length > 0
  }
  return props.modelValue != null && props.modelValue !== ''
})
function clear() {
  if (props.multiple) {
    change([])
  } else {
    change(null)
  }
}
</script>
<template>
  <div class="pi-field" :class="$attrs.class" :style="$attrs.style as StyleValue">
    <label v-if="label" :id="id + '-label'" :for="id">{{ label }}</label>
    <div class="pi-choice-shell">
      <Combobox
        v-if="searchable"
        class="pi-combo"
        :multiple="multiple"
        :disabled="disabled"
        :value="modelValue"
        :required="required"
        :item-to-label="labelOf"
        :query="search"
        @update:query="emit('update:search', $event)"
        @update:model-value="change"
      >
        <ComboboxChips v-if="multiple"
          ><ComboboxValue v-slot="{ state }"
            ><ComboboxChip
              v-for="selected in state.value as unknown[]"
              :key="String(selected)"
              :value="selected"
              >{{ labelOf(selected) }}
              <ComboboxChipRemove aria-label="移除">×</ComboboxChipRemove></ComboboxChip
            ></ComboboxValue
          ></ComboboxChips
        >
        <div class="pi-input-shell">
          <ComboboxInput
            :id="id"
            :aria-label="String($attrs['aria-label'] || label || '搜索选项')"
          /><ComboboxTrigger aria-label="展开选项"><UiIcon icon="mdi-chevron-down" /></ComboboxTrigger>
        </div>
        <ComboboxContent class="pi-options"
          ><ComboboxEmpty>没有匹配的选项</ComboboxEmpty
          ><ComboboxList>
            <ComboboxItem
              v-for="option in choices"
              :key="String(option.value)"
              :value="option.value"
              :label="option.label"
              class="pi-option"
              >{{ option.label }}</ComboboxItem
            >
          </ComboboxList></ComboboxContent
        >
      </Combobox>
      <Select
        v-else
        :value="modelValue"
        :item-to-label="labelOf"
        :disabled="disabled"
        :required="required"
        @update:model-value="change"
      >
        <SelectTrigger
          :id="id"
          class="pi-select"
          :aria-label="String($attrs['aria-label'] || label || '选择选项')"
          ><span>{{ labelOf(modelValue) || '请选择' }}</span
          ><UiIcon icon="mdi-chevron-down"
        /></SelectTrigger>
        <SelectContent class="pi-options"
          ><SelectItem
            v-for="option in choices"
            :key="String(option.value)"
            :value="option.value"
            :label="option.label"
            class="pi-option"
            >{{ option.label }}</SelectItem
          ></SelectContent
        >
      </Select>
      <button
        v-if="clearable && hasSelection"
        type="button"
        :disabled="disabled"
        aria-label="清除选择"
        @click="clear"
      >
        ×
      </button>
    </div>
    <small v-if="hint">{{ hint }}</small>
  </div>
</template>
