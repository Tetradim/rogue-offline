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

async function write(target, relativePath, content) {
  const file = path.join(target, relativePath)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

function pngBytes() {
  const data = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    .copy(data)
  data.write('IHDR', 12, 'ascii')
  data.writeUInt32BE(1, 16)
  data.writeUInt32BE(1, 20)
  return data
}

async function makeTarget() {
  const target = await temporary('pokerogue-installer-target-')
  const files = {
    species: await write(target, 'src/enums/species-id.ts', [
      'export enum SpeciesId {',
      '  BULBASAUR = 1,',
      '  PECHARUNT = 1025,',
      '}',
      '',
    ].join('\n')),
    generation: await write(
      target,
      'src/data/balance/species/generation-01.ts',
      [
        'import { AbilityId } from "../../ability/ability-id";',
        'import { EvoCondKey, EvolutionItem, SpeciesEvolution } from "../pokemon-evolutions";',
        'import { FormChangeItem } from "../form-change-items";',
        'import { GrowthRate } from "../exp";',
        'import { MoveId } from "../move-id";',
        'import { PokemonForm, PokemonSpecies } from "../../pokemon-species";',
        'import { PokemonType } from "../../pokemon-type";',
        'import { SpeciesFormChange, SpeciesFormChangeItemTrigger } from "../pokemon-forms";',
        'import { SpeciesId } from "../../../enums/species-id";',
        'import { EggTier, SpeciesDataMapConfig, TimeOfDay } from "../../types/pokemon-species";',
        '',
        'export function initGenerationOne(): SpeciesDataMapConfig {',
        '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
        '    [SpeciesId.BULBASAUR]: {',
        '      species: new PokemonSpecies({',
        '        forms: [new PokemonForm({ formName: "Normal", formKey: "" })],',
        '      }),',
        '    },',
        '  };',
        '',
        '  return generationOneSpeciesData;',
        '}',
        '',
      ].join('\n'),
    ),
    eggMoves: await write(
      target,
      'src/data/balance/moves/egg-moves.ts',
      [
        'export const eggMoves = {',
        '  [SpeciesId.BULBASAUR]: [MoveId.PETAL_DANCE],',
        '} satisfies Partial<Record<SpeciesId, MoveId[]>>;',
        '',
      ].join('\n'),
    ),
    biome: await write(target, 'src/data/biomes/plains.ts', [
      'export const pools = {',
      '  [BiomeId.PLAINS]: [',
      '    SpeciesId.BULBASAUR,',
      '  ],',
      '};',
      '',
    ].join('\n')),
  }
  await mkdir(path.join(target, 'public', 'images', 'pokemon'), {
    recursive: true,
  })
  return { target, files }
}

function customSpecies(name, id, overrides = {}) {
  return {
    projectId: `stage-${id}`,
    speciesNumber: id,
    speciesId: name.toLowerCase(),
    enumName: name.toUpperCase(),
    name,
    source: 'custom',
    category: 'Flame Pokémon',
    generation: 9,
    height: 1,
    weight: 10,
    growthRate: 'MEDIUM_FAST',
    baseFriendship: 50,
    captureRate: 45,
    genderRatio: 50,
    primaryType: 'FIRE',
    secondaryType: null,
    ability1: 'BLAZE',
    ability2: null,
    hiddenAbility: 'SOLAR_POWER',
    passiveAbility: 'FLASH_FIRE',
    baseStats: {
      hp: 60,
      attack: 70,
      defense: 55,
      specialAttack: 80,
      specialDefense: 60,
      speed: 75,
    },
    levelUpMoves: [[1, 'EMBER']],
    tmMoves: ['SUNNY_DAY'],
    eggMoves: ['DRAGON_DANCE'],
    forms: [],
    evolutions: [],
    encounterPlacements: [],
    availability: {
      wildEncounters: false,
      starters: true,
      eggs: true,
      trainers: true,
      bosses: true,
      specialRewards: true,
    },
    flags: { legendary: false, mythical: false, starter: true },
    assets: [],
    ...overrides,
  }
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

describe('transactional PokéRogue installer', () => {
  it('installs modern authored data and restores every file exactly', async () => {
    const { target, files } = await makeTarget()
    const portableProject = await temporary('pokerogue-installer-project-')
    const asset = pngBytes()
    const assetFile = await write(
      portableProject,
      'assets/stage-1026/sprite.png',
      asset,
    )
    const embercub = customSpecies('Embercub', 1026, {
      forms: [{
        formId: 'solar-form',
        name: 'Solar Form',
        key: 'solar',
        types: ['FIRE', 'GRASS'],
        abilities: ['BLAZE', 'CHLOROPHYLL'],
        passive: 'SOLAR_POWER',
        statOverrides: { specialAttack: 120 },
        assetVariant: 'solar',
        changeItem: 'MEGA_BRACELET',
        isStarterSelectable: true,
      }],
      evolutions: [{
        speciesId: 'emberlion',
        trigger: { type: 'friendship', friendship: 220 },
      }],
      encounterPlacements: [{
        placementId: 'placement-1',
        biome: 'PLAINS',
        weight: 4,
        minLevel: 4,
        maxLevel: 9,
      }],
      availability: {
        wildEncounters: true,
        starters: true,
        eggs: true,
        trainers: true,
        bosses: true,
        specialRewards: true,
      },
      assets: [{
        assetId: 'sprite-1',
        kind: 'sprite',
        fileName: 'sprite.png',
        relativePath: 'assets/stage-1026/sprite.png',
        mimeType: 'image/png',
        size: asset.length,
        sha256: createHash('sha256').update(asset).digest('hex'),
      }],
    })
    const manifestPath = path.join(portableProject, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({
      format: 'pokerogue-mod-studio',
      schemaVersion: 3,
      mod: { id: 'emberline', name: 'Emberline', version: '1.0.1' },
      sourceRoot: portableProject,
      customSpecies: [embercub, customSpecies('Emberlion', 1027)],
      availabilityOverrides: [{
        speciesNumber: 1,
        speciesId: 'bulbasaur',
        enumName: 'BULBASAUR',
        name: 'Bulbasaur',
        mode: 'replace',
        replacementSpeciesNumber: 1026,
        availability: {
          wildEncounters: false,
          starters: false,
          eggs: false,
          trainers: false,
          bosses: false,
          specialRewards: false,
        },
      }],
    }, null, 2))
    expect(await readFile(assetFile)).toEqual(asset)

    const originals = Object.fromEntries(await Promise.all(
      Object.entries(files).map(async ([name, file]) => [name, await readFile(file)]),
    ))
    const preflight = run([
      '--manifest', manifestPath,
      '--project', target,
      '--dry-run',
    ])
    expect(preflight.status, preflight.stderr).toBe(0)
    for (const [name, file] of Object.entries(files)) {
      expect(await readFile(file), `${name} changed during dry-run`)
        .toEqual(originals[name])
    }

    const installed = run(['--manifest', manifestPath, '--project', target])
    expect(installed.status, installed.stderr).toBe(0)
    const enumSource = await readFile(files.species, 'utf8')
    const generationSource = await readFile(files.generation, 'utf8')
    const biomeSource = await readFile(files.biome, 'utf8')
    expect(enumSource).toContain('EMBERCUB = 1026')
    expect(generationSource).toContain('species: new PokemonSpecies({')
    expect(generationSource).toContain('new PokemonForm({')
    expect(generationSource).toContain('SpeciesFormChangeItemTrigger')
    expect(generationSource).toContain('EvoCondKey.FRIENDSHIP')
    expect(biomeSource).toContain(
      'MOD-STUDIO REPLACED emberline:wildEncounters:BULBASAUR:EMBERCUB',
    )
    expect(biomeSource).toContain(
      'MOD-STUDIO SPAWN emberline:PLAINS:EMBERCUB',
    )
    expect(await readFile(path.join(
      target,
      'public',
      'images',
      'pokemon',
      '1026.png',
    ))).toEqual(asset)

    const uninstalled = run([
      '--project', target,
      '--uninstall', 'emberline',
    ])
    expect(uninstalled.status, uninstalled.stderr).toBe(0)
    for (const [name, file] of Object.entries(files)) {
      expect(await readFile(file), `${name} was not restored`)
        .toEqual(originals[name])
    }
    await expect(readFile(path.join(
      target,
      'public',
      'images',
      'pokemon',
      '1026.png',
    ))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
