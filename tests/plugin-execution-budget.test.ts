import { expect, test } from 'bun:test'
import { budgetFixture, ObjectInput } from './plugin-budget-fixture'
import { untilJob } from './job-harness'
test('one Worker runs foreground no-data operation and its parser without any private volume', async () => {
  const env = await budgetFixture(1)
  try {
    const binding = await env.worker.register(
      'catalog',
      `export default {
      parsers: { parse(input) { return { text: input.text } } },
      operations: { echo(input) { return { text: input.text } } }
    }`,
      {
        operations: [
          {
            id: 'echo',
            title: 'Catalog',
            description: 'Read-only fixture',
            data: 'none',
            execution: 'foreground',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false
            }
          }
        ]
      }
    )
    env.bind([binding])
    const invocation = env.invocation()
    const entry = env.service.operation(invocation, 'plugin:catalog/echo')
    const args = await env.service.parse(
      invocation,
      entry,
      'parse',
      'foreground catalog',
      'parse',
      AbortSignal.timeout(2000)
    )
    const result = await env.service.execute(
      invocation,
      entry.capabilityId,
      args,
      'execute',
      AbortSignal.timeout(2000)
    )
    expect(result).toMatchObject({ status: 'done', result: { text: 'foreground catalog' } })
    expect(env.worker.backend.specifications.size).toBe(1)
    for (const spec of env.worker.backend.specifications.values()) {
      expect(spec.Env).toContain('BOT_PLUGIN_MODE=stateless')
      expect(
        spec.HostConfig.Mounts.some((mount) => {
          return mount.Target === '/data'
        })
      ).toBe(false)
    }
  } finally {
    await env.close()
  }
})

test('business input cannot promote a background operation, Core Job call or nested foreground dependency to foreground budget', async () => {
  const env = await budgetFixture(1)
  try {
    const target = await env.worker.register(
      'catalog',
      `export default { operations: { echo() { return { text: 'catalog' } } } }`,
      {
        operations: [
          {
            id: 'echo',
            title: 'Catalog',
            description: 'Foreground fixture',
            data: 'none',
            execution: 'foreground',
            inputSchema: ObjectInput
          },
          {
            id: 'long',
            title: 'Long',
            description: 'Background fixture',
            data: 'none',
            execution: 'background',
            inputSchema: ObjectInput
          }
        ]
      }
    )
    const parent = await env.worker.register(
      'parent',
      `export default { operations: { echo(input, context) {
      return context.host('operation:catalog/echo', { arguments: { execution: 'foreground' } })
    } } }`,
      {
        operations: [
          {
            id: 'echo',
            title: 'Parent',
            description: 'Background scope operation',
            execution: 'background',
            data: 'scope',
            grants: ['operation:catalog/echo'],
            inputSchema: ObjectInput
          }
        ]
      }
    )
    parent.instance.dependencies = { catalog: target.instance.id }
    parent.instance.grants = ['operation:catalog/echo']
    env.bind([parent, target])
    const fakeBudget = { execution: 'foreground', background: false, data: 'scope' }
    await expect(
      env.service.execute(
        env.invocation(),
        'plugin:catalog/long',
        fakeBudget,
        'declared-background',
        AbortSignal.timeout(2000)
      )
    ).rejects.toThrow('需要至少 2')
    const job = env.invocation()
    job.input = { ...job.input, context: { ...job.input.context, jobId: 'core-job-fixture' } }
    await expect(
      env.service.execute(
        job,
        'plugin:catalog/echo',
        fakeBudget,
        'core-background',
        AbortSignal.timeout(2000)
      )
    ).rejects.toThrow('需要至少 2')
    await expect(
      env.service.execute(env.invocation(), 'plugin:parent/echo', {}, 'nested', AbortSignal.timeout(2000))
    ).rejects.toThrow('需要至少 2')
    expect(
      [...env.worker.backend.specifications.values()].every((spec) => {
        return !spec.Env.includes('BOT_PLUGIN_MODE=stateless')
      })
    ).toBe(true)
    expect(env.worker.manager.status().invocations).toBe(0)
  } finally {
    await env.close()
  }
})

