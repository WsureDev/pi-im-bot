import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { applyTheme } from './ui/appearance'
import { i18n } from './i18n/composables'
import '@ui-sdk/core/web.css'
import './assets/mdi-subset/materialdesignicons-subset.css'
import './styles.css'

applyTheme()
createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
