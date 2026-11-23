<script setup lang="ts" generic="Row extends object">
import { computed, ref, watch } from 'vue'
import { Pagination, PaginationPrevious, PaginationNext } from '@ui-sdk/vue/pagination'
import UiIcon from '../UiIcon.vue'

interface Column {
  key: string
  title?: string
  sortable?: boolean
  width?: number | string
}
const props = withDefaults(
  defineProps<{
    headers: readonly Column[]
    items: readonly Row[]
    search?: string
    itemsPerPage?: number
    showExpand?: boolean
    loading?: boolean
  }>(),
  { itemsPerPage: 10 }
)
const page = ref(1)
const limit = ref(props.itemsPerPage)
const order = ref<{ key: string; desc: boolean }>()
const expanded = ref(new Set<string>())
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const keys = new WeakMap<object, string>()
let nextKey = 0
function cell(row: Row, key: string): unknown {
  let value: unknown = row
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object') {
      return undefined
    }
    value = Reflect.get(value, part)
  }
  return value
}
function keyFor(row: Row) {
  const id = cell(row, 'id')
  if ((typeof id === 'string' && id) || typeof id === 'number') {
    return 'id:' + String(id)
  }
  let key = keys.get(row)
  if (!key) {
    key = 'row-' + ++nextKey
    keys.set(row, key)
  }
  return key
}
function display(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map(display).join('、')
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}
const rows = computed(() => {
  let result = props.items.map((item, index) => ({ item, index, key: keyFor(item) }))
  const query = props.search?.trim().toLocaleLowerCase()
  if (query) {
    result = result.filter(({ item }) =>
      props.headers.some((column) => display(cell(item, column.key)).toLocaleLowerCase().includes(query))
    )
  }
  const sort = order.value
  if (sort) {
    result.sort((left, right) => {
      const comparison = collator.compare(
        display(cell(left.item, sort.key)),
        display(cell(right.item, sort.key))
      )
      if (sort.desc) {
        return -comparison
      }
      return comparison
    })
  }
  return result
})
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / limit.value)))
watch([() => props.search, limit], () => {
  page.value = 1
})
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count)
})
const visible = computed(() => rows.value.slice((page.value - 1) * limit.value, page.value * limit.value))
const columns = computed(() => {
  if (props.showExpand) {
    return [...props.headers, { key: 'expand', title: '详情' }]
  }
  return props.headers
})
function sort(key: string) {
  if (order.value?.key === key && order.value.desc) {
    order.value = undefined
  } else {
    order.value = { key, desc: order.value?.key === key }
  }
  page.value = 1
}
function ariaSort(key: string) {
  if (order.value?.key !== key) {
    return undefined
  }
  if (order.value.desc) {
    return 'descending' as const
  }
  return 'ascending' as const
}
function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expanded.value = next
}
</script>
<template>
  <div class="pi-data-table" :aria-busy="loading">
    <div class="pi-table-scroll" tabindex="0" aria-label="数据表">
      <table>
        <thead>
          <tr>
            <th v-for="col in headers" :key="col.key" scope="col" :aria-sort="ariaSort(col.key)">
              <button
                v-if="col.sortable !== false && col.key !== 'actions'"
                type="button"
                @click="sort(col.key)"
              >
                {{ col.title
                }}<span v-if="order?.key === col.key" aria-hidden="true"
                  ><template v-if="order.desc"> ↓</template><template v-else> ↑</template></span
                ></button
              ><span v-else>{{ col.title }}</span>
            </th>
            <th v-if="showExpand" scope="col"><span class="sr-only">详情</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in visible" :key="row.key">
            <tr>
              <td v-for="col in headers" :key="col.key">
                <slot :name="'item.' + col.key" :item="row.item" :index="row.index">{{
                  display(cell(row.item, col.key))
                }}</slot>
              </td>
              <td v-if="showExpand">
                <button
                  type="button"
                  class="pi-table-disclosure"
                  aria-label="展开或收起行详情"
                  :aria-expanded="expanded.has(row.key)"
                  @click="toggle(row.key)"
                >
                  <UiIcon icon="mdi-chevron-right" :class="{ 'pi-rotated': expanded.has(row.key) }" />
                </button>
              </td>
            </tr>
            <slot v-if="expanded.has(row.key)" name="expanded-row" :item="row.item" :columns="columns" />
          </template>
          <tr v-if="!visible.length">
            <td :colspan="columns.length" class="pi-empty">
              <span v-if="loading">加载中…</span><span v-else>暂无记录</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="pi-table-footer">
      <span>{{ rows.length }} 条记录</span>
      <label v-if="rows.length > 10"
        >每页
        <select v-model.number="limit" aria-label="每页行数">
          <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
        </select></label
      >
      <Pagination
        v-if="pageCount > 1"
        :page="page"
        :page-count="pageCount"
        aria-label="表格分页"
        @page-change="page = $event"
      >
        <PaginationPrevious aria-label="上一页" />
        <span>{{ page }} / {{ pageCount }}</span>
        <PaginationNext aria-label="下一页" />
      </Pagination>
    </footer>
  </div>
</template>
