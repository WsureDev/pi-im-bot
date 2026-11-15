interface TextReply {
  kind: 'text'
  text: string
}
interface ToolReply {
  kind: 'tool'
  name: string
  arguments: object
}

export function responsesReply(reply: TextReply | ToolReply, completed = true) {
  const id = `resp_${crypto.randomUUID().replaceAll('-', '')}`
  const itemId = `item_${crypto.randomUUID().replaceAll('-', '')}`
  const response = {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: 'test-model',
    status: 'in_progress',
    output: []
  }
  let output: object
  const events: string[] = []
  events.push(encode({ type: 'response.created', response }))
  if (reply.kind === 'text') {
    output = {
      type: 'message',
      id: itemId,
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: reply.text, annotations: [] }]
    }
    events.push(
      encode({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: itemId, role: 'assistant', status: 'in_progress', content: [] }
      })
    )
    events.push(
      encode({
        type: 'response.output_text.delta',
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta: reply.text
      })
    )
  } else {
    output = {
      type: 'function_call',
      id: itemId,
      call_id: `call_${itemId}`,
      name: reply.name,
      arguments: JSON.stringify(reply.arguments),
      status: 'completed'
    }
    events.push(
      encode({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          id: itemId,
          call_id: `call_${itemId}`,
          name: reply.name,
          arguments: '',
          status: 'in_progress'
        }
      })
    )
    events.push(
      encode({
        type: 'response.function_call_arguments.delta',
        item_id: itemId,
        output_index: 0,
        delta: JSON.stringify(reply.arguments)
      })
    )
  }
  if (completed) {
    events.push(encode({ type: 'response.output_item.done', output_index: 0, item: output }))
    events.push(
      encode({
        type: 'response.completed',
        response: {
          ...response,
          status: 'completed',
          output: [output],
          usage: {
            input_tokens: 24,
            output_tokens: 8,
            total_tokens: 32,
            input_tokens_details: { cached_tokens: 4 },
            output_tokens_details: { reasoning_tokens: 0 }
          }
        }
      })
    )
  }
  return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } })
}

function encode(event: { type: string } & Record<string, unknown>) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
