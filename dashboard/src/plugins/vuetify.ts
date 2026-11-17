import { createVuetify } from 'vuetify'
import { zhHans } from 'vuetify/locale'
import 'vuetify/styles'
import '@/assets/mdi-subset/materialdesignicons-subset.css'
import { PurpleTheme } from '@/theme/LightTheme'
import { PurpleThemeDark } from '@/theme/DarkTheme'

export const vuetify = createVuetify({
  locale: { locale: 'zhHans', messages: { zhHans } },
  theme: {
    defaultTheme: localStorage.getItem('pi.theme') ?? 'PurpleTheme',
    themes: { PurpleTheme, PurpleThemeDark }
  },
  defaults: {
    VCard: { rounded: 'lg', variant: 'flat', border: true, color: 'surface' },
    VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary', bgColor: 'inputBg' },
    VTextarea: { variant: 'outlined', color: 'primary', bgColor: 'inputBg' },
    VSelect: { variant: 'outlined', density: 'comfortable', color: 'primary', bgColor: 'inputBg' },
    VAutocomplete: { variant: 'outlined', density: 'comfortable', color: 'primary', bgColor: 'inputBg' },
    VSwitch: { color: 'primary' },
    VCheckbox: { color: 'primary' },
    VTabs: { color: 'primary' },
    VTooltip: { location: 'top' },
    VBtn: { color: 'primary', variant: 'tonal', rounded: 'lg', style: 'text-transform: none' }
  }
})
