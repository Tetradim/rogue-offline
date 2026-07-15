// @vitest-environment node

import { EventEmitter } from 'node:events'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import viteConfig from '../vite.config.js'
import { startDevelopment } from './dev.mjs'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

class FakeChild extends EventEmitter {
  kill = vi.fn(() => true)
}

describe('development orchestration', () => {
  it('starts the companion watcher and Vite UI on the fixed proxy port', () => {
    const children = [new FakeChild(), new FakeChild()]
    const spawnProcess = vi.fn(() => children.shift())
    const signalTarget = new EventEmitter()

    const started = startDevelopment({
      spawnProcess,
      platform: 'win32',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      env: { EXISTING: 'value' },
      signalTarget,
      exit: vi.fn(),
      onError: vi.fn(),
    })

    expect(spawnProcess).toHaveBeenNthCalledWith(1,
      'C:\\Program Files\\nodejs\\node.exe',
      ['--watch', 'server/index.js'],
      {
        stdio: 'inherit',
        env: { EXISTING: 'value', POKEROGUE_STUDIO_PORT: '43123' },
      },
    )
    expect(spawnProcess).toHaveBeenNthCalledWith(2,
      'npm.cmd',
      ['run', 'dev:ui'],
      { stdio: 'inherit' },
    )
    expect(started.children).toHaveLength(2)
  })

  it('shuts down both processes once when either child fails', () => {
    const api = new FakeChild()
    const ui = new FakeChild()
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(api)
      .mockReturnValueOnce(ui)
    const signalTarget = new EventEmitter()
    const exit = vi.fn()

    startDevelopment({ spawnProcess, signalTarget, exit, onError: vi.fn() })
    api.emit('exit', 7)
    ui.emit('exit', 0)

    expect(api.kill).toHaveBeenCalledOnce()
    expect(ui.kill).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledExactlyOnceWith(7)
    expect(signalTarget.listenerCount('SIGINT')).toBe(0)
    expect(signalTarget.listenerCount('SIGTERM')).toBe(0)
  })

  it('rewrites the development proxy boundary to the companion origin', () => {
    expect(viteConfig.server.host).toBe('127.0.0.1')
    expect(viteConfig.server.proxy['/api']).toMatchObject({
      target: 'http://127.0.0.1:43123',
      changeOrigin: true,
      headers: { origin: 'http://127.0.0.1:43123' },
    })
  })

  it('uses exactly one updating launcher and one no-update launcher', async () => {
    const [updating, offline] = await Promise.all([
      readFile(path.join(rootDir, 'Launch-Updating.bat'), 'utf8'),
      readFile(path.join(rootDir, 'Launch-Offline.bat'), 'utf8'),
    ])

    expect(offline).toMatch(/process\.versions\.node/)
    expect(offline).toMatch(/Node\.js 20 or newer/)
    expect(offline).toMatch(/npm\.cmd ci/)
    expect(offline).toMatch(/npm\.cmd run build/)
    expect(offline).toMatch(/node\.exe server\\index\.js --open/)
    expect(offline).not.toMatch(/raw\.githubusercontent|api\.github\.com|http\.server|python/i)

    expect(updating).toMatch(/api\.github\.com\/repos\/\$repoOwner\/\$repoName\/commits\/\$branch/)
    expect(updating).toMatch(/git\/trees\/\$\(\$toolEntry\.sha\)\?recursive=1/)
    expect(updating).toMatch(/raw\.githubusercontent\.com/)
    expect(updating).toMatch(/Get-GitBlobSha/)
    expect(updating).toMatch(/\[ROLLBACK\]/)
    expect(updating).toMatch(/call "%~dp0Launch-Offline\.bat"/)
    expect(updating).not.toMatch(/move-audio-to-tetradim|http\.server|python/i)

    for (const obsolete of [
      'Launch.bat',
      'Launch.bat.ps1',
      'LauncherWithUpdater.bat',
      'SimpleLaunch.bat',
      'Updater.ps1',
      'UpdaterOnly.bat',
      'update_js.py',
    ]) {
      await expect(access(path.join(rootDir, obsolete))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })
})
