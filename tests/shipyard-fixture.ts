import { posix } from 'node:path'
import { z } from 'zod'

const HelperSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.enum(['read', 'mkdir', 'stat', 'list', 'resolve']), path: z.string() }),
  z.object({ operation: z.literal('write'), path: z.string(), source: z.string() })
])
const ShellSchema = z.object({ command: z.string(), timeout: z.number(), cwd: z.null() })

// Simulate the remote boundary without ever evaluating a received shell command.
export function createFakeShipyard() {
  const files = new Map<string, Map<string, Buffer>>()
  const requests: Array<{
    path: string
    body: string
  }> = []
  let creations = 0
  let stops = 0
  let interrupts = 0
  let shellOutput = 'remote shell'
  let failShell = false
  let waiting: (() => void) | undefined
  let started: (() => void) | undefined
  const shellStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  function sandbox(id: string) {
    return {
      id,
      cargo_id: 'cargo-' + id,
      profile: 'python-default',
      status: 'ready',
      capabilities: ['shell', 'filesystem']
    }
  }
  function shell(output: string, exit = 0) {
    return Response.json({ success: exit === 0, output, error: null, exit_code: exit })
  }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.headers.get('authorization') !== 'Bearer test-bay-key') {
        return Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
      }
      if (url.pathname === '/v1/sandboxes' && request.method === 'POST') {
        creations += 1
        const id = 'sbx-' + creations
        files.set(id, new Map())
        return Response.json(sandbox(id), { status: 201 })
      }
      const id = url.pathname.split('/')[3]
      const data = files.get(id)
      if (!data) {
        return Response.json({ error: { code: 'not_found' } }, { status: 404 })
      }
      if (url.pathname.endsWith('/stop')) {
        stops += 1
        waiting?.()
        return Response.json({ status: 'stopped' })
      }
      if (request.method === 'GET') {
        return Response.json(sandbox(id))
      }
      if (url.pathname.endsWith('/filesystem/upload')) {
        const form = await request.formData()
        const payload = z
          .object({ path: z.string(), file: z.instanceof(File) })
          .parse({ path: form.get('path'), file: form.get('file') })
        data.set('/workspace/' + payload.path, Buffer.from(await payload.file.arrayBuffer()))
        return Response.json({ status: 'ok', path: payload.path, size: payload.file.size })
      }
      if (url.pathname.endsWith('/shell/exec')) {
        const body = await request.text()
        requests.push({ path: url.pathname, body })
        const input = ShellSchema.parse(JSON.parse(body))
        if (input.command === 'kill -KILL -- -1') {
          interrupts += 1
          waiting?.()
          return shell('', 137)
        }
        if (failShell) {
          return Response.json({ error: { code: 'unavailable' } }, { status: 503 })
        }
        if (input.command === 'wait-for-cancel') {
          started?.()
          await new Promise<void>((resolve) => {
            waiting = resolve
          })
          return shell('', 137)
        }
        if (!input.command.startsWith('node --input-type=module -e ')) {
          return shell(shellOutput)
        }
        const encoded = input.command.match(/ '([A-Za-z0-9+/=]+)'$/u)?.[1]
        if (!encoded) {
          throw new Error('Missing encoded helper payload')
        }
        const helper = HelperSchema.parse(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')))
        const path = posix.resolve('/workspace', helper.path)
        if (helper.operation === 'resolve') {
          return shell(JSON.stringify({ path }))
        }
        if (helper.operation === 'mkdir') {
          return shell('{"ok":true}')
        }
        if (helper.operation === 'write') {
          const content = data.get(helper.source)
          if (!content) {
            return shell('{"error":"ENOENT"}', 1)
          }
          data.set(path, content)
          data.delete(helper.source)
          return shell('{"ok":true}')
        }
        if (helper.operation === 'read') {
          const content = data.get(path)
          if (!content) {
            return shell('{"error":"ENOENT: remote file not found"}', 1)
          }
          return shell(JSON.stringify({ data: content.toString('base64') }))
        }
        if (helper.operation === 'stat') {
          return shell(JSON.stringify({ directory: !data.has(path) }))
        }
        const names = new Map<string, boolean>()
        for (const file of data.keys()) {
          const relative = posix.relative(path, file)
          if (!relative || relative.startsWith('../')) {
            continue
          }
          const parts = relative.split('/')
          names.set(parts[0], parts.length > 1)
        }
        return shell(
          JSON.stringify({
            entries: [...names].map(([name, directory]) => {
              return { name, directory }
            })
          })
        )
      }
      return new Response('Not found', { status: 404 })
    }
  })
  return {
    endpoint: 'http://127.0.0.1:' + server.port,
    files,
    requests,
    shellStarted,
    get creations() {
      return creations
    },
    get stops() {
      return stops
    },
    get interrupts() {
      return interrupts
    },
    output(value: string) {
      shellOutput = value
    },
    fail() {
      failShell = true
    },
    async close() {
      waiting?.()
      await server.stop(true)
    }
  }
}
