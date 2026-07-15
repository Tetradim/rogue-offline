// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzePokeRogueTarget } from './target-discovery.js'

const cleanups = []

async function temporary(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function write(root, relative, content) {
  const file = path.join(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

function hash(data) {
  return createHash('sha256').update(data).digest('hex')
}

async function targetFixture() {
  const root = await temporary('owned-target-')
  const species = await write(root, 'src/enums/species-id.ts', [
    'export enum SpeciesId {',
    '  BULBASAUR = 1,',
    '  PECHARUNT = 1025,',
    '}',
    '',
  ].join('\n'))
  await write(root, 'package.json', JSON.stringify({
    name: 'pokerogue',
    version: '1.0.0',
    scripts: { build: 'node -e "process.exit(0)"' },
  }))
  await write(root, 'src/data/ability/ability-id.ts', 'export enum AbilityId { NONE, BLAZE }\n')
  await write(root, 'src/data/moves/move-id.ts', 'export enum MoveId { NONE, EMBER }\n')
  await write(root, 'src/data/pokemon-type.ts', 'export enum PokemonType { NORMAL, FIRE }\n')
  await write(root, 'src/data/exp.ts', 'export enum GrowthRate { MEDIUM_FAST }\n')
  await write(root, 'src/data/pokemon-evolutions.ts', 'export enum EvolutionItem { FIRE_STONE }\nexport enum EvoCondKey { FRIENDSHIP, TIME, MOVE }\n')
  await write(root, 'src/data/form-change-items.ts', 'export enum FormChangeItem { MEGA_BRACELET }\n')
  await write(root, 'src/data/types/pokemon-species.ts', 'export enum TimeOfDay { DAY, NIGHT }\n')
  await write(root, 'src/enums/biome-id.ts', 'export enum BiomeId { PLAINS }\n')
  await write(root, 'src/data/balance/species/generation-01.ts', [
    'import { AbilityId } from "../../ability/ability-id";',
    'import { GrowthRate } from "../../exp";',
    'import { MoveId } from "../../moves/move-id";',
    'import { PokemonType } from "../../pokemon-type";',
    'import { SpeciesEvolution } from "../../pokemon-evolutions";',
    'import { PokemonSpecies } from "../../pokemon-species";',
    'import { SpeciesDataMapConfig } from "../../types/pokemon-species";',
    'export function initGenerationOne(): SpeciesDataMapConfig {',
    '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
    '    [SpeciesId.BULBASAUR]: { species: new PokemonSpecies({}) },',
    '  };',
    '  return generationOneSpeciesData;',
    '}',
    '',
  ].join('\n'))
  await write(root, 'src/data/biomes/plains.ts', [
    'export const pools = {',
    '  [BiomeId.PLAINS]: [',
    '    SpeciesId.BULBASAUR,',
    '  ],',
    '};',
    '',
  ].join('\n'))
  for (const args of [
    ['init'],
    ['config', 'user.email', 'studio@example.invalid'],
    ['config', 'user.name', 'Studio Test'],
    ['add', '.'],
    ['commit', '-m', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  }
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  return { root, species }
}

function project(targetDir, targetBinding = null) {
  return {
    slug: 'owned-line',
    stages: [{
      stageId: 'stage-1',
      types: ['FIRE'],
      abilities: ['BLAZE'],
      passive: '',
      growthRate: 'MEDIUM_FAST',
      moves: { levelUp: [{ level: 1, moveId: 'EMBER' }], tm: [], egg: [] },
      forms: [],
    }],
    evolutionEdges: [],
    encounterPolicy: { placements: [] },
    targetBindings: targetBinding ? [targetBinding] : [],
  }
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('owned target reanalysis', () => {
  it('keeps the baseline fingerprint and stage allocation after a valid owned install', async () => {
    const { root, species } = await targetFixture()
    const before = await analyzePokeRogueTarget(root, project(root))
    expect(before.stageAllocations).toEqual({ 'stage-1': 1026 })

    const original = await readFile(species)
    const installed = Buffer.from([
      'export enum SpeciesId {',
      '  BULBASAUR = 1,',
      '  PECHARUNT = 1025,',
      '  // MOD-STUDIO BEGIN owned-line:species-enum',
      '  OWNED_STAGE = 1026,',
      '  // MOD-STUDIO END owned-line:species-enum',
      '}',
      '',
    ].join('\n'))
    await writeFile(species, installed)
    const backup = await write(
      root,
      '.pokerogue-mod-studio/mods/owned-line/backups/src/enums/species-id.ts',
      original,
    )
    await write(
      root,
      '.pokerogue-mod-studio/mods/owned-line/journal.json',
      JSON.stringify({
        schemaVersion: 2,
        owner: 'owned-line',
        state: 'committed',
        files: [{
          path: 'src/enums/species-id.ts',
          backup: path.relative(root, backup).replaceAll('\\', '/'),
          beforeHash: hash(original),
          afterHash: hash(installed),
          status: 'applied',
        }],
        copies: [],
      }, null, 2),
    )

    const binding = {
      targetId: before.targetId,
      targetDir: root,
      adapter: before.adapter,
      stageAllocations: before.stageAllocations,
    }
    const after = await analyzePokeRogueTarget(root, project(root, binding))
    expect(after.targetId).toBe(before.targetId)
    expect(after.fingerprint).toBe(before.fingerprint)
    expect(after.stageAllocations).toEqual({ 'stage-1': 1026 })
    expect(after.git).toMatchObject({ clean: false, deliveryClean: true, ownedInstall: true })
    expect(after.validationIssues.map(item => item.code)).not.toContain('dirty-target')
  })
})
