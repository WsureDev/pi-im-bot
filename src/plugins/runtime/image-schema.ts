import { z } from 'zod'

export const PluginWorkerImageSchema = z.string().min(1).max(300)
