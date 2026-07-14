// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const toolRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const installer = path.join(toolRoot, 'pokerogue-mod-installer.cjs')
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

async function makeTarget({ occupied = false } = {}) {
  const target = await temporary('mod-studio-hardening-target-')
  const species = await write(target, 'src/enums/species-id.ts', [
    'export enum SpeciesId {',
    '  BULBASAUR = 1,',
    '  PECHARUNT = 1025,',
    ...(occupied ? ['  EMBERCUB = 1026,'] : []),
    '}',
    '',
  ].join('\n'))
  await write(target, 'src/data/ability/ability-id.ts', 'export enum AbilityId { NONE, BLAZE, FLASH_FIRE, SOLAR_POWER }\n')
  await write(target, 'src/data/moves/move-id.ts', 'export enum MoveId { NONE, EMBER, SUNNY_DAY, DRAGON_DANCE }\n')
  await write(target, 'src/data/pokemon-type.ts', 'export enum PokemonType { NORMAL, FIRE }\n')
  await write(target, 'src/data/exp.ts', 'export enum GrowthRate { MEDIUM_FAST }\n')
  await write(target, 'src/data/pokemon-evolutions.ts', 'export enum EvolutionItem { NONE, FIRE_STONE }\nexport enum EvoCondKey { FRIENDSHIP, TIME, MOVE }\n')
  await write(target, 'src/data/form-change-items.ts', 'export enum FormChangeItem { NONE, MEGA_BRACELET }\n')
  await write(target, 'src/data/types/pokemon-species.ts', 'export enum TimeOfDay { DAY, NIGHT }\nexport enum EggTier { COMMON }\n')
  await write(target, 'src/enums/biome-id.ts', 'export enum BiomeId { PLAINS }\n')
  const generation = await write(target, 'src/data/balance/species/generation-01.ts', [
    'import { AbilityId } from "../../ability/ability-id";',
    'import { EvoCondKey, EvolutionItem, SpeciesEvolution } from "../../pokemon-evolutions";',
    'import { FormChangeItem } from "../../form-change-items";',
    'import { GrowthRate } from "../../exp";',
    'import { MoveId } from "../../moves/move-id";',
    'import { PokemonForm, PokemonSpecies } from "../../pokemon-species";',
    'import { PokemonType } from "../../pokemon-type";',
    'import { SpeciesFormChange, SpeciesFormChangeItemTrigger } from "../../pokemon-forms";',
    'import { SpeciesId } from "../../../enums/species-id";',
    'import { EggTier, SpeciesDataMapConfig, TimeOfDay } from "../../types/pokemon-species";',
    'export function initGenerationOne(): SpeciesDataMapConfig {',
    '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
    '    [SpeciesId.BULBASAUR]: { species: new PokemonSpecies({}) },',
    '  };',
    '  // new PokemonForm({})',
    '  return generationOneSpeciesData;',
    '}',
    '',
  ].join('\n'))
  await write(target, 'src/data/balance/moves/egg-moves.ts', 'export const eggMoves = {\n} satisfies Partial<Record<SpeciesId, MoveId[]>>;\n')
  const biome = await write(target, 'src/data/biomes/plains.ts', [
    'export const pools = {',
    '  [BiomeId.PLAINS]: [',
    '    SpeciesId.BULBASAUR,',
    '  ],',
    '};',
    '',
  ].join('\n'))
  await mkdir(path.join(target, 'public', 'images', 'pokemon'), { recursive: true })
  return { target, species, generation, biome }
}

function species(overrides = {}) {
  return {
    projectId: 'stage-1',
    speciesNumber: 1026,
    speciesId: 'embercub',
    enumName: 'EMBERCUB',
    name: 'Embercub',
    source: 'custom',
    category: 'Flame Pokémon',
    generation: 9,
    height: 1,
    weight: 10,
    growthRate: 'MEDIUM_FAST',
    baseFriendship: 50,
    captureRate: 45,
    genderRatio: 50,
    genderless: false,
    primaryType: 'FIRE',
    secondaryType: null,
    ability1: 'BLAZE',
    ability2: null,
    hiddenAbility: null,
    passiveAbility: 'FLASH_FIRE',
    baseStats: { hp: 60, attack: 70, defense: 55, specialAttack: 80, specialDefense: 60, speed: 75 },
    levelUpMoves: [[1, 'EMBER']],
    tmMoves: ['SUNNY_DAY'],
    eggMoves: ['DRAGON_DANCE'],
    forms: [],
    evolutions: [],
    encounterPlacements: [],
    availability: { wildEncounters: false, starters: false, eggs: true },
    flags: { legendary: false, mythical: false, starter: false, genderless: false },
    assets: [],
    ...overrides,
  }
}

async function manifestFile(root, name, customSpecies, overrides = {}) {
  const file = path.join(root, `${name}.json`)
  await writeFile(file, JSON.stringify({
    format: 'pokerogue-mod-studio',
    schemaVersion: 3,
    mod: { id: 'emberline', name: 'Emberline', version: name },
    target: { adapter: 'pokerogue-modern-source' },
    sourceRoot: root,
    customSpecies,
    availabilityOverrides: [],
    ...overrides,
  }, null, 2))
  return file
}

