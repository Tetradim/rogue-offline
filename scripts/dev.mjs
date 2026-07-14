import { spawn as nodeSpawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEVELOPMENT_PORT = '43123'

export function startDevelopment({
  spawnProcess = nodeSpawn,
  platform = process.platform,
  execPath = process.execPath,
  env = process.env,
  signalTarget = process,
  exit = code => process.exit(code),
  onError = error => console.error(error),
} = {}) {
  const npmCommand = platform === 'win32' ? 'npm.cmd' : 'npm'
  const children = []
  let shuttingDown = false

  function removeSignalListeners() {
    signalTarget.off('SIGINT', onSigint)
    signalTarget.off('SIGTERM', onSigterm)
  }

  function shutdown(code = 0, error) {
    if (shuttingDown) return
    shuttingDown = true
    removeSignalListeners()
    if (error) {
      try {
        onError(error)
      } catch {
        // Development cleanup must continue even if reporting fails.
      }
    }
    for (const child of children) {
      if (child && child.exitCode === null && child.signalCode === null) child.kill()
    }
    exit(Number.isInteger(code) ? code : 1)
  }

  function onSigint() {
    shutdown(0)
  }

  function onSigterm() {
    shutdown(0)
  }

  function watchChild(child, label) {
    child.once('error', error => shutdown(1, new Error(`${label} failed to start: ${error.message}`, { cause: error })))
    child.once('exit', code => shutdown(code ?? 1))
    children.push(child)
  }

  const api = spawnProcess(execPath, ['--watch', 'server/index.js'], {
    stdio: 'inherit',
    env: { ...env, POKEROGUE_STUDIO_PORT: DEVELOPMENT_PORT },
  })
  watchChild(api, 'Companion service')

  const ui = spawnProcess(npmCommand, ['run', 'dev:ui'], { stdio: 'inherit' })
  watchChild(ui, 'Vite UI')

  signalTarget.on('SIGINT', onSigint)
  signalTarget.on('SIGTERM', onSigterm)

  return { children: [...children], shutdown }
}

const modulePath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === path.resolve(modulePath).toLowerCase()) {
  startDevelopment()
}
