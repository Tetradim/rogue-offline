// @vitest-environment node

import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
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

  it('uses Node launchers and preserves native failures', async () => {
    const [powershell, launch, simpleLaunch] = await Promise.all([
      readFile(path.join(rootDir, 'Launch.bat.ps1'), 'utf8'),
      readFile(path.join(rootDir, 'Launch.bat'), 'utf8'),
      readFile(path.join(rootDir, 'SimpleLaunch.bat'), 'utf8'),
    ])

    expect(powershell).toMatch(/process\.versions\.node/)
    expect(powershell).toMatch(/Node\.js 20 or newer/)
    expect(powershell).toMatch(/npm run build/)
    expect(powershell).toMatch(/node server\\index\.js --open/)
    expect(powershell).not.toMatch(/HttpListener|python/i)
    for (const wrapper of [launch, simpleLaunch]) {
      expect(wrapper).toMatch(/Launch\.bat\.ps1/)
      expect(wrapper).toMatch(/set "exitCode=%errorlevel%"/i)
      expect(wrapper).toMatch(/exit \/b %exitCode%/i)
      expect(wrapper).not.toMatch(/python|http\.server/i)
    }
  })
})
