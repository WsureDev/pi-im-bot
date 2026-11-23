import { z } from 'zod'
import { OneBotIdSchema, OneBotSegmentSchema } from './protocol'

const MessageSchema = z.union([z.string(), z.array(OneBotSegmentSchema)])
const SentMessageSchema = z.object({ message_id: OneBotIdSchema })
const GroupTargetSchema = z.object({ group_id: OneBotIdSchema, message: MessageSchema })
const PrivateTargetSchema = z.object({ user_id: OneBotIdSchema, message: MessageSchema })
const ForwardNodesSchema = z.array(OneBotSegmentSchema).min(1)

export const FetchedMessageSchema = z.object({
  message_id: OneBotIdSchema,
  message_type: z.enum(['group', 'private']),
  group_id: OneBotIdSchema.optional(),
  user_id: OneBotIdSchema.optional(),
  target_id: OneBotIdSchema.optional(),
  time: z.number(),
  message: MessageSchema,
  sender: z.object({ user_id: OneBotIdSchema, nickname: z.string().optional(), card: z.string().optional() })
})
export type FetchedMessage = z.output<typeof FetchedMessageSchema>

/** The Bot's supported wire actions. NapCat extensions stay explicit. */
export const OneBotActions = {
  get_login_info: {
    params: z.object({}),
    result: z.object({ user_id: OneBotIdSchema, nickname: z.string() })
  },
  send_group_msg: { params: GroupTargetSchema, result: SentMessageSchema },
  send_private_msg: { params: PrivateTargetSchema, result: SentMessageSchema },
  send_group_forward_msg: {
    params: z.object({ group_id: OneBotIdSchema, messages: ForwardNodesSchema }),
    result: SentMessageSchema
  },
  send_private_forward_msg: {
    params: z.object({ user_id: OneBotIdSchema, messages: ForwardNodesSchema }),
    result: SentMessageSchema
  },
  delete_msg: {
    params: z.object({ message_id: OneBotIdSchema }),
    result: z.union([z.null(), z.undefined(), z.object({})])
  },
  get_image: {
    params: z.object({ file: z.string().min(1) }),
    result: z.object({ url: z.string().optional() })
  },
  get_msg: { params: z.object({ message_id: OneBotIdSchema }), result: FetchedMessageSchema },
  get_group_list: {
    params: z.object({}),
    result: z.array(z.object({ group_id: OneBotIdSchema, group_name: z.string() })).max(2000)
  }
}

export type OneBotAction = keyof typeof OneBotActions
export type ActionParams<A extends OneBotAction> = z.input<(typeof OneBotActions)[A]['params']>
export type ActionResult<A extends OneBotAction> = z.output<(typeof OneBotActions)[A]['result']>

export function actionRequest<A extends OneBotAction>(action: A, params: ActionParams<A>, echo: string) {
  return { action, params: OneBotActions[action].params.parse(params), echo }
}

export function actionResult<A extends OneBotAction>(action: A, value: unknown): ActionResult<A> {
  // The selected schema is the runtime witness for the generic action/result pairing.
  return OneBotActions[action].result.parse(value) as ActionResult<A>
}
