import { expect, test } from 'bun:test'
import { budgetFixture, ObjectInput } from './plugin-budget-fixture'

test('data:scope keeps one serial private-data lane across trusted foreground/background categories', async () => {
  const env = await budgetFixture(2)
  const entered = Promise.withResolvers<void>()
  const release = new AbortController()
  const calls: string[] = []
  let first: Promise<unknown> | undefined
  try {
    const binding = await env.worker.register(
      'serial-scope',
      `export default {operations:{async hold(input,context){await context.host('history.read',{limit:1});await new Promise(resolve=>{context.signal.addEventListener('abort',resolve,{once:true})});return {text:'released'}},read(){return {text:'read'}}}}`,
      {
        operations: [
          {
            id: 'hold',
            title: 'Hold',
            description: 'Private-data background',
            data: 'scope',
            execution: 'background',
            grants: ['history.read'],
            inputSchema: ObjectInput
          },
          {
            id: 'read',
            title: 'Read',
            description: 'Private-data foreground',
            data: 'scope',
            execution: 'foreground',
            inputSchema: ObjectInput
          }
        ]
      }
    )
    binding.instance.grants = ['history.read']
    env.bind([binding])
    const held = env.invocation()
    const invocation = {
      ...held,
      services: {
        ...held.services,
        history() {
          calls.push('background')
          entered.resolve()
          return []
        }
      }
    }
    first = env.service
      .execute(invocation, 'plugin:serial-scope/hold', {}, 'hold', release.signal)
      .catch((error) => {
        return error
      })
    await entered.promise
    const read = env.service.execute(
      env.invocation(),
      'plugin:serial-scope/read',
      {},
      'read',
      AbortSignal.timeout(3000)
    )
    let readFinished = false
    const observed = read.then((result) => {
      readFinished = true
      return result
    })
    await Bun.sleep(25)
    expect(readFinished).toBe(false)
    expect(env.worker.backend.specifications.size).toBe(1)
    release.abort()
    await first
    expect(await observed).toMatchObject({ status: 'done', result: { text: 'read' } })
    expect(calls).toEqual(['background'])
  } finally {
    release.abort()
    await first?.catch(() => {})
    await env.close()
  }
})

test('a nested foreground dependency of background no-data work uses its actual background key and cannot evade reentry', async () => {
  const env = await budgetFixture(2)
  try {
    const binding = await env.worker.register(
      'self-lane',
      `export default {operations:{hold(input,context){return context.host('operation:self/read',{arguments:{execution:'foreground'}})},read(){return {text:'must not enter another lane'}}}}`,
      {
        operations: [
          {
            id: 'hold',
            title: 'Hold',
            description: 'Background parent',
            data: 'none',
            execution: 'background',
            inputSchema: ObjectInput,
            grants: ['operation:self/read']
          },
          {
            id: 'read',
            title: 'Read',
            description: 'Foreground dependency',
            data: 'none',
            execution: 'foreground',
            inputSchema: ObjectInput
          }
        ]
      }
    )
    binding.instance.dependencies = { self: binding.instance.id }
    binding.instance.grants = ['operation:self/read']
    env.bind([binding])
    await expect(
      env.service.execute(env.invocation(), 'plugin:self-lane/hold', {}, 'hold', AbortSignal.timeout(2000))
    ).rejects.toThrow('重入环路')
    expect(env.worker.backend.specifications.size).toBe(1)
    expect(env.worker.manager.status().invocations).toBe(0)
  } finally {
    await env.close()
  }
})