function run(args) {
  return spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8', windowsHide: true })
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('installer hardening', () => {
  it('restores the previous installed transaction when replacement fails after rollback', async () => {
    const { target, species: speciesFile } = await makeTarget()
    const project = await temporary('mod-studio-hardening-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const first = await manifestFile(project, 'one', [species()])
    expect(run(['--manifest', first, '--project', target]).status).toBe(0)
    const installedSource = await readFile(speciesFile, 'utf8')

    const bytes = Buffer.from('asset data')
    const assetPath = await write(project, 'assets/stage-1/sprite.png', bytes)
    const secondSpecies = species({ assets: [{
      assetId: 'sprite',
      kind: 'sprite',
      fileName: 'sprite.png',
      relativePath: 'assets/stage-1/sprite.png',
      mimeType: 'image/png',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }] })
    expect(await readFile(assetPath)).toEqual(bytes)
    await mkdir(path.join(target, 'public', 'images', 'pokemon', '1026.png'))
    const second = await manifestFile(project, 'two', [secondSpecies])
    const updated = run(['--manifest', second, '--project', target, '--force'])

    expect(updated.status).not.toBe(0)
    expect(await readFile(speciesFile, 'utf8')).toBe(installedSource)
    const journal = JSON.parse(await readFile(path.join(target, '.pokerogue-mod-studio', 'mods', 'emberline', 'journal.json'), 'utf8'))
    expect(journal.state).toBe('committed')
  })

  it('refuses uninstall when an installed source file was edited later', async () => {
    const { target, species: speciesFile } = await makeTarget()
    const project = await temporary('mod-studio-conflict-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const manifest = await manifestFile(project, 'one', [species()])
    expect(run(['--manifest', manifest, '--project', target]).status).toBe(0)
    await writeFile(speciesFile, `${await readFile(speciesFile, 'utf8')}\n// user edit\n`)

    const result = run(['--project', target, '--uninstall', 'emberline'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/changed after/i)
    expect(await readFile(speciesFile, 'utf8')).toContain('// user edit')
  })

  it('rejects hostile uninstall IDs before constructing journal paths', async () => {
    const { target } = await makeTarget()
    const sentinel = await write(target, 'sentinel.txt', 'safe')
    const result = run(['--project', target, '--uninstall', '../../sentinel'])
    expect(result.status).not.toBe(0)
    expect(await readFile(sentinel, 'utf8')).toBe('safe')
  })

  it('treats an identical existing enum ID and name as occupied', async () => {
    const { target } = await makeTarget({ occupied: true })
    const project = await temporary('mod-studio-collision-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const manifest = await manifestFile(project, 'one', [species()])
    const result = run(['--manifest', manifest, '--project', target, '--dry-run'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/already occupied/i)
  })

  it('rejects duplicate resolved asset destinations', async () => {
    const { target } = await makeTarget()
    const project = await temporary('mod-studio-asset-collision-project-')
    const first = Buffer.from('one')
    const second = Buffer.from('two')
    await write(project, 'assets/one.png', first)
    await write(project, 'assets/two.png', second)
    const custom = species({ assets: [
      { assetId: 'one', kind: 'sprite', fileName: 'one.png', relativePath: 'assets/one.png', sha256: createHash('sha256').update(first).digest('hex') },
      { assetId: 'two', kind: 'sprite', fileName: 'two.png', relativePath: 'assets/two.png', sha256: createHash('sha256').update(second).digest('hex') },
    ] })
    const manifest = await manifestFile(project, 'one', [custom])
    const result = run(['--manifest', manifest, '--project', target, '--dry-run'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/collides/i)
  })

  it('preserves zero values and writes male percentage without inversion', async () => {
    const { target, generation } = await makeTarget()
    const project = await temporary('mod-studio-zero-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const manifest = await manifestFile(project, 'one', [species({ baseFriendship: 0, captureRate: 0, genderRatio: 25 })])
    expect(run(['--manifest', manifest, '--project', target]).status).toBe(0)
    const source = await readFile(generation, 'utf8')
    expect(source).toContain('catchRate: 0')
    expect(source).toContain('baseFriendship: 0')
    expect(source).toContain('malePercent: 25')
  })

  it('rejects unsupported egg counts and unmatched encounter biomes', async () => {
    const { target } = await makeTarget()
    const project = await temporary('mod-studio-invalid-plan-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const tooMany = await manifestFile(project, 'eggs', [species({ eggMoves: ['EMBER', 'EMBER', 'EMBER', 'EMBER', 'EMBER'] })])
    expect(run(['--manifest', tooMany, '--project', target, '--dry-run']).status).not.toBe(0)
    const missingBiome = await manifestFile(project, 'biome', [species({ encounterPlacements: [{ placementId: 'p', biome: 'PLAINS' }] })])
    await rm(path.join(target, 'src', 'data', 'biomes', 'plains.ts'))
    const result = run(['--manifest', missingBiome, '--project', target, '--dry-run'])
    expect(result.status).not.toBe(0)
  })
})
