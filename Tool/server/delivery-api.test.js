// @vitest-environment node

import { createServer, request as requestHttp } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

const servers = []

function projectFixture() {
  return {
    revision: 4,
    stages: [{ stageId: 'stage-1', assets: [] }, { stageId: 'stage-2', assets: [] }],
    evolutionEdges: [],
    encounterPolicy: { officialLines: [], placements: [] },
    targetBindings: [],
  }
}

async function startApp(overrides = {}) {
  const repository = {
    create: vi.fn(),
    open: vi.fn(),
    save: vi.fn(async (projectDir, project) => ({ projectDir, project: { ...project, revision: project.revision + 1 } })),
  }
  const assetRepository = {
    save: vi.fn(async () => ({
      asset: { assetId: 'asset-1', kind: 'sprite', relativePath: 'assets/stage/sprite.png', fileName: 'sprite.png', mimeType: 'image/png', size: 24, sha256: 'a'.repeat(64) },
      rollback: vi.fn(async () => {}),
    })),
    quarantine: vi.fn(async () => ({ commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}) })),
    quarantineStage: vi.fn(async () => ({ commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}) })),
  }
  const dependencies = {
    repository,
    assetRepository,
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
      response.on('end', () => resolve({ statusCode: response.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

describe('authoring and delivery API routes', () => {
  it('accepts asset payloads above the former 1 MB limit and commits metadata with the file', async () => {
    const { server, assetRepository, repository } = await startApp()
    const project = projectFixture()
    const uploaded = await post(server, '/api/projects/assets', {
      projectDir: 'C:\\Projects\\Line',
      project,
      stageId: 'stage-1',
      kind: 'sprite',
      file: { fileName: 'sprite.png', dataBase64: 'A'.repeat(2 * 1024 * 1024) },
    })

    expect(uploaded.statusCode).toBe(201)
    expect(uploaded.json).toMatchObject({ asset: { assetId: 'asset-1' }, project: { revision: 6 } })
    expect(assetRepository.save).toHaveBeenCalled()
    expect(repository.save).toHaveBeenCalledWith('C:\\Projects\\Line', expect.objectContaining({ stages: [expect.objectContaining({ assets: [expect.objectContaining({ assetId: 'asset-1' })] }), expect.any(Object)] }))
  })

  it('quarantines asset and stage files until the matching metadata save succeeds', async () => {
    const { server, assetRepository } = await startApp()
    const project = {
      ...projectFixture(),
      stages: [
        { stageId: 'stage-1', assets: [{ assetId: 'asset-1', kind: 'sprite', relativePath: 'assets/stage/sprite.png' }] },
        { stageId: 'stage-2', assets: [] },
      ],
    }
    const removed = await post(server, '/api/projects/assets/remove', {
      projectDir: 'C:\\Projects\\Line',
      project,
      stageId: 'stage-1',
      assetId: 'asset-1',
      relativePath: 'assets/stage/sprite.png',
    })
    const removedStage = await post(server, '/api/projects/stages/remove', {
      projectDir: 'C:\\Projects\\Line',
      project,
      stageId: 'stage-2',
    })

    expect(removed.statusCode).toBe(200)
    expect(removed.json.project.stages[0].assets).toEqual([])
    expect(removedStage.statusCode).toBe(200)
    expect(assetRepository.quarantine).toHaveBeenCalled()
    expect(assetRepository.quarantineStage).toHaveBeenCalled()
  })

  it('passes expected revisions to every delivery operation', async () => {
    const { server, analyzeTarget, deliveryService } = await startApp()
    const analyzed = await post(server, '/api/targets/analyze', { targetDir: 'C:\\Games\\PokeRogue', project: { stages: [] } })
    const planned = await post(server, '/api/delivery/plan', { projectDir: 'C:\\Projects\\Line', targetDir: 'C:\\Games\\PokeRogue', expectedRevision: 4 })
    const installed = await post(server, '/api/delivery/apply', { projectDir: 'C:\\Projects\\Line', targetDir: 'C:\\Games\\PokeRogue', expectedRevision: 4, force: true })
    const packaged = await post(server, '/api/delivery/package', { projectDir: 'C:\\Projects\\Line', outputDir: 'C:\\Exports', expectedRevision: 4, targetId: 'target-1' })

    expect(analyzed.json).toMatchObject({ targetId: 'target-1' })
    expect(planned.json).toMatchObject({ title: 'plan' })
    expect(installed.json).toMatchObject({ title: 'install' })
    expect(packaged.statusCode).toBe(201)
    expect(deliveryService.plan).toHaveBeenCalledWith('C:\\Projects\\Line', 'C:\\Games\\PokeRogue', 4)
    expect(deliveryService.apply).toHaveBeenCalledWith('C:\\Projects\\Line', 'C:\\Games\\PokeRogue', { force: true, expectedRevision: 4 })
    expect(deliveryService.packageProject).toHaveBeenCalledWith('C:\\Projects\\Line', 'C:\\Exports', 4, 'target-1')
    expect(analyzeTarget).toHaveBeenCalledWith('C:\\Games\\PokeRogue', { stages: [] })
  })

  it('rejects unsafe uninstall IDs at the API boundary', async () => {
    const { server, deliveryService } = await startApp()
    const response = await post(server, '/api/delivery/uninstall', { targetDir: 'C:\\Games\\PokeRogue', modId: '../../escape' })
    expect(response.statusCode).toBe(400)
    expect(deliveryService.uninstall).not.toHaveBeenCalled()
  })
})
