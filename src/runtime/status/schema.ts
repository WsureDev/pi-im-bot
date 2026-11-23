import { z } from 'zod'
import { LinuxMetricsSchema } from './linux-schema'

const BytesSchema = z.number().finite().nonnegative()
export const GpuDeviceSchema = z.object({
  id: z.string().optional(),
  index: z.number().int().nonnegative(),
  name: z.string().max(300),
  memoryTotalBytes: BytesSchema,
  memoryUsedBytes: BytesSchema,
  utilizationPercent: z.number().min(0).max(100).nullable(),
  temperatureC: z.number().finite().nullable(),
  powerWatts: z.number().finite().nonnegative().nullable()
})
export const GpuStatusSchema = z.object({
  provider: z.enum(['nvidia', 'amd', 'mixed']),
  source: z.enum(['nvidia-smi', 'sysfs', 'nvidia-smi+sysfs']),
  devices: z.array(GpuDeviceSchema).min(1).max(16)
})
export type GpuStatus = z.infer<typeof GpuStatusSchema>
export const RuntimeStatusSchema = z.object({
  version: z.literal(1),
  measuredAt: z.number().int(),
  observer: z.literal('bot-control-plane'),
  system: z.object({
    platform: z.string(),
    architecture: z.string(),
    kernel: z.string(),
    timezone: z.string().optional(),
    uptimeSeconds: z.number().nonnegative()
  }),
  cpu: z.object({
    model: z.string().max(300),
    logicalCpus: z.number().int().positive(),
    physicalCpus: z.number().int().positive().nullable().optional(),
    currentMHz: z.number().positive().nullable().optional(),
    usagePercent: z.number().min(0).max(100).nullable(),
    sampleMs: z.number().positive(),
    loadAverage: z.tuple([z.number(), z.number(), z.number()])
  }),
  memory: z.object({
    totalBytes: BytesSchema,
    availableBytes: BytesSchema,
    usedBytes: BytesSchema,
    usedPercent: z.number().min(0).max(100)
  }),
  swap: z.object({ totalBytes: BytesSchema, availableBytes: BytesSchema }).nullable(),
  disk: z
    .object({
      scope: z.literal('bot-data-filesystem'),
      totalBytes: BytesSchema,
      availableBytes: BytesSchema,
      usedPercent: z.number().min(0).max(100)
    })
    .nullable(),
  network: z
    .object({
      scope: z.literal('visible-interface-counters'),
      receivedBytes: BytesSchema,
      sentBytes: BytesSchema
    })
    .nullable(),
  gpu: GpuStatusSchema.nullable(),
  linux: LinuxMetricsSchema.nullable().default(null),
  bot: z.object({
    name: z.string(),
    version: z.string(),
    runtime: z.literal('bun'),
    runtimeVersion: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    rssBytes: BytesSchema,
    heapUsedBytes: BytesSchema,
    pluginsInstalled: z.number().int().nonnegative(),
    pluginsEnabled: z.number().int().nonnegative(),
    providersEnabled: z.number().int().nonnegative(),
    modelsEnabled: z.number().int().nonnegative()
  }),
  warnings: z
    .array(
      z.enum([
        'cpu-unavailable',
        'swap-unavailable',
        'disk-unavailable',
        'network-unavailable',
        'gpu-unavailable'
      ])
    )
    .max(5)
})
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>
