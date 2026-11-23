<script setup lang="ts">
import { computed, useAttrs, useId, type StyleValue } from 'vue'
import { Input } from '@ui-sdk/vue/input'
import { Textarea } from '@ui-sdk/vue/textarea'
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from '@ui-sdk/vue/password-input'
import UiIcon from '../UiIcon.vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: unknown
  modelModifiers?: { number?: boolean }
  label?: string
  hint?: string
  type?: string
  multiline?: boolean
  disabled?: boolean
  readonly?: boolean
  clearable?: boolean
  appendInnerIcon?: string
  prependInnerIcon?: string
  prefix?: string
  errorMessages?: string | string[]
  rows?: number | string
  spellcheck?: boolean | 'true' | 'false'
  maxlength?: number | string
  autofocus?: boolean
  placeholder?: string
  min?: number | string
  max?: number | string
  step?: number | string
  autocomplete?: string
  suggestions?: readonly string[]
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'click:append-inner'): void
  (event: 'click:clear'): void
}>()
const attrs = useAttrs()
const id = useId()
const stringValue = computed(() => String(props.modelValue ?? ''))
const isPassword = computed(
  () => !props.multiline && (props.type === 'password' || props.appendInnerIcon?.includes('mdi-eye'))
)
const error = computed(() => [props.errorMessages ?? ''].flat().join(' '))
function update(value: string) {
  emit('update:modelValue', value)
}
function clear() {
  update('')
  emit('click:clear')
}
function controlAttrs() {
  const { class: _class, style: _style, ...rest } = attrs
  return {
    ...rest,
    spellcheck: props.spellcheck,
    maxlength: props.maxlength,
    autofocus: props.autofocus,
    placeholder: props.placeholder,
    min: props.min,
    max: props.max,
    step: props.step,
    autocomplete: props.autocomplete
  }
}
const descriptionId = computed(() => {
  if (props.hint || error.value) {
    return id + '-help'
  }
})
const listId = computed(() => {
  if (props.suggestions) {
    return id + '-options'
  }
})
</script>
<template>
  <div class="pi-field" :class="$attrs.class" :style="$attrs.style as StyleValue">
    <label v-if="label" :for="id">{{ label }}</label>
    <div class="pi-input-shell" :data-disabled="disabled || undefined">
      <UiIcon v-if="prependInnerIcon" :icon="prependInnerIcon" />
      <span v-if="prefix">{{ prefix }}</span>
      <PasswordInput
        v-if="isPassword"
        class="pi-password"
        :value="stringValue"
        :visible="type !== 'password'"
        :disabled="disabled"
        :read-only="readonly"
        @update:model-value="update"
        @update:visible="emit('click:append-inner')"
      >
        <PasswordInputControl :id="id" v-bind="controlAttrs()" :aria-describedby="descriptionId" />
        <PasswordInputToggle aria-label="切换凭据可见性"
          ><UiIcon :icon="appendInnerIcon || 'mdi-eye-outline'"
        /></PasswordInputToggle>
      </PasswordInput>
      <Textarea
        v-else-if="multiline"
        :rows="rows"
        :id="id"
        :value="stringValue"
        :disabled="disabled"
        :read-only="readonly"
        v-bind="controlAttrs()"
        :aria-describedby="descriptionId"
        @update:model-value="update"
      />
      <Input
        v-else
        :id="id"
        :value="stringValue"
        :type="type || 'text'"
        :disabled="disabled"
        :read-only="readonly"
        v-bind="controlAttrs()"
        :aria-describedby="descriptionId"
        :list="listId"
        @update:model-value="update"
      />
      <datalist v-if="suggestions" :id="id + '-options'">
        <option v-for="entry in suggestions" :key="entry" :value="entry" />
      </datalist>
      <button
        v-if="clearable && stringValue && !disabled && !readonly"
        type="button"
        aria-label="清空"
        @click="clear"
      >
        ×
      </button>
      <button
        v-if="appendInnerIcon && !isPassword"
        type="button"
        :disabled="disabled"
        aria-label="切换可见性"
        @click="emit('click:append-inner')"
      >
        <UiIcon :icon="appendInnerIcon" />
      </button>
    </div>
    <small v-if="error || hint" :id="id + '-help'" :class="{ 'pi-error': error }">{{ error || hint }}</small>
  </div>
</template>
