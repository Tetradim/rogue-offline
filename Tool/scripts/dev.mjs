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
      try {
        child?.kill?.()
      } catch {
        // Continue terminating the remaining child processes.
      }
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
    if (!child?.once) throw new TypeError(`${label} did not return a child process.`)
    children.push(child)
    child.once('error', error => shutdown(1, new Error(`${label} failed to start: ${error.message}`, { cause: error })))
    child.once('exit', code => shutdown(code ?? 1))
  }

  signalTarget.on('SIGINT', onSigint)
  signalTarget.on('SIGTERM', onSigterm)

  try {
    watchChild(spawnProcess(execPath, ['--watch', 'server/index.js'], {
      stdio: 'inherit',
      env: { ...env, POKEROGUE_STUDIO_PORT: DEVELOPMENT_PORT },
    }), 'Companion service')

    watchChild(
      spawnProcess(npmCommand, ['run', 'dev:ui'], { stdio: 'inherit' }),
      'Vite UI',
    )
  } catch (error) {
    shutdown(1, error)
  }

  return { children: [...children], shutdown }
}

const modulePath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath.toLowerCase() === path.resolve(modulePath).toLowerCase()) {
  startDevelopment()
}
