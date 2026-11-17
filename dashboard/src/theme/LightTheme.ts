import type { ThemeTypes } from '@/types/themeTypes/ThemeType'

const PurpleTheme: ThemeTypes = {
  name: 'PurpleTheme',
  dark: false,
  variables: {
    'border-color': '#9aafc5',
    'border-opacity': 0.35,
    'carousel-control-size': 10
  },
  colors: {
    primary: '#216fa6',
    secondary: '#536d89',
    info: '#247da8',
    success: '#177d54',
    accent: '#FFAB91',
    warning: '#a86b12',
    error: '#c33d4c',
    lightprimary: '#e9f2fb',
    lightsecondary: '#edf1f7',
    lightsuccess: '#b9f6ca',
    lighterror: '#f9d8d8',
    lightwarning: '#fff8e1',
    primaryText: '#203248',
    secondaryText: '#607187',
    darkprimary: '#1565c0',
    darksecondary: '#236b99',
    borderLight: '#d1ddea',
    border: '#d1ddea',
    inputBorder: '#a9bacd',
    containerBg: '#f2f5fa',
    surface: '#fff',
    'surface-variant': '#e8eef6',
    'on-surface': '#203248',
    'on-surface-variant': '#536b84',
    'on-primary': '#ffffff',
    'on-background': '#203248',
    inputBg: '#f8fafd',
    facebook: '#4267b2',
    twitter: '#1da1f2',
    linkedin: '#0e76a8',
    gray100: '#fafafacc',
    primary200: '#90caf9',
    secondary200: '#8cc4e1',
    background: '#f2f5fa',
    overlay: '#ffffffaa',
    codeBg: '#ececec',
    preBg: 'rgb(249, 249, 249)',
    code: 'rgb(13, 13, 13)',
    chatMessageBubble: '#e7ebf4',
    mcpCardBg: '#ecf2faff'
  }
}

export { PurpleTheme }
