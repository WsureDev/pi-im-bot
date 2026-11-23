<template>
  <div class="d-flex align-center justify-space-between ga-2">
    <div v-if="isSingleItemMode" class="flex-grow-1 d-flex align-center ga-2">
      <UiText
        v-model="singleItemValue"
        :type="secretInputType"
        :append-inner-icon="secretToggleIcon"
        :autocomplete="secret ? 'new-password' : undefined"
        @click:append-inner="secretVisible = !secretVisible"
        class="flex-grow-1"
      ></UiText>
    </div>
    <div v-else>
      <span v-if="!modelValue || modelValue.length === 0" style="color: rgb(var(--pi-primaryText))">
        {{ t('core.common.list.noItems') }}
      </span>
      <div v-else class="d-flex flex-wrap ga-2">
        <UiChip v-for="item in displayItems" :key="item" size="x-small" color="primary">
          {{ secret && !secretVisible ? '••••••••' : item.length > 20 ? item.slice(0, 20) + '...' : item }}
        </UiChip>
        <UiChip v-if="modelValue.length > maxDisplayItems" size="x-small" color="grey-lighten-1">
          +{{ modelValue.length - maxDisplayItems }}
        </UiChip>
      </div>
    </div>
    <UiButton size="small" color="primary" variant="tonal" @click="openDialog">
      {{
        preferSingleItem ? t('core.common.list.addMore') : buttonText || t('core.common.list.modifyButton')
      }}
    </UiButton>
  </div>

  <!-- List Management Dialog -->
  <UiDialog persistent v-model="dialog" max-width="600px">
    <UiCard>
      <div class="pi-card-title text-h3 pa-4 pb-0 pl-6">
        {{ dialogTitle || t('core.common.list.editTitle') }}
      </div>

      <!-- Add new item section - moved to top -->
      <div class="pi-section pa-4 pb-2">
        <div class="d-flex align-center ga-2">
          <UiText
            v-model="newItem"
            :type="secretInputType"
            :append-inner-icon="secretToggleIcon"
            :autocomplete="secret ? 'new-password' : undefined"
            @click:append-inner="secretVisible = !secretVisible"
            :label="t('core.common.list.addItemPlaceholder')"
            @keyup.enter="addItem"
            clearable
            :placeholder="t('core.common.list.inputPlaceholder')"
            class="flex-grow-1"
          >
          </UiText>
          <UiButton @click="addItem" variant="tonal" color="primary" size="small" :disabled="!newItem.trim()">
            {{ t('core.common.list.addButton') }}
          </UiButton>
          <UiButton @click="showBatchImport = true" variant="tonal" color="primary" size="small">
            <UiIcon icon="mdi-import" size="small"></UiIcon>
            {{ t('core.common.list.batchImport') }}
          </UiButton>
        </div>
      </div>

      <div class="pi-section pa-0" style="max-height: 400px; overflow-y: auto">
        <div class="pi-list" v-if="localItems.length > 0">
          <UiListItem
            v-for="(item, index) in localItems"
            :key="index"
            class="ma-1 list-item-clickable"
            @click="startEdit(index, item)"
          >
            <div v-if="editIndex !== index" class="pi-list-title item-text">
              {{ secret && !secretVisible ? '••••••••' : item }}
            </div>
            <UiText
              v-else
              v-model="editItem"
              :type="secretInputType"
              :append-inner-icon="secretToggleIcon"
              :autocomplete="secret ? 'new-password' : undefined"
              @click:append-inner="secretVisible = !secretVisible"
              @keyup.enter="saveEdit"
              @keyup.esc="cancelEdit"
              @click.stop
              autofocus
            ></UiText>

            <template v-slot:append>
              <div class="d-flex">
                <UiButton
                  v-if="editIndex === index"
                  aria-label="保存条目"
                  @click.stop="saveEdit"
                  variant="text"
                  color="success"
                  icon
                  size="small"
                >
                  <UiIcon icon="mdi-check"></UiIcon>
                </UiButton>
                <UiButton
                  :aria-label="editIndex === index ? '取消编辑' : '删除条目'"
                  @click.stop="editIndex === index ? cancelEdit() : removeItem(index)"
                  variant="text"
                  :color="editIndex === index ? 'error' : 'default'"
                  icon
                  size="small"
                >
                  <UiIcon icon="mdi-close"></UiIcon>
                </UiButton>
              </div>
            </template>
          </UiListItem>
        </div>

        <div v-else class="text-center py-8">
          <UiIcon icon="mdi-format-list-bulleted" size="64" color="grey-lighten-1"></UiIcon>
          <p class="text-grey mt-4">{{ t('core.common.list.noItemsHint') }}</p>
        </div>
      </div>

      <footer class="pi-actions pa-4">
        <span class="pi-spacer"></span>
        <UiButton variant="text" @click="cancelDialog">{{ t('core.common.cancel') }}</UiButton>
        <UiButton color="primary" variant="tonal" @click="confirmDialog">{{
          t('core.common.confirm')
        }}</UiButton>
      </footer>
    </UiCard>
  </UiDialog>

  <!-- Batch Import Dialog -->
  <UiDialog v-model="showBatchImport" max-width="600px">
    <UiCard>
      <div class="pi-card-title text-h3 pa-4 pb-0 pl-6">
        {{ t('core.common.list.batchImportTitle') }}
      </div>

      <div class="pi-section">
        <UiText
          multiline
          v-model="batchImportText"
          :class="{ 'secret-textarea': secret && !secretVisible }"
          :append-inner-icon="secretToggleIcon"
          :autocomplete="secret ? 'new-password' : undefined"
          @click:append-inner="secretVisible = !secretVisible"
          :label="t('core.common.list.batchImportLabel')"
          :placeholder="t('core.common.list.batchImportPlaceholder')"
          rows="10"
          :hint="t('core.common.list.batchImportHint')"
        ></UiText>
      </div>

      <footer class="pi-actions pa-4">
        <span class="pi-spacer"></span>
        <UiButton variant="text" @click="cancelBatchImport">{{ t('core.common.cancel') }}</UiButton>
        <UiButton color="primary" variant="tonal" @click="confirmBatchImport">
          {{ t('core.common.list.batchImportButton', { count: batchImportPreviewCount }) }}
        </UiButton>
      </footer>
    </UiCard>
  </UiDialog>
