// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  projectFromManifest,
  runTargetPreflight,
} from '../pokerogue-mod-target-preflight.mjs'

const require = createRequire(import.meta.url)
const { runInstaller } = require('../pokerogue-mod-package-installer.cjs')
const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'manual-package-preflight-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function manifest() {
  return {
    format: 'pokerogue-mod-studio',
    schemaVersion: 3,
    mod: { id: 'emberline', name: 'Emberline' },
    target: {
      adapter: 'pokerogue-modern-source',
      targetId: 'target-1',
      fingerprint: 'fingerprint-1',
    },
    registry: [{ projectId: 'stage-1', speciesNumber: 1026 }],
    customSpecies: [{
      projectId: 'stage-1',
      speciesId: 'embercub',
      primaryType: 'FIRE',
      secondaryType: null,
      ability1: 'BLAZE',
      ability2: null,
      hiddenAbility: null,
      passiveAbility: '',
      growthRate: 'MEDIUM_FAST',
      levelUpMoves: [[1, 'EMBER']],
      tmMoves: [],
      eggMoves: [],
      forms: [],
      evolutions: [],
      encounterPlacements: [{ placementId: 'plains', biome: 'PLAINS' }],
      assets: [],
    }],
  }
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('manual package target preflight', () => {
  it('derives symbol-validation and allocation context from a delivery manifest', () => {
    const project = projectFromManifest(manifest(), 'C:\\Games\\PokeRogue')
    expect(project).toMatchObject({
      slug: 'emberline',
      stages: [expect.objectContaining({
        stageId: 'stage-1',
        types: ['FIRE'],
        moves: { levelUp: [{ level: 1, moveId: 'EMBER' }], tm: [], egg: [] },
      })],
      encounterPolicy: {
        placements: [{
          placementId: 'plains',
          stageId: 'stage-1',
          biome: 'PLAINS',
        }],
      },
      targetBindings: [expect.objectContaining({
        targetDir: 'C:\\Games\\PokeRogue',
        stageAllocations: { 'stage-1': 1026 },
      })],
    })
  })

  it('rejects fingerprint mismatches before invoking the isolated build', async () => {
    const root = await temporary()
    const manifestPath = path.join(root, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify(manifest()))
    const verifyTarget = vi.fn()
    await expect(runTargetPreflight({
      manifestPath,
      targetDir: root,
      analyzeTarget: vi.fn(async () => ({
        adapter: 'pokerogue-modern-source',
        fingerprint: 'different',
        validationIssues: [],
      })),
      verifyTarget,
    })).rejects.toThrow(/fingerprint/i)
    expect(verifyTarget).not.toHaveBeenCalled()
  })

  it('runs isolated target verification before the real installer for manifest and package paths', async () => {
    const root = await temporary()
    const input = path.join(root, 'manifest.json')
    await writeFile(input, JSON.stringify(manifest()))
    const calls = []
    const spawnProcess = vi.fn((file, args) => {
      calls.push([file, args])
      return { status: 0 }
    })

    const status = runInstaller(
      { input, project: root, dryRun: true, force: true },
      { spawnProcess },
    )
    expect(status).toBe(0)
    expect(calls).toHaveLength(2)
    expect(calls[0][1][0]).toMatch(/pokerogue-mod-target-preflight\.mjs$/)
    expect(calls[1][1][0]).toMatch(/pokerogue-mod-installer\.cjs$/)
    expect(calls[1][1]).toEqual(expect.arrayContaining(['--dry-run', '--force']))
  })

  it('does not invoke the real installer when isolated verification fails', async () => {
    const root = await temporary()
    const input = path.join(root, 'manifest.json')
    await writeFile(input, JSON.stringify(manifest()))
    const spawnProcess = vi.fn()
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 })

    expect(runInstaller({ input, project: root }, { spawnProcess })).toBe(1)
    expect(spawnProcess).toHaveBeenCalledTimes(1)
  })
})
