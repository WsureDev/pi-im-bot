import { z } from 'zod'

const CounterSchema = z.number().finite().nonnegative()
const RateSchema = CounterSchema.nullable()
export const LinuxMetricsSchema = z.object({
  source: z.literal('procfs-sysfs'),
  sampleMs: z.number().positive(),
  cpu: z
    .array(
      z.object({
        name: z.string(),
        userPercent: RateSchema,
        systemPercent: RateSchema,
        nicePercent: RateSchema,
        ioWaitPercent: RateSchema,
        usagePercent: RateSchema
      })
    )
    .max(4096),
  memory: z
    .object({ freeBytes: CounterSchema, cachedBytes: CounterSchema, buffersBytes: CounterSchema })
    .nullable(),
  disks: z
    .array(
      z.object({
        name: z.string(),
        readBytes: CounterSchema,
        writtenBytes: CounterSchema,
        readBytesPerSecond: RateSchema,
        writtenBytesPerSecond: RateSchema,
        readsPerSecond: RateSchema,
        writesPerSecond: RateSchema,
        busyPercent: RateSchema
      })
    )
    .max(256),
  interfaces: z
    .array(
      z.object({
        name: z.string(),
        receivedBytes: CounterSchema,
        sentBytes: CounterSchema,
        receivedBytesPerSecond: RateSchema,
        sentBytesPerSecond: RateSchema,
        receiveErrors: CounterSchema,
        transmitErrors: CounterSchema,
        receiveDrops: CounterSchema,
        transmitDrops: CounterSchema
      })
    )
    .max(512),
  mounts: z
    .array(
      z.object({
        device: z.string(),
        path: z.string(),
        filesystem: z.string(),
        totalBytes: CounterSchema,
        usedBytes: CounterSchema,
        availableBytes: CounterSchema
      })
    )
    .max(256),
  temperatures: z
    .array(z.object({ name: z.string(), label: z.string(), celsius: z.number().finite() }))
    .max(256),
  pressure: z
    .array(
      z.object({
        resource: z.enum(['cpu', 'memory', 'io']),
        kind: z.enum(['some', 'full']),
        avg10: CounterSchema,
        avg60: CounterSchema,
        avg300: CounterSchema
      })
    )
    .max(6),
  warnings: z.array(z.string()).max(20)
})
export type LinuxMetrics = z.infer<typeof LinuxMetricsSchema>