</template>

<script setup>
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiText from '@/ui/fields/UiText.vue'
import { ref, computed, watch, nextTick } from 'vue'
import { useDraft } from '@/composables/drafts'
import { useI18n } from '@/i18n/composables'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  label: {
    type: String,
    default: ''
  },
  buttonText: {
    type: String,
    default: ''
  },
  dialogTitle: {
    type: String,
    default: ''
  },
  maxDisplayItems: {
    type: Number,
    default: 1
  },
  preferSingleItem: {
    type: Boolean,
    default: true
  },
  secret: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const dialog = ref(false)
const localItems = ref([])
const originalItems = ref([])
const newItem = ref('')
const editIndex = ref(-1)
const editItem = ref('')
const showBatchImport = ref(false)
const batchImportText = ref('')
const secretVisible = ref(false)
const editingDraft = computed(() => {
  if (!dialog.value) {
    return null
  }
  return { items: localItems.value, edit: editItem.value, added: newItem.value, batch: batchImportText.value }
})
const dialogChanges = useDraft(editingDraft)
const isSingleItemMode = computed(() => (props.modelValue?.length ?? 0) <= 1 && props.preferSingleItem)
const secretInputType = computed(() => (props.secret && !secretVisible.value ? 'password' : 'text'))
const secretToggleIcon = computed(() => {
  if (!props.secret) return undefined
  return secretVisible.value ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
})
const singleItemValue = computed({
  get: () => props.modelValue?.[0] ?? '',
  set: (value) => {
    // 仅当值为完全空字符串（未输入任何字符）时清空数组，
    // 允许包含空格（如 "hello world"）以及纯空格（如 " "）通过
    if (value === '') {
      emit('update:modelValue', [])
      return
    }

    const newItems = [...(props.modelValue || [])]
    if (newItems.length === 0) {
      newItems.push(value)
    } else {
      newItems[0] = value
    }

    emit('update:modelValue', newItems)
  }
})

// 计算要显示的项目
const displayItems = computed(() => {
  return props.modelValue.slice(0, props.maxDisplayItems)
})

// 计算批量导入的项目数量
const batchImportPreviewCount = computed(() => {
  if (!batchImportText.value) return 0
  return batchImportText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length
})

// 监听 modelValue 变化，同步到 localItems，并清理空字符串
watch(
  () => props.modelValue,
  (value) => {
    if (!dialog.value) {
      localItems.value = [...(value || [])]
    }
  },
  { immediate: true }
)

function openDialog() {
  localItems.value = [...(props.modelValue || [])]
  originalItems.value = [...(props.modelValue || [])]
  dialog.value = true
  editIndex.value = -1
  editItem.value = ''
  newItem.value = ''
  dialogChanges.clean()
}

function addItem() {
  if (newItem.value.trim() !== '') {
    localItems.value.push(newItem.value.trim())
    newItem.value = ''
  }
}

function removeItem(index) {
  localItems.value.splice(index, 1)
}

function startEdit(index, item) {
  editIndex.value = index
  editItem.value = item
}

function saveEdit() {
  if (editItem.value.trim() !== '') {
    localItems.value[editIndex.value] = editItem.value.trim()
    cancelEdit()
  }
}

function cancelEdit() {
  editIndex.value = -1
  editItem.value = ''
}

function confirmDialog() {
  emit('update:modelValue', [...localItems.value])
  dialog.value = false
  dialogChanges.clean()
}

async function cancelDialog() {
  if (!(await dialogChanges.discard())) {
    return
  }
  localItems.value = [...originalItems.value]
  editIndex.value = -1
  editItem.value = ''
  newItem.value = ''
  dialog.value = false
  dialogChanges.clean()
}

function confirmBatchImport() {
  if (batchImportText.value.trim()) {
    const newItems = batchImportText.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    localItems.value.push(...newItems)
    batchImportText.value = ''
    showBatchImport.value = false
  }
}

function cancelBatchImport() {
  batchImportText.value = ''
  showBatchImport.value = false
}
</script>

<style scoped>
.pi-list-item {
  transition: all 0.2s ease;
}

.list-item-clickable {
  cursor: pointer;
}

.list-item-clickable:hover {
  background-color: rgba(var(--pi-primary), 0.08);
}

.item-text {
  user-select: none;
}

.pi-chip {
  margin: 2px;
}

.secret-textarea :deep(textarea) {
  -webkit-text-security: disc;
}
</style>
