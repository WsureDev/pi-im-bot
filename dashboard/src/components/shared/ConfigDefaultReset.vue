<script setup>
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { computed } from 'vue'
import { useI18n } from '@/i18n/composables'
import { getPluginConfigDefaultValue, isPluginConfigValueModified } from '@/utils/pluginConfigDefaults.mjs'

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean, Array, Object],
    default: null
  },
  itemMeta: {
    type: Object,
    default: null
  },
  enabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['reset'])
const { t } = useI18n()
const showReset = computed(
  () =>
    props.enabled &&
    !props.itemMeta?.readonly &&
    isPluginConfigValueModified(props.modelValue, props.itemMeta)
)

function resetToDefault() {
  emit('reset', getPluginConfigDefaultValue(props.itemMeta))
}
</script>

<template>
  <div
    class="config-default-reset"
    :class="{ 'config-default-reset--switch': enabled && itemMeta?.type === 'bool' && !itemMeta.readonly }"
  >
    <div class="config-default-reset__field">
      <slot></slot>
    </div>
    <UiButton
      v-if="showReset"
      icon
      size="x-small"
      variant="text"
      color="primary"
      class="config-default-reset__button"
      :title="t('core.common.restoreDefault')"
      :aria-label="t('core.common.restoreDefault')"
      @click="resetToDefault"
    >
      <UiIcon icon="mdi-restore" size="18"></UiIcon>
    </UiButton>
  </div>
</template>

<style scoped>
.config-default-reset {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.config-default-reset__field {
  flex: 1;
  min-width: 0;
}

.config-default-reset__button {
  flex: 0 0 auto;
}

.config-default-reset--switch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2rem;
}

.config-default-reset--switch .config-default-reset__button {
  width: 100%;
}
</style>
