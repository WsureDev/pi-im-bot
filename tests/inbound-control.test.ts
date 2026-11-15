import { expect, test } from 'bun:test'
import { jobHarness, untilJob } from './job-harness'
import { responsesReply } from './responses-fixture'

async function congestedScope() {
  const app = await jobHarness(() => {
    return responsesReply({ kind: 'text', text: 'unused' })
  })
  app.config.bot.agent.maxQueuedRuns = 1
  app.config.framework.defaults.behavior.batchQuietMs = 1000
  const run = (await app.coordinator.receive(app.room.id, 'batching work'))!
  const message = {
    address: app.room.address,
    externalId: 'pending',
    actorId: 'member',
    actorName: 'Member',
    text: '/review pending work',
    attachments: [],
    receivedAt: Date.now()
  }
  await expect(app.coordinator.receiveIncoming(app.room.id, message, message.text)).rejects.toThrow(
    '队列已满'
  )
  return { app, run, message }
}

test('scope stop preserves a completed run whose resource release is still pending', async () => {
  const app = await jobHarness(() => {
    return responsesReply({ kind: 'text', text: 'finished' })
  })
  const releasing = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const abandon = app.runtime.abandon.bind(app.runtime)
  app.runtime.abandon = async (id) => {
    await abandon(id)
    releasing.resolve()
    await release.promise
  }
  try {
    const run = (await app.coordinator.receive(app.room.id, 'finish normally'))!
    await releasing.promise
    expect(app.store.getRun(run.id)?.status).toBe('completed')
    expect(app.coordinator.stop(app.room.id)).toBe(0)
    expect(app.store.getRun(run.id)?.status).toBe('completed')
    release.resolve()
    expect((await app.coordinator.waitRun(run.id)).status).toBe('completed')
  } finally {
    release.resolve()
    await app.close()
  }
})

test('recovery rechecks a captured pending message after a scope stop has persisted cancellation', async () => {
  const { app, message } = await congestedScope()
  const pending = app.store.pendingInbound.bind(app.store)
  let stopAtRead = true
  app.store.pendingInbound = (limit, workOnly) => {
    const captured = pending(limit, workOnly)
    if (stopAtRead) {
      stopAtRead = false
      app.coordinator.stop(app.room.id)
    }
    return captured
  }
  try {
    app.coordinator.resumeRecovery()
    await untilJob(() => {
      return app.store.findPlatformMessage(app.room.id, message.externalId)?.inbound?.state === 'cancelled'
    }, 'stop should cancel the captured input')
    await app.restart()
    expect(app.store.listRuns()).toHaveLength(1)
    expect(app.store.findPlatformMessage(app.room.id, message.externalId)?.runId).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('business congestion preserves authenticated control commands and their persistent deduplication', async () => {
  const { app, run, message } = await congestedScope()
  try {
    for (const text of [
      '/help',
      '/status',
      '/skills',
      '/jobs',
      '/job',
      '/job cancel aaaaaaaa',
      '/job aaaaaaaa'
    ]) {
      const control = { ...message, text, externalId: text }
      expect(await app.coordinator.receiveIncoming(app.room.id, control, text)).toBe('command')
      expect(await app.coordinator.receiveIncoming(app.room.id, control, text)).toBe('duplicate')
    }
    for (const text of ['/business work', '/job update aaaaaaaa 1 more work']) {
      await expect(
        app.coordinator.receiveIncoming(app.room.id, { ...message, text, externalId: text }, text)
      ).rejects.toThrow('受理队列已满')
    }
    app.config.framework.defaults.permissions.rules = [
      {
        effect: 'deny',
        capabilities: ['command:stop', 'command:new'],
        subjects: [{ kind: 'platform-user', channel: 'mock', accountId: 'mock-bot', actorId: 'member' }]
      }
    ]
    const denied = { ...message, text: '/stop', externalId: 'denied-stop' }
    await expect(app.coordinator.receiveIncoming(app.room.id, denied, denied.text)).rejects.toThrow('无权')
    expect(app.store.getRun(run.id)?.status).toBe('batching')
    expect(app.store.findPlatformMessage(app.room.id, 'pending')?.inbound?.state).toBe('pending')
    // The local operator follows the existing local authority rules.
    await app.coordinator.receive(app.room.id, '/stop')
    expect(app.store.getRun(run.id)?.status).toBe('cancelled')
    expect(app.store.findPlatformMessage(app.room.id, 'pending')?.inbound?.state).toBe('cancelled')
    expect(await app.coordinator.receiveIncoming(app.room.id, message, message.text)).toBe('duplicate')
  } finally {
    await app.close()
  }
})

test('/new bypasses business congestion, cancels old pending input, and never repeats on a duplicate', async () => {
  const { app, message } = await congestedScope()
  try {
    const command = { ...message, text: '/new', externalId: 'new-command' }
    expect(await app.coordinator.receiveIncoming(app.room.id, command, command.text)).toBe('command')
    expect(await app.coordinator.receiveIncoming(app.room.id, command, command.text)).toBe('duplicate')
    expect(app.store.listConversations(app.room.id)).toHaveLength(2)
    expect(app.store.findPlatformMessage(app.room.id, 'pending')?.inbound?.state).toBe('cancelled')
  } finally {
    await app.close()
  }
})

test('API stop prevents pending revival after the running gate opens, including after restart, while new input is accepted', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let calls = 0
  const app = await jobHarness(async () => {
    calls += 1
    if (calls === 1) {
      entered.resolve()
      await release.promise
    }
    return responsesReply({ kind: 'text', text: 'finished' })
  })
  app.config.bot.agent.maxQueuedRuns = 1
  try {
    const run = (await app.coordinator.receive(app.room.id, 'first running'))!
    await entered.promise
    const message = {
      address: app.room.address,
      externalId: 'pending-after-stop',
      actorId: 'member',
      actorName: 'Member',
      text: '/review old pending work',
      attachments: [],
      receivedAt: Date.now()
    }
    await expect(app.coordinator.receiveIncoming(app.room.id, message, message.text)).rejects.toThrow(
      '队列已满'
    )
    app.coordinator.stop(app.room.id)
    expect(app.store.findPlatformMessage(app.room.id, message.externalId)?.inbound?.state).toBe('cancelled')
    const fresh = { ...message, externalId: 'fresh-after-stop', text: '/review new after stop' }
    await expect(app.coordinator.receiveIncoming(app.room.id, fresh, fresh.text)).rejects.toThrow('队列已满')
    expect(app.store.findPlatformMessage(app.room.id, fresh.externalId)?.inbound?.state).toBe('pending')
    release.resolve()
    expect((await app.coordinator.waitRun(run.id)).status).toBe('cancelled')
    await untilJob(() => {
      return Boolean(app.store.findPlatformMessage(app.room.id, fresh.externalId)?.runId)
    }, 'new input should be admitted after capacity releases')
    const freshRunId = app.store.findPlatformMessage(app.room.id, fresh.externalId)!.runId!
    expect((await app.coordinator.waitRun(freshRunId)).status).toBe('completed')
    await untilJob(() => {
      return app.store.pendingInbound(10).length === 0
    }, 'old pending must stay terminal')
    await app.restart()
    expect(await app.coordinator.receiveIncoming(app.room.id, message, message.text)).toBe('duplicate')
    expect(calls).toBe(2)
    expect(
      app.store.listRuns().map((item) => {
        return item.input?.text
      })
    ).toEqual(['first running', '/review new after stop'])
  } finally {
    release.resolve()
    await app.close()
  }
})
