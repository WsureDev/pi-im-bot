import type { Subprocess } from 'bun'

export interface DevelopmentCommand {
  cmd: string[]
  cwd: string
}

/** A development session owns its children and stops all of them when one exits. */
export async function runDevelopment(commands: readonly DevelopmentCommand[]) {
  if (commands.length === 0) {
    throw new Error('Development session requires at least one command')
  }
  const children: Subprocess[] = []
  const stopped = Promise.withResolvers<number>()
  function interrupt() {
    stopped.resolve(130)
  }
  function terminate() {
    stopped.resolve(143)
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  function signalChildren(signal: NodeJS.Signals) {
    for (const child of children) {
      try {
        // Each child owns a new group, including Vite's compiler subprocesses.
        process.kill(-child.pid, signal)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
          throw error
        }
      }
    }
  }
  try {
    for (const command of commands) {
      children.push(
        Bun.spawn(command.cmd, {
          cwd: command.cwd,
          detached: true,
          stdin: 'ignore',
          stdout: 'inherit',
          stderr: 'inherit'
        })
      )
    }
    return await Promise.race([stopped.promise, ...children.map((child) => child.exited)])
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
    signalChildren('SIGTERM')
    const force = setTimeout(() => {
      signalChildren('SIGKILL')
    }, 3000)
    try {
      await Promise.all(children.map((child) => child.exited))
    } finally {
      clearTimeout(force)
    }
  }
}
