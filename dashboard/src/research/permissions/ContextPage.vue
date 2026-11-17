<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { z } from 'zod'
import {
  SimulationFixturesSchema,
  SimulationResultSchema,
  type SimulationResult
} from '@demo/contracts/context'
import { request } from '@/api/http'
import { useResearch } from '../store'
import { useNotifications } from '@/stores/notifications'
const research = useResearch()
const notices = useNotifications()
const fixtures = ref<z.infer<typeof SimulationFixturesSchema>>()
const actorId = ref('member')
const sceneId = ref('design-group')
const capabilityId = ref('image.draw')
const surface = ref<'command' | 'tool'>('command')
const prompt = ref('画一只坐在窗边的猫')
const result = ref<SimulationResult>()
const busy = ref(false)
const resultColor = computed(() => {
  if (result.value?.executed) {
    return 'success'
  }
  return 'warning'
})
const roles = { everyone: '任何人', bot_admin: 'Bot 管理', channel_admin: '当前渠道管理' }
const contextJson = computed(() => {
  return JSON.stringify(result.value?.context, null, 2)
})
const currentFixture = computed(() => {
  return fixtures.value?.actors.find((item) => {
    return item.id === actorId.value
  })
})
const scenarioMatches = computed(() => {
  const context = result.value?.context
  return (
    context &&
    context.actor.id === actorId.value &&
    context.target.id === sceneId.value &&
    context.trigger.capabilityId === capabilityId.value &&
    context.trigger.surface === surface.value
  )
})
async function run() {
  busy.value = true
  try {
    result.value = await request('/api/research/simulate', SimulationResultSchema, {
      method: 'POST',
      data: {
        presetId: research.presetId,
        actorId: actorId.value,
        sceneId: sceneId.value,
        capabilityId: capabilityId.value,
        surface: surface.value,
        text: prompt.value
      }
    })
    await research.refresh()
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  await notices.run(async () => {
    fixtures.value = await request('/api/research/fixtures', SimulationFixturesSchema)
    await run()
  })
})
</script>
<template>
  <div class="d-flex align-center flex-wrap ga-3 mb-5">
    <div>
      <h1 class="text-h5 font-weight-bold">触发上下文</h1>
      <p class="text-medium-emphasis mt-1">用同一个触发人，验证权限如何影响指令、Tool 和后续处理分支。</p>
    </div>
    <v-spacer /><v-btn variant="tonal" color="primary" to="/capabilities">编辑权限策略</v-btn>
  </div>
  <v-card title="模拟一次触发" class="mb-5"
    ><v-card-text>
      <v-row
        ><v-col cols="12" md="4"
          ><v-select
            v-model="actorId"
            :items="fixtures?.actors"
            item-title="name"
            item-value="id"
            label="触发人"
            aria-label="触发人"
            hide-details /></v-col
        ><v-col cols="12" md="4"
          ><v-select
            v-model="sceneId"
            :items="fixtures?.scenes"
            item-title="title"
            item-value="id"
            label="聊天场景"
            aria-label="聊天场景"
            hide-details /></v-col
        ><v-col cols="12" md="4"
          ><v-select
            v-model="capabilityId"
            :items="research.snapshot?.capabilities"
            item-title="title"
            item-value="id"
            label="触发能力"
            aria-label="触发能力"
            hide-details
        /></v-col>
        <v-col cols="12" md="4"
          ><v-select
            v-model="surface"
            label="入口"
            aria-label="入口"
            :items="[
              { title: '直接指令', value: 'command' },
              { title: '模型调用 Tool', value: 'tool' }
            ]"
            hide-details /></v-col
        ><v-col cols="12" md="8"><v-text-field v-model="prompt" label="演示输入" hide-details /></v-col
      ></v-row>
      <div class="d-flex flex-wrap align-center ga-3 mt-4">
        <span class="text-body-2 text-medium-emphasis">{{ currentFixture?.description }}</span
        ><v-spacer /><v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-play"
          :loading="busy"
          @click="notices.run(run)"
          >模拟触发</v-btn
        >
      </div>
    </v-card-text></v-card
  >
  <template v-if="result">
    <v-alert v-if="!scenarioMatches" type="info" variant="tonal" class="mb-4"
      >选择已改变；以下仍是上次结果。点击“模拟触发”生成当前结果。</v-alert
    >
    <v-alert :type="resultColor" variant="tonal" class="mb-5"
      ><strong v-if="result.executed">已允许 · {{ result.context.actor.name }}</strong
      ><strong v-else>已拒绝 · {{ result.context.actor.name }}</strong>
      <p class="mt-1">{{ result.message }}</p>
      <p v-for="reason in result.context.authorization.reasons" :key="reason" class="mt-1">
        {{ reason }}
      </p></v-alert
    >
    <v-row>
      <v-col cols="12" lg="6"
        ><v-card title="身份与范围" class="mb-5"
          ><v-card-text>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-chip v-for="role in result.context.actor.roles" :key="role" color="primary">{{
                roles[role]
              }}</v-chip
              ><v-chip>{{ result.context.target.title }}</v-chip>
            </div>
            <p class="mb-2">Bot 管理身份：{{ result.context.actor.isBotAdmin }}</p>
            <p class="mb-2">当前平台角色：{{ result.context.actor.channelRole }}</p>
            <p class="mb-2">
              权限快照：{{ result.context.authorization.presetId }} · r{{
                result.context.authorization.presetRevision
              }}
            </p>
            <p
              v-for="evidence in result.context.actor.evidence"
              :key="evidence"
              class="text-caption text-medium-emphasis mt-2"
            >
              {{ evidence }}
            </p>
          </v-card-text></v-card
        >
        <v-card title="授权与调用轨迹"
          ><v-card-text
            ><div v-for="(step, index) in result.trace" :key="step.step" class="trace-row">
              <div class="trace-number">{{ index + 1 }}</div>
              <div>
                <strong>{{ step.step }}</strong
                ><v-chip size="x-small" class="ml-2">{{ step.state }}</v-chip>
                <p class="text-medium-emphasis mt-1">{{ step.detail }}</p>
              </div>
            </div></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12" lg="6"
        ><v-card title="处理器收到的权限" class="mb-5"
          ><v-card-text
            ><div class="text-h6 text-primary mb-3">{{ result.behavior }}</div>
            <p class="mb-2">
              可管理 Bot：{{ result.controls.canManageBot }}　·　可管理当前群：{{
                result.controls.canManageChannel
              }}
            </p>
            <p class="mb-2">本次演示额度：{{ result.controls.quota }}</p>
            <p class="text-caption text-medium-emphasis">
              处理器累计调用 {{ result.handlerInvocations }} 次；被拒绝的请求不会增加计数。
            </p>
          </v-card-text></v-card
        >
        <v-card title="对该身份可见的 Tool" class="mb-5"
          ><v-card-text
            ><div class="d-flex flex-wrap ga-2">
              <v-chip v-for="tool in result.visibleTools" :key="tool" color="secondary" size="small">{{
                tool
              }}</v-chip>
              <p v-if="!result.visibleTools.length">没有可用 Tool。</p>
            </div>
            <p class="text-caption text-medium-emphasis mt-3">
              列举和实际调用使用同一授权函数，调用时再次核对；不会把 Bot 自身身份授予模型或用户。
            </p></v-card-text
          ></v-card
        >
        <v-card title="已绑定的资源"
          ><v-card-text
            ><p v-for="resource in result.context.resources" :key="resource.id" class="mb-2">
              {{ resource.operationId }}<br /><span class="text-caption text-medium-emphasis">{{
                resource.id
              }}</span>
            </p>
            <p v-if="!result.context.resources.length" class="text-medium-emphasis">
              本次没有可用的绑定资源。
            </p></v-card-text
          ></v-card
        >
      </v-col>
    </v-row>
    <v-card title="TriggerContext v1 · 完整只读快照" class="mt-5"
      ><v-card-text
        ><p class="text-caption text-medium-emphasis mb-3">
          服务端根据模拟平台事实生成并冻结；客户端不提交角色声明。这里展示接口设计，不是生产群聊事件。
        </p>
        <pre class="context-json">{{ contextJson }}</pre>
      </v-card-text></v-card
    >
  </template>
</template>
<style scoped>
.trace-row {
  display: flex;
  gap: 14px;
  margin-bottom: 20px;
}
.trace-row:last-child {
  margin-bottom: 0;
}
.trace-number {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}
.context-json {
  background: rgb(var(--v-theme-background));
  padding: 20px;
  border-radius: 10px;
  overflow: auto;
  max-height: 460px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
