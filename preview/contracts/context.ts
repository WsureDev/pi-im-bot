import { z } from 'zod'
import { RoleSchema } from './capabilities'

export const ActorFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  botAdmin: z.boolean(),
  description: z.string()
})
export const SceneFixtureSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['group', 'direct']),
  platform: z.string(),
  accountId: z.string(),
  channelId: z.string(),
  roles: z.record(z.string(), z.enum(['owner', 'admin', 'member']))
})
export const SimulationInputSchema = z
  .object({
    presetId: z.string(),
    capabilityId: z.string(),
    actorId: z.string(),
    sceneId: z.string(),
    surface: z.enum(['command', 'tool']),
    text: z.string().max(5000).default('画一只猫')
  })
  .strict()
export const TriggerContextSchema = z.object({
  version: z.literal(1),
  requestId: z.string(),
  origin: z.literal('preview-fixture'),
  trigger: z.object({
    surface: z.enum(['command', 'tool']),
    capabilityId: z.string(),
    ownerPluginId: z.string()
  }),
  actor: z.object({
    id: z.string(),
    name: z.string(),
    isBotAdmin: z.boolean(),
    channelRole: z.enum(['owner', 'admin', 'member', 'none']),
    roles: z.array(RoleSchema),
    evidence: z.array(z.string())
  }),
  target: SceneFixtureSchema.omit({ roles: true }),
  authorization: z.object({
    presetId: z.string(),
    presetRevision: z.number().int(),
    stateRevision: z.number().int(),
    allowed: z.boolean(),
    reasons: z.array(z.string()),
    matchedRoles: z.array(RoleSchema)
  }),
  resources: z.array(z.object({ id: z.string(), providerId: z.string(), operationId: z.string() }))
})
export type TriggerContext = z.infer<typeof TriggerContextSchema>
export const SimulationResultSchema = z.object({
  context: TriggerContextSchema,
  executed: z.boolean(),
  behavior: z.enum(['denied', 'bot-management', 'channel-management', 'standard']),
  message: z.string(),
  controls: z.object({ canManageBot: z.boolean(), canManageChannel: z.boolean(), quota: z.number().int() }),
  visibleTools: z.array(z.string()),
  trace: z.array(
    z.object({ step: z.string(), state: z.enum(['passed', 'denied', 'skipped']), detail: z.string() })
  ),
  handlerInvocations: z.number().int()
})
export type SimulationResult = z.infer<typeof SimulationResultSchema>
export const SimulationFixturesSchema = z.object({
  actors: z.array(ActorFixtureSchema),
  scenes: z.array(SceneFixtureSchema)
})
