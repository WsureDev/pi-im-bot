<script setup lang="ts">
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiCheck from '@/ui/fields/UiCheck.vue'
import UiChip from '@/ui/UiChip.vue'
import UiChoice from '@/ui/fields/UiChoice.vue'
import UiCol from '@/ui/UiCol.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiListItem from '@/ui/UiListItem.vue'
import UiText from '@/ui/fields/UiText.vue'
import { computed, onMounted, ref } from 'vue'
import { z } from 'zod'
import { IndependentRegistrySchema } from '@core/resource-providers/api-schema'
import type { ResourceMethod } from '@core/resource-providers/protocol'
import type { ResourceCommand } from '@core/resource-providers/commands/schema'
import { request, id } from '@/api/http'
import { useNotifications } from '@/stores/notifications'
import InstanceConfiguration from './InstanceConfiguration.vue'
import MethodDialog from './MethodDialog.vue'
import CommandEditor from './CommandEditor.vue'
const notices = useNotifications()
const view = ref<z.infer<typeof IndependentRegistrySchema>>()
const creating = ref(false)
const definitionEditor = ref(false)
const definitions = ref('')
const configId = ref('')
const method = ref<{ resourceId: string; protocol: string; method: ResourceMethod }>()
const editingCommand = ref<ResourceCommand | null>()
const form = ref({ id: '', name: '', provider: 'x-image' })
const base = '/api/resource-providers'
const providerChoices = computed(() => {
  return (
    view.value?.definitions.map((entry) => {
      return { title: entry.title, value: entry.id }
    }) ?? []
  )
})
async function load() {
  view.value = await request(base, IndependentRegistrySchema)
}
async function change(path: string, data: object, method = 'PUT') {
  view.value = await request(base + path, IndependentRegistrySchema, {
    method,
    data: { ...data, revision: view.value!.revision }
  })
}
async function create() {
  await change('/instances', form.value, 'POST')
  creating.value = false
  configId.value = form.value.id
}
function methods(providerId: string) {
  const provider = view.value?.definitions.find((entry) => {
    return entry.id === providerId
  })
  return (provider?.mappings ?? []).flatMap((mapping) => {
    const protocol = view.value?.protocols.find((entry) => {
      return entry.id === mapping.protocol
    })
    const method = protocol?.methods.find((entry) => {
      return entry.id === mapping.method
    })
    if (method && protocol) {
      return [{ protocol: protocol.id, method }]
    }
    return []
  })
}
function editDefinitions() {
  definitions.value = JSON.stringify(
    {
      protocols: view.value?.protocols.filter((entry) => {
        return view.value?.customProtocolIds.includes(entry.id)
      }),
      providers: view.value?.definitions.filter((entry) => {
        return view.value?.customProviderIds.includes(entry.id)
      })
    },
    null,
    2
  )
  definitionEditor.value = true
}
async function saveDefinitions() {
  await change('/definitions', z.record(z.string(), z.unknown()).parse(JSON.parse(definitions.value)))
  definitionEditor.value = false
}
async function saveCommand(command: ResourceCommand) {
  const commands = [
    ...view.value!.commands.filter((entry) => {
      return entry.id !== command.id
    }),
    command
  ]
  await change('/commands', { commands })
  editingCommand.value = undefined
}
async function removeCommand(commandId: string) {
  await change('/commands', {
    commands: view.value!.commands.filter((entry) => {
      return entry.id !== commandId
    })
  })
}
onMounted(() => {
  void notices.run(load)
})
</script>
<template>
  <div class="d-flex align-center flex-wrap ga-3 mb-5">
    <div>
      <h1 class="text-h5 font-weight-bold">资源提供者</h1>
      <p class="text-medium-emphasis mt-1">配置服务与数据源，按协议供插件和指令使用。</p>
    </div>
    <span class="pi-spacer" /><UiButton variant="text" @click="notices.run(load)">刷新</UiButton
    ><UiButton color="primary" prepend-icon="mdi-plus" @click="creating = true">添加资源</UiButton>
  </div>
  <div v-if="view && !view.instances.length" data-tone="info" class="pi-alert mb-5">
    还没有资源实例。选择 x-image 或 Comfy Gateway 配置连接，也可以导入自己的协议与 Provider 定义。
  </div>
  <div class="pi-row mb-5">
    <UiCol v-for="instance in view?.instances" :key="instance.id" cols="12" lg="6"
      ><UiCard height="100%">
        <div class="pi-card-title d-flex align-center">
          {{ instance.name }}<span class="pi-spacer" /><UiCheck
            :model-value="instance.enabled"
            :aria-label="instance.name + '启用'"
            @update:model-value="
              notices.run(() =>
                change('/instances/' + id(instance.id) + '/enabled', { enabled: Boolean($event) })
              )
            "
          />
        </div>
        <p class="pi-subtitle">{{ instance.provider }} · {{ instance.id }}</p>
        <div class="pi-section">
          <p class="mb-3">使用方：{{ instance.consumers.join('、') || '尚无插件绑定' }}</p>
          <div
            v-for="entry in methods(instance.provider)"
            :key="entry.protocol + entry.method.id"
            class="d-flex align-center ga-3 py-2 border-b"
          >
            <div class="flex-grow-1">
              <strong>{{ entry.method.title }}</strong>
              <div class="text-caption text-medium-emphasis">
                {{ entry.protocol }} / {{ entry.method.id }}
              </div>
            </div>
            <UiChip v-if="entry.method.effect === 'write'" size="x-small" color="warning">会修改后端</UiChip>
            <UiButton
              variant="tonal"
              color="primary"
              size="small"
              :disabled="!instance.enabled"
              @click="method = { resourceId: instance.id, protocol: entry.protocol, method: entry.method }"
              >调用</UiButton
            >
          </div>
        </div>
        <footer class="pi-actions">
          <UiButton color="primary" @click="configId = instance.id">连接配置</UiButton
          ><span class="pi-spacer" /><UiButton
            color="error"
            @click="notices.run(() => change('/instances/' + id(instance.id), {}, 'DELETE'))"
            >删除</UiButton
          >
        </footer>
      </UiCard></UiCol
    >
  </div>
  <div class="d-flex align-center mb-3">
    <div>
      <h2 class="text-h6">资源与 MCP 转指令</h2>
      <p class="text-medium-emphasis">选择方法、固定参数和输入映射，直接执行，无需经过模型。</p>
    </div>
    <span class="pi-spacer" /><UiButton color="primary" variant="tonal" @click="editingCommand = null"
      >添加指令</UiButton
    >
  </div>
  <UiCard class="mb-6"
    ><div class="pi-list" v-if="view?.commands.length">
      <UiListItem
        v-for="command in view.commands"
        :key="command.id"
        :title="'/' + command.name"
        :subtitle="command.description"
        ><template #append
          ><UiChip v-if="command.enabled" size="small" color="success">已启用</UiChip
          ><UiChip v-else size="small">已停用</UiChip
          ><UiButton variant="text" @click="editingCommand = command">编辑</UiButton
          ><UiButton variant="text" color="error" @click="notices.run(() => removeCommand(command.id))"
            >删除</UiButton
          ></template
        ></UiListItem
      >
    </div>
    <div class="pi-section" v-else>暂无指令映射。添加后可在当前聊天直接使用 /指令名。</div></UiCard
  >
  <div class="d-flex align-center mb-3">
    <h2 class="text-h6">协议与实现</h2>
    <span class="pi-spacer" /><UiButton variant="text" @click="editDefinitions"
      >导入或编辑自定义定义</UiButton
    >
  </div>
  <UiCard
    ><div class="pi-list">
      <UiListItem
        v-for="protocol in view?.protocols"
        :key="protocol.id"
        :title="protocol.title + ' · ' + protocol.id"
        :subtitle="protocol.description"
      /></div
  ></UiCard>
  <UiDialog v-model="creating" max-width="560"
    ><UiCard title="添加资源"
      ><div class="pi-section">
        <UiChoice v-model="form.provider" :items="providerChoices" label="Provider 实现" /><UiText
          v-model="form.id"
          label="资源 ID"
          hint="小写字母开头，可含数字、下划线与连字符"
        /><UiText v-model="form.name" label="资源名称" />
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="creating = false">取消</UiButton
        ><UiButton color="primary" @click="notices.run(create)">创建并配置</UiButton>
      </footer></UiCard
    ></UiDialog
  >
  <UiDialog v-model="definitionEditor" max-width="900"
    ><UiCard title="自定义协议与 Provider"
      ><div class="pi-section">
        <p class="mb-3">
          编辑自定义 protocols 与 providers 数组，内置定义始终保留。协议定义方法语义；Provider 映射 HTTP 或
          MCP 接口。
        </p>
        <UiText multiline v-model="definitions" label="定义 JSON" rows="18" spellcheck="false" />
      </div>
      <footer class="pi-actions">
        <span class="pi-spacer" /><UiButton @click="definitionEditor = false">取消</UiButton
        ><UiButton color="primary" @click="notices.run(saveDefinitions)">校验并保存</UiButton>
      </footer></UiCard
    ></UiDialog
  >
  <InstanceConfiguration
    v-if="configId"
    :subject-id="configId"
    @close="configId = ''"
    @saved="notices.run(load)"
  />
  <MethodDialog
    v-if="method && view"
    :selection="method"
    :revision="view.revision"
    @close="method = undefined"
  />
  <CommandEditor
    v-if="editingCommand !== undefined && view"
    :view="view"
    :command="editingCommand"
    @close="editingCommand = undefined"
    @save="notices.run(() => saveCommand($event))"
  />
</template>
