// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runTargetPreflight } from '../pokerogue-mod-target-preflight.mjs'

const require = createRequire(import.meta.url)
const { validateManifest } = require('../installer-core.cjs')
const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'auto-detect-package-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function customSpecies() {
  return {
    projectId: 'stage-1',
    speciesNumber: 1026,
    speciesId: 'embercub',
    enumName: 'EMBERCUB',
    name: 'Embercub',
    primaryType: 'FIRE',
    secondaryType: null,
    ability1: 'BLAZE',
    ability2: null,
    hiddenAbility: null,
    passiveAbility: null,
    growthRate: 'MEDIUM_FAST',
    levelUpMoves: [[1, 'EMBER']],
    tmMoves: [],
    eggMoves: [],
    forms: [],
    evolutions: [],
    encounterPlacements: [],
    assets: [],
  }
}

function manifest() {
  return {
    format: 'pokerogue-mod-studio',
    schemaVersion: 3,
    mod: { id: 'emberline', name: 'Emberline' },
    target: { adapter: 'auto-detect', fingerprint: null },
    registry: [{ projectId: 'stage-1', speciesNumber: 1026 }],
    customSpecies: [customSpecies()],
    availabilityOverrides: [],
  }
}

function layout() {
  return {
    revision: null,
    forms: false,
    formChanges: false,
    advancedEvolutionTriggers: false,
    catalogs: {
      PokemonType: new Set(['FIRE']),
      AbilityId: new Set(['BLAZE']),
      GrowthRate: new Set(['MEDIUM_FAST']),
      MoveId: new Set(['EMBER']),
      EvolutionItem: new Set(),
      FormChangeItem: new Set(),
      TimeOfDay: new Set(),
      BiomeId: new Set(),
    },
  }
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('unbound auto-detect packages', () => {
  it('accepts auto-detect only after analysis resolves the verified modern adapter', async () => {
    const root = await temporary()
    const manifestPath = path.join(root, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify(manifest()))
    const verifyTarget = vi.fn(async () => 'compiled')

    const result = await runTargetPreflight({
      manifestPath,
      targetDir: root,
      analyzeTarget: vi.fn(async () => ({
        adapter: 'pokerogue-modern-source',
        fingerprint: 'detected',
        validationIssues: [],
      })),
      verifyTarget,
    })

    expect(result.output).toContain('Isolated target build passed')
    expect(verifyTarget).toHaveBeenCalledOnce()
  })

  it('allows auto-detect in core validation but still rejects another named adapter', () => {
    expect(() => validateManifest(
      manifest(),
      { byId: new Map(), byName: new Map() },
      layout(),
    )).not.toThrow()

    const unsupported = manifest()
    unsupported.target.adapter = 'legacy-or-foreign'
    expect(() => validateManifest(
      unsupported,
      { byId: new Map(), byName: new Map() },
      layout(),
    )).toThrow(/unsupported adapter/i)
  })
})
