import { filesProvider } from './files'
import { httpProvider } from './http-api'
import { gsviProvider } from './gsvi'
import { comfyProvider } from './comfy'
import { labProvider } from './lab'

// The preview harness knows these authored modules. The registry itself is vendor-neutral.
export const providerModules = [gsviProvider, comfyProvider, labProvider, httpProvider, filesProvider]