test('foreground no-data scope serialization survives cancellation and releases the single real Worker slot after cleanup', async () => {
  const env = await budgetFixture(1)
  const controller = new AbortController()
  const entered = Promise.withResolvers<void>()
  const calls: string[] = []
  const live = new Set<string>()
  let peak = 0
  const create = env.worker.backend.create.bind(env.worker.backend)
  const destroy = env.worker.backend.destroy.bind(env.worker.backend)
  env.worker.backend.create = async (name, spec) => {
    const id = await create(name, spec)
    live.add(id)
    peak = Math.max(peak, live.size)
    return id
  }
  env.worker.backend.destroy = async (id, name) => {
    await destroy(id, name)
    live.delete(id)
  }
  try {
    const binding = await env.worker.register(
      'serial',
      `export default { operations: { async echo(input, context) {
      await context.host('history.read', { limit: 1 })
      if (input.hold) { await new Promise((resolve) => { context.signal.addEventListener('abort', resolve, { once: true }) }) }
      return { text: 'finished' }
    } } }`,
      {
        operations: [
          {
            id: 'echo',
            title: 'Serial',
            description: 'Cancellation fixture',
            execution: 'foreground',
            data: 'none',
            grants: ['history.read'],
            inputSchema: ObjectInput
          }
        ]
      }
    )
    binding.instance.grants = ['history.read']
    env.bind([binding])
    const first = env.service.execute(
      env.invocation(() => {
        calls.push('first')
        entered.resolve()
      }),
      'plugin:serial/echo',
      { hold: true },
      'first',
      controller.signal
    )
    const observed = first.catch((error: unknown) => {
      return error
    })
    await entered.promise
    const second = env.service.execute(
      env.invocation(() => {
        calls.push('second')
      }),
      'plugin:serial/echo',
      {},
      'second',
      AbortSignal.timeout(2500)
    )
    expect(calls).toEqual(['first'])
    controller.abort(new Error('authored cancellation'))
    await observed
    expect(await second).toMatchObject({ status: 'done', result: { text: 'finished' } })
    expect(calls).toEqual(['first', 'second'])
    await untilJob(() => {
      return env.worker.manager.status().invocations === 0
    }, 'calls leaked after cancellation')
    expect(peak).toBe(1)
    expect(env.worker.backend.stopped.length).toBeGreaterThanOrEqual(1)
    expect(
      [...env.worker.backend.specifications.values()].every((spec) => {
        return !spec.HostConfig.Mounts.some((mount) => {
          return mount.Target === '/data'
        })
      })
    ).toBe(true)
  } finally {
    controller.abort()
    await env.close()
  }
})

test('foreground and background no-data operations both refuse publication from a concurrent scope Worker', async () => {
  const env = await budgetFixture(2)
  const controller = new AbortController()
  const entered = Promise.withResolvers<void>()
  let hold: Promise<unknown> | undefined
  try {
    const binding = await env.worker.register(
      'file-boundary',
      `export default { operations: {
      async hold(input, context) {
        await Bun.write(context.dataDir + '/private.txt', 'authored-private-file')
        await context.host('history.read', { limit: 1 })
        await new Promise((resolve) => { context.signal.addEventListener('abort', resolve, { once: true }) })
        return { text: 'finished' }
      },
      probe(input, context) { return context.host('artifact.publish', { path: 'private.txt', name: 'probe.txt', mimeType: 'text/plain' }) },
      probe_background(input, context) { return context.host('artifact.publish', { path: 'private.txt', name: 'probe.txt', mimeType: 'text/plain' }) }
    } }`,
      {
        operations: [
          {
            id: 'hold',
            title: 'Hold',
            description: 'Own a scope file',
            execution: 'foreground',
            data: 'scope',
            grants: ['history.read'],
            inputSchema: ObjectInput
          },
          {
            id: 'probe',
            title: 'Probe',
            description: 'Foreground isolated file probe',
            execution: 'foreground',
            data: 'none',
            grants: ['artifact.write'],
            inputSchema: ObjectInput
          },
          {
            id: 'probe_background',
            title: 'Probe',
            description: 'Background isolated file probe',
            execution: 'background',
            data: 'none',
            grants: ['artifact.write'],
            inputSchema: ObjectInput
          }
        ]
      }
    )
    binding.instance.grants = ['history.read', 'artifact.write']
    env.bind([binding])
    const request = env.invocation(() => {
      entered.resolve()
    })
    hold = env.service
      .execute(request, 'plugin:file-boundary/hold', {}, 'hold', controller.signal)
      .catch((error: unknown) => {
        return error
      })
    await entered.promise
    for (const id of ['probe', 'probe_background']) {
      await expect(
        env.service.execute(request, 'plugin:file-boundary/' + id, {}, id, AbortSignal.timeout(2000))
      ).rejects.toThrow('无数据操作不能发布私有文件')
    }
    for (const spec of env.worker.backend.specifications.values()) {
      if (spec.Env.includes('BOT_PLUGIN_MODE=stateless')) {
        expect(
          spec.HostConfig.Mounts.some((mount) => {
            return mount.Target === '/data'
          })
        ).toBe(false)
      }
    }
  } finally {
    controller.abort()
    await hold
    await env.close()
  }
})
