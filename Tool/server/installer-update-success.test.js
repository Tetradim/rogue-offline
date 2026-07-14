// @vitest-environment node

import { spawnSync } from 'node:child_process'
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

async function targetFixture() {
  const target = await temporary('mod-studio-update-target-')
  const files = {
    species: await write(target, 'src/enums/species-id.ts', [
      'export enum SpeciesId {',
      '  BULBASAUR = 1,',
      '  PECHARUNT = 1025,',
      '}',
      '',
    ].join('\n')),
    generation: await write(target, 'src/data/balance/species/generation-01.ts', [
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
    ].join('\n')),
    biome: await write(target, 'src/data/biomes/plains.ts', [
      'export const pools = {',
      '  [BiomeId.PLAINS]: [',
      '    SpeciesId.BULBASAUR,',
      '  ],',
      '};',
      '',
    ].join('\n')),
  }
  await write(target, 'src/data/ability/ability-id.ts', 'export enum AbilityId { NONE, BLAZE }\n')
  await write(target, 'src/data/moves/move-id.ts', 'export enum MoveId { NONE, EMBER }\n')
  await write(target, 'src/data/pokemon-type.ts', 'export enum PokemonType { NORMAL, FIRE }\n')
  await write(target, 'src/data/exp.ts', 'export enum GrowthRate { MEDIUM_FAST }\n')
  await write(target, 'src/data/pokemon-evolutions.ts', 'export enum EvolutionItem { FIRE_STONE }\nexport enum EvoCondKey { FRIENDSHIP, TIME, MOVE }\n')
  await write(target, 'src/data/form-change-items.ts', 'export enum FormChangeItem { MEGA_BRACELET }\n')
  await write(target, 'src/data/types/pokemon-species.ts', 'export enum TimeOfDay { DAY }\n')
  await write(target, 'src/enums/biome-id.ts', 'export enum BiomeId { PLAINS }\n')
  return { target, files }
}

function custom(category) {
  return {
    projectId: 'stage-1',
    speciesNumber: 1026,
    speciesId: 'embercub',
    enumName: 'EMBERCUB',
    name: 'Embercub',
    source: 'custom',
    category,
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
    passiveAbility: null,
    baseStats: {
      hp: 60,
      attack: 60,
      defense: 60,
      specialAttack: 60,
      specialDefense: 60,
      speed: 60,
    },
    levelUpMoves: [[1, 'EMBER']],
    tmMoves: [],
    eggMoves: [],
    forms: [],
    evolutions: [],
    encounterPlacements: [{ placementId: 'plains', biome: 'PLAINS' }],
    availability: { wildEncounters: true, starters: false, eggs: false },
    flags: { legendary: false, mythical: false, starter: false },
    assets: [],
  }
}

async function manifest(root, version, category) {
  const file = path.join(root, `${version}.json`)
  await writeFile(file, JSON.stringify({
    format: 'pokerogue-mod-studio',
    schemaVersion: 3,
    mod: { id: 'emberline', name: 'Emberline', version },
    target: { adapter: 'pokerogue-modern-source' },
    sourceRoot: root,
    customSpecies: [custom(category)],
    availabilityOverrides: [{
      speciesNumber: 1,
      speciesId: 'bulbasaur',
      enumName: 'BULBASAUR',
      name: 'Bulbasaur',
      mode: 'replace',
      replacementSpeciesNumber: 1026,
      availability: { wildEncounters: false },
    }],
  }, null, 2))
  return file
}

function run(args) {
  return spawnSync(process.execPath, [installer, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('successful transactional update', () => {
  it('plans from original backups, replaces one owned block, and still restores originals', async () => {
    const { target, files } = await targetFixture()
    const project = await temporary('mod-studio-update-project-')
    await mkdir(path.join(project, 'assets'), { recursive: true })
    const original = Object.fromEntries(await Promise.all(
      Object.entries(files).map(async ([name, file]) => [name, await readFile(file)]),
    ))
    const first = await manifest(project, '1.0.1', 'First Category')
    const second = await manifest(project, '1.0.2', 'Second Category')

    expect(run(['--manifest', first, '--project', target]).status).toBe(0)
    const update = run(['--manifest', second, '--project', target, '--force'])
    expect(update.status, update.stderr).toBe(0)

    const enumSource = await readFile(files.species, 'utf8')
    const generationSource = await readFile(files.generation, 'utf8')
    const biomeSource = await readFile(files.biome, 'utf8')
    expect(enumSource.match(/MOD-STUDIO BEGIN emberline:species-enum/g)).toHaveLength(1)
    expect(generationSource.match(/MOD-STUDIO BEGIN emberline:species-registry/g)).toHaveLength(1)
    expect(generationSource).toContain('Second Category')
    expect(generationSource).not.toContain('First Category')
    expect(biomeSource.match(/MOD-STUDIO REPLACED emberline/g)).toHaveLength(1)
    expect(biomeSource.match(/MOD-STUDIO SPAWN emberline/g)).toHaveLength(1)

    const journal = JSON.parse(await readFile(
      path.join(target, '.pokerogue-mod-studio', 'mods', 'emberline', 'journal.json'),
      'utf8',
    ))
    expect(journal.state).toBe('committed')

    const uninstall = run(['--project', target, '--uninstall', 'emberline'])
    expect(uninstall.status, uninstall.stderr).toBe(0)
    for (const [name, file] of Object.entries(files)) {
      expect(await readFile(file), `${name} was not restored`).toEqual(original[name])
    }
  })
})
