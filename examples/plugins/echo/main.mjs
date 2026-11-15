export default {
  operations: {
    echo(input, context) {
      const config = context.invocation.settings.reply
      let text = input.text
      if (config.uppercase) {
        text = text.toUpperCase()
      }
      return { text: config.prefix + text }
    }
  }
}
