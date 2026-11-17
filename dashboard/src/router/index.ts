import { createRouter, createWebHashHistory } from 'vue-router'
import { mayLeave } from '@/composables/drafts'
import { researchMode } from '@/research/mode'

const researchRoutes = [
  {
    path: '/orchestration/:pluginId?',
    component: () => {
      return import('@/research/flow/FlowPage.vue')
    }
  },
  {
    path: '/capabilities',
    component: () => {
      return import('@/research/permissions/CapabilitiesPage.vue')
    }
  },
  {
    path: '/trigger-context',
    component: () => {
      return import('@/research/permissions/ContextPage.vue')
    }
  },
  {
    path: '/resource-providers',
    component: () => {
      return import('@/research/resources/ResourcesPage.vue')
    }
  }
]

const liveRoutes = [
  {
    path: '/orchestration/:pluginId?',
    component: () => {
      return import('@/control/flow/FlowPage.vue')
    }
  },
  {
    path: '/resource-providers',
    component: () => {
      return import('@/control/resources/ResourcesPage.vue')
    }
  },
  {
    path: '/capabilities',
    component: () => {
      return import('@/control/CapabilitiesPage.vue')
    }
  },
  {
    path: '/trigger-context',
    component: () => {
      return import('@/control/ContextPage.vue')
    }
  }
]
export const navigation = [
  { path: '/chat', title: '聊天测试', icon: 'mdi-chat-outline' },
  { path: '/settings', title: 'Bot 设置', icon: 'mdi-cog-outline' },
  { path: '/plugins', title: '插件中心', icon: 'mdi-puzzle-outline' },
  { path: '/resources', title: 'MCP 与 Skill', icon: 'mdi-server-network' },
  { path: '/jobs', title: '后台任务', icon: 'mdi-progress-check' },
  { path: '/providers', title: '模型与 Provider', icon: 'mdi-creation' },
  { path: '/schedules', title: '计划任务', icon: 'mdi-calendar' },
  { path: '/onebot', title: 'QQ 接入', icon: 'mdi-connection' }
]

{
  navigation.unshift(
    { path: '/orchestration', title: '编排流程', icon: 'mdi-source-branch' },
    { path: '/resource-providers', title: '资源与提供者', icon: 'mdi-server-network' },
    { path: '/capabilities', title: '指令与 Tool', icon: 'mdi-console-line' },
    { path: '/trigger-context', title: '触发上下文', icon: 'mdi-shield-check-outline' }
  )
}

let landing = '/chat'
if (researchMode) {
  landing = '/orchestration'
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: landing },
    ...liveRoutes.filter(() => {
      return !researchMode
    }),
    ...researchRoutes.filter(() => {
      return researchMode
    }),
    {
      path: '/chat/:roomId?',
      component: () => {
        return import('@/views/ChatPage.vue')
      }
    },
    {
      path: '/settings',
      component: () => {
        return import('@/views/ConfigPage.vue')
      }
    },
    {
      path: '/plugins/:pluginId?',
      component: () => {
        return import('@/views/extension/PluginWorkspacePage.vue')
      }
    },
    {
      path: '/resources',
      component: () => {
        return import('@/views/ResourcesPage.vue')
      }
    },
    {
      path: '/jobs',
      component: () => {
        return import('@/views/JobsPage.vue')
      }
    },
    {
      path: '/providers',
      component: () => {
        return import('@/views/ProviderPage.vue')
      }
    },
    {
      path: '/schedules',
      component: () => {
        return import('@/views/CronJobPage.vue')
      }
    },
    {
      path: '/onebot',
      component: () => {
        return import('@/views/PlatformPage.vue')
      }
    },
    { path: '/:pathMatch(.*)*', redirect: '/chat' }
  ]
})
router.beforeEach(mayLeave)
