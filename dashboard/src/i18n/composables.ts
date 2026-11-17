import { createI18n, useI18n as useVueI18n } from 'vue-i18n'
import common from './locales/zh-CN/core/common.json'
import shared from './locales/zh-CN/core/shared.json'
import chat from './locales/zh-CN/features/chat.json'
import configMetadata from './locales/zh-CN/features/config-metadata.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': { core: { common, shared }, features: { chat, 'config-metadata': configMetadata } } },
  missingWarn: false,
  fallbackWarn: false
})

export function useI18n() {
  return useVueI18n({ useScope: 'global' })
}

export function useModuleI18n(module: string) {
  const composer = useI18n()
  const prefix = module.replaceAll('/', '.') + '.'
  return {
    tm(key: string) {
      return composer.t(prefix + key)
    },
    getRaw(key: string) {
      if (composer.te(prefix + key)) {
        return composer.tm(prefix + key)
      }
      return undefined
    }
  }
}
