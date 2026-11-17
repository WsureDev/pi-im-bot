/// <reference types="vite/client" />
import type { Environment } from 'monaco-editor'
import type { HTMLAttributes } from 'vue'
declare module 'vue' {
  interface ComponentCustomProps extends HTMLAttributes {
    'aria-label'?: string
    type?: string
    min?: string | number
    max?: string | number
    step?: string | number
    required?: boolean
    accept?: string
    target?: string
    rel?: string
    download?: string
    autocomplete?: string
    maxlength?: string | number
    autofocus?: boolean
  }
  interface HTMLAttributes {
    dataMessageId?: string
    loading?: string | boolean
    inert?: boolean
  }
}
declare global {
  interface Window {
    MonacoEnvironment?: Environment
  }
}
