export default {
  hooks: {
    async receipt(input, context) {
      if (!context.invocation.settings.enabled || input.state !== 'sent') {
        return
      }
      await context.host('delivery.recall', {
        messageId: input.messageId,
        delayMs: context.invocation.settings.delay_seconds * 1000
      })
    }
  }
}
