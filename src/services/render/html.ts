import { chromium } from 'playwright-core'
import { RunLimiter } from '../../runtime/limiter'

const slots = new RunLimiter(2)

/** Render self-contained HTML using the maintained browser. No host browser or network assets. */
export async function renderHtml(html: string, width: number, signal: AbortSignal) {
  if (Buffer.byteLength(html) > 16 * 1024 * 1024) {
    throw new Error('HTML exceeds 16 MiB')
  }
  signal.throwIfAborted()
  const release = await slots.acquire(signal)
  try {
    const browser = await chromium.connectOverCDP(
      process.env.BOT_RENDER_BROWSER_URL ?? 'http://127.0.0.1:19333/profiles/default',
      { timeout: 15000 }
    )
    let page: Awaited<ReturnType<(typeof browser)['newPage']>> | undefined
    try {
      const context = browser.contexts()[0]
      if (!context) {
        throw new Error('Shared browser has no persistent context')
      }
      page = await context.newPage()
      const current = page
      const aborted = () => {
        void current.close().catch(() => {})
      }
      signal.addEventListener('abort', aborted, { once: true })
      try {
        signal.throwIfAborted()
        page.setDefaultTimeout(15000)
        await page.setViewportSize({ width, height: 721 })
        await page.route('**/*', (route) => {
          return route.abort()
        })
        const session = await context.newCDPSession(page)
        await session.send('Emulation.setScriptExecutionDisabled', { value: true })
        await page.setContent(html, { waitUntil: 'load', timeout: 15000 })
        await page.evaluate(async () => {
          await document.fonts.ready
        })
        const dimensions = await page.evaluate(() => {
          return {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
          }
        })
        if (dimensions.width > 4096 || dimensions.height > 8192) {
          throw new Error('Rendered page exceeds image dimensions')
        }
        const png = await page.screenshot({ type: 'png', fullPage: true, timeout: 15000 })
        signal.throwIfAborted()
        return png
      } finally {
        signal.removeEventListener('abort', aborted)
      }
    } finally {
      await page?.close().catch(() => {})
      // Playwright's connected browser closes the client connection, not the shared CDP browser.
      await browser.close()
    }
  } finally {
    release()
  }
}
