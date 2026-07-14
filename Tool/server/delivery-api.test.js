// @vitest-environment node

import { createServer, request as requestHttp } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

const servers = []

async function startApp(overrides = {}) {
  const dependencies = {
    repository: {
      create: vi.fn(),
      open: vi.fn(),
      save: vi.fn(),
    },
    assetRepository: {
      save: vi.fn(async () => ({ assetId: 'asset-1', relativePath: 'assets/stage/sprite.png' })),
      remove: vi.fn(async () => ({ removed: true })),
    },
    analyzeTarget: vi.fn(async () => ({ targetId: 'target-1', capabilities: { species: true } })),
    deliveryService: {
      plan: vi.fn(async () => ({ title: 'plan', output: 'safe' })),
      apply: vi.fn(async () => ({ title: 'install', output: 'done' })),
      uninstall: vi.fn(async () => ({ title: 'uninstall', output: 'restored' })),
      packageProject: vi.fn(async () => ({ title: 'package', packagePath: 'C:\\Exports\\mod.json' })),
    },
    selectFolder: vi.fn(async () => ''),
    staticHandler: vi.fn(async () => false),
    ...overrides,
  }
  const server = createServer(createApp(dependencies))
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, ...dependencies }
}

function post(server, pathname, body) {
  const address = server.address()
  return new Promise((resolve, reject) => {
    const request = requestHttp({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'POST',
      path: pathname,
      headers: { 'content-type': 'application/json' },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }))
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

describe('authoring and delivery API routes', () => {
  it('dispatches asset upload and removal through the contained repository', async () => {
    const { server, assetRepository } = await startApp()
    const uploaded = await post(server, '/api/projects/assets', {
      projectDir: 'C:\\Projects\\Line',
      stageId: 'stage-1',
      kind: 'sprite',
      file: { fileName: 'sprite.png', dataBase64: 'AA==' },
    })
    const removed = await post(server, '/api/projects/assets/remove', {
      projectDir: 'C:\\Projects\\Line',
      relativePath: 'assets/stage/sprite.png',
    })

    expect(uploaded.statusCode).toBe(201)
    expect(uploaded.json).toMatchObject({ assetId: 'asset-1' })
    expect(removed.json).toEqual({ removed: true })
    expect(assetRepository.save).toHaveBeenCalledWith('C:\\Projects\\Line', 'stage-1', 'sprite', expect.any(Object))
  })

  it('exposes target analysis and every transactional delivery operation', async () => {
    const { server, analyzeTarget, deliveryService } = await startApp()
    const analyzed = await post(server, '/api/targets/analyze', {
      targetDir: 'C:\\Games\\PokeRogue',
      project: { stages: [] },
    })
    const planned = await post(server, '/api/delivery/plan', {
      projectDir: 'C:\\Projects\\Line',
      targetDir: 'C:\\Games\\PokeRogue',
    })
    const installed = await post(server, '/api/delivery/apply', {
      projectDir: 'C:\\Projects\\Line',
      targetDir: 'C:\\Games\\PokeRogue',
      force: true,
    })
    const uninstalled = await post(server, '/api/delivery/uninstall', {
      targetDir: 'C:\\Games\\PokeRogue',
      modId: 'emberline',
    })
    const packaged = await post(server, '/api/delivery/package', {
      projectDir: 'C:\\Projects\\Line',
      outputDir: 'C:\\Exports',
      targetId: 'target-1',
    })

    expect(analyzed.json).toMatchObject({ targetId: 'target-1' })
    expect(planned.json).toMatchObject({ title: 'plan' })
    expect(installed.json).toMatchObject({ title: 'install' })
    expect(uninstalled.json).toMatchObject({ title: 'uninstall' })
    expect(packaged.statusCode).toBe(201)
    expect(deliveryService.apply).toHaveBeenCalledWith('C:\\Projects\\Line', 'C:\\Games\\PokeRogue', { force: true })
    expect(analyzeTarget).toHaveBeenCalledWith('C:\\Games\\PokeRogue', { stages: [] })
  })
})
