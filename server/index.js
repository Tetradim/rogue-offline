import { spawn as nodeSpawn } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createProjectRepository } from './project-repository.js'
import { createStaticHandler } from './static-files.js'
import { selectWindowsFolder } from './windows-dialog.js'

const modulePath = fileURLToPath(import.meta.url)
const projectRoot = path.dirname(path.dirname(modulePath))

export function parsePort(value) {
  if (value === undefined) return 0
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('POKEROGUE_STUDIO_PORT must be an integer from 0 through 65535.')
  }
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('POKEROGUE_STUDIO_PORT must be an integer from 0 through 65535.')
  }
  return port
}

async function closeAfterStartupFailure(server) {
  if (!server.listening) return
  await new Promise(resolve => server.close(resolve))
}

async function containOpenerError(server, onAsyncError, error) {
  let reportedError = error
  try {
    await closeAfterStartupFailure(server)
  } catch (closeError) {
    reportedError = new AggregateError(
      [error, closeError],
      `Browser opener failed and the local server could not close: ${error.message}`,
      { cause: error },
    )
  }

  try {
    await onAsyncError(reportedError)
  } catch {
    // The detached-child error is contained even if diagnostic reporting fails.
  }
}

export async function startServer({
  env = process.env,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  spawnProcess = nodeSpawn,
  onAsyncError = () => {},
} = {}) {
  const port = parsePort(env.POKEROGUE_STUDIO_PORT)
  const app = createApp({
    repository: createProjectRepository(),
    selectFolder: selectWindowsFolder,
    staticHandler: createStaticHandler(path.join(projectRoot, 'dist')),
  })
  const server = createHttpServer(app)

  await new Promise((resolve, reject) => {
    const onStartupError = error => reject(error)
    server.once('error', onStartupError)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onStartupError)
      resolve()
    })
  })

  const address = server.address()
  const url = `http://127.0.0.1:${address.port}`
  try {
    stdout.write(`${JSON.stringify({ type: 'server-started', url })}\n`)
    if (argv.includes('--open')) {
      const child = spawnProcess(
        'cmd.exe',
        ['/c', 'start', '', url],
        { detached: true, stdio: 'ignore', windowsHide: true },
      )
      child.once('error', error => {
        void containOpenerError(server, onAsyncError, error)
      })
      child.unref()
    }
  } catch (error) {
    await closeAfterStartupFailure(server)
    throw error
  }

  return { server, url }
}

export async function runCli({
  env = process.env,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  start = startServer,
  processTarget = process,
} = {}) {
  let result
  let pendingAsyncError
  const reportError = error => {
    stderr.write(`Failed to start PokeRogue Mod Studio: ${error.message}\n`)
    processTarget.exitCode = 1
    pendingAsyncError = error
    if (result) {
      result.exitCode = 1
      result.error = error
    }
  }

  try {
    const started = await start({ env, argv, stdout, onAsyncError: reportError })
    result = { exitCode: pendingAsyncError ? 1 : 0, started }
    if (pendingAsyncError) result.error = pendingAsyncError
    return result
  } catch (error) {
    reportError(error)
    return { exitCode: 1, error }
  }
}

const invokedModule = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedModule.toLowerCase() === path.resolve(modulePath).toLowerCase()) {
  void runCli()
}
