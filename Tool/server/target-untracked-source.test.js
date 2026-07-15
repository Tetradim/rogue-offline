// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzePokeRogueTarget } from './target-discovery.js'

const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'untracked-target-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function write(root, relative, content) {
  const file = path.join(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

async function fixture() {
  const root = await temporary()
  await write(root, 'package.json', JSON.stringify({
    name: 'pokerogue',
    version: '1.0.0',
    scripts: { build: 'node -e "process.exit(0)"' },
  }))
  await write(root, 'src/enums/species-id.ts', [
    'export enum SpeciesId {',
    '  BULBASAUR = 1,',
    '  PECHARUNT = 1025,',
    '}',
    '',
  ].join('\n'))
  await write(root, 'src/enums/biome-id.ts', 'export enum BiomeId { PLAINS }\n')
  await write(root, 'src/data/ability/ability-id.ts', 'export enum AbilityId { NONE, BLAZE }\n')
  await write(root, 'src/data/moves/move-id.ts', 'export enum MoveId { NONE, EMBER }\n')
  await write(root, 'src/data/pokemon-type.ts', 'export enum PokemonType { NORMAL, FIRE }\n')
  await write(root, 'src/data/exp.ts', 'export enum GrowthRate { MEDIUM_FAST }\n')
  await write(root, 'src/data/pokemon-evolutions.ts', 'export enum EvolutionItem { FIRE_STONE }\nexport enum EvoCondKey { FRIENDSHIP, TIME, MOVE }\n')
  await write(root, 'src/data/form-change-items.ts', 'export enum FormChangeItem { MEGA_BRACELET }\n')
  await write(root, 'src/data/types/pokemon-species.ts', 'export enum TimeOfDay { DAY }\n')
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
  return root
}

function project() {
  return {
    slug: 'line',
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
    targetBindings: [],
  }
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('target Git cleanliness', () => {
  it('blocks an untracked source file even when tracked files are unchanged', async () => {
    const root = await fixture()
    await write(root, 'src/untracked-adapter.ts', 'export const untracked = true\n')

    const analysis = await analyzePokeRogueTarget(root, project())
    expect(analysis.git.changedPaths).toContain('src/untracked-adapter.ts')
    expect(analysis.git.clean).toBe(false)
    expect(analysis.validationIssues.map(item => item.code)).toContain('dirty-target')
  })

  it('ignores only Mod Studio transaction state', async () => {
    const root = await fixture()
    await write(root, '.pokerogue-mod-studio/diagnostic.txt', 'local state\n')

    const analysis = await analyzePokeRogueTarget(root, project())
    expect(analysis.git.changedPaths).toEqual([])
    expect(analysis.git.clean).toBe(true)
  })
})
