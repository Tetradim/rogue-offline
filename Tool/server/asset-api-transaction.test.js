// @vitest-environment node

import { createServer, request as requestHttp } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

const servers = []
const HASH = 'a'.repeat(64)

function project() {
  return {
    revision: 7,
    stages: [{
      stageId: 'stage-1',
      assets: [{
        assetId: 'old',
        kind: 'sprite',
        relativePath: 'assets/stage-1/old.png',
        fileName: 'old.png',
        mimeType: 'image/png',
        size: 24,
        sha256: HASH,
      }],
    }],
    evolutionEdges: [],
    encounterPolicy: { officialLines: [], placements: [] },
    targetBindings: [],
  }
}

async function start({ saveError = null } = {}) {
  const previous = {
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  }
  const replacement = {
    asset: {
      assetId: 'new',
      kind: 'sprite',
      relativePath: 'assets/stage-1/new.png',
      fileName: 'new.png',
      mimeType: 'image/png',
      size: 24,
      sha256: HASH,
    },
    rollback: vi.fn(async () => {}),
  }
  const repository = {
    create: vi.fn(),
    open: vi.fn(),
    save: saveError
      ? vi.fn(async () => { throw saveError })
      : vi.fn(async (projectDir, value) => ({
          projectDir,
          project: { ...value, revision: value.revision + 1 },
        })),
  }
  const assetRepository = {
    quarantine: vi.fn(async () => previous),
    quarantineStage: vi.fn(),
    save: vi.fn(async () => replacement),
  }
  const server = createServer(createApp({
    repository,
    assetRepository,
    analyzeTarget: vi.fn(),
    deliveryService: {},
    selectFolder: vi.fn(),
    staticHandler: vi.fn(async () => false),
  }))
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, repository, assetRepository, previous, replacement }
}

function post(server, body) {
  const address = server.address()
  return new Promise((resolve, reject) => {
    const request = requestHttp({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'POST',
      path: '/api/projects/assets',
      headers: { 'content-type': 'application/json' },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }))
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

describe('asset API replacement transaction', () => {
  it('commits removal of the previous role only after new metadata saves', async () => {
    const state = await start()
    const response = await post(state.server, {
      projectDir: 'C:\\Projects\\Line',
      project: project(),
      stageId: 'stage-1',
      kind: 'sprite',
      file: { fileName: 'new.png', size: 24, dataBase64: 'AA==' },
    })

    expect(response.statusCode).toBe(201)
    expect(state.assetRepository.quarantine).toHaveBeenCalledWith(
      'C:\\Projects\\Line',
      'assets/stage-1/old.png',
    )
    expect(state.previous.commit).toHaveBeenCalledOnce()
    expect(state.previous.rollback).not.toHaveBeenCalled()
    expect(state.replacement.rollback).not.toHaveBeenCalled()
    expect(state.repository.save).toHaveBeenCalledWith(
      'C:\\Projects\\Line',
      expect.objectContaining({
        stages: [expect.objectContaining({
          assets: [expect.objectContaining({ assetId: 'new' })],
        })],
      }),
    )
  })

  it('restores both files when the canonical project save fails', async () => {
    const state = await start({ saveError: new Error('save failed') })
    const response = await post(state.server, {
      projectDir: 'C:\\Projects\\Line',
      project: project(),
      stageId: 'stage-1',
      kind: 'sprite',
      file: { fileName: 'new.png', size: 24, dataBase64: 'AA==' },
    })

    expect(response.statusCode).toBe(500)
    expect(state.replacement.rollback).toHaveBeenCalledOnce()
    expect(state.previous.rollback).toHaveBeenCalledOnce()
    expect(state.previous.commit).not.toHaveBeenCalled()
  })
})
