// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const installer = path.join(root, 'pokerogue-mod-installer.cjs')
const cleanups = []

async function temporary(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function pngBytes(width = 1, height = 1) {
  const data = Buffer.alloc(24)
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
  ]).copy(data)
  data.write('IHDR', 12, 'ascii')
  data.writeUInt32BE(width, 16)
  data.writeUInt32BE(height, 20)
  return data
}

async function makeModernTarget() {
  const target = await temporary('pokerogue-installer-target-')
  const files = {
    species: path.join(target, 'src', 'enums', 'species-id.ts'),
    generation: path.join(
      target,
      'src',
      'data',
      'balance',
      'species',
      'generation-01.ts',
    ),
    eggMoves: path.join(
      target,
      'src',
      'data',
      'balance',
      'moves',
      'egg-moves.ts',
    ),
    biome: path.join(target, 'src', 'data', 'biomes', 'plains.ts'),
  }
  for (const file of Object.values(files)) {
    await mkdir(path.dirname(file), { recursive: true })
  }
  await mkdir(path.join(target, 'public', 'images', 'pokemon'), {
    recursive: true,
  })
  await writeFile(files.species, [
    'export enum SpeciesId {',
    '  BULBASAUR = 1,',
    '  PECHARUNT = 1025,',
    '}',
    '',
  ].join('\n'))
  await writeFile(files.generation, [
    'import { AbilityId } from "../../abilities/ability-ids";',
    'import { EvoCondKey, EvolutionItem, SpeciesEvolution } from "../pokemon-evolutions";',
    'import { FormChangeItem } from "../form-change-items";',
    'import { GrowthRate } from "../exp";',
    'import { MoveId } from "../moves/move-ids";',
    'import { PokemonForm, PokemonSpecies } from "../../pokemon-species";',
    'import { PokemonType } from "../../types";',
    'import { SpeciesFormChange, SpeciesFormChangeItemTrigger } from "../pokemon-forms";',
    'import { SpeciesId } from "../../../enums/species-id";',
    'import { EggTier, SpeciesDataMapConfig, TimeOfDay } from "../../types/pokemon-species";',
    '',
    'export function initGenerationOne(): SpeciesDataMapConfig {',
    '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
    '    [SpeciesId.BULBASAUR]: {',
    '      species: new PokemonSpecies({',
    '        id: SpeciesId.BULBASAUR,',
    '        generation: 1,',
    '        category: "Seed Pokémon",',
    '        type1: PokemonType.GRASS,',
    '        type2: PokemonType.POISON,',
    '        height: 0.7,',
    '        weight: 6.9,',
    '        ability1: AbilityId.OVERGROW,',
    '        ability2: AbilityId.NONE,',
    '        abilityHidden: AbilityId.CHLOROPHYLL,',
    '        baseTotal: 318,',
    '        baseHp: 45,',
    '        baseAtk: 49,',
    '        baseDef: 49,',
    '        baseSpatk: 65,',
    '        baseSpdef: 65,',
    '        baseSpd: 45,',
    '        catchRate: 45,',
    '        baseFriendship: 50,',
    '        baseExp: 64,',
    '        growthRate: GrowthRate.MEDIUM_SLOW,',
    '        malePercent: 87.5,',
    '        genderDiffs: false,',
    '        forms: [new PokemonForm({',
    '          formName: "Normal",',
    '          formKey: "",',
    '          type1: PokemonType.GRASS,',
    '          type2: PokemonType.POISON,',
    '          height: 0.7,',
    '          weight: 6.9,',
    '          ability1: AbilityId.OVERGROW,',
    '          ability2: AbilityId.NONE,',
    '          abilityHidden: AbilityId.CHLOROPHYLL,',
    '          baseTotal: 318,',
    '          baseHp: 45,',
    '          baseAtk: 49,',
    '          baseDef: 49,',
    '          baseSpatk: 65,',
    '          baseSpdef: 65,',
    '          baseSpd: 45,',
    '          catchRate: 45,',
    '          baseFriendship: 50,',
    '          baseExp: 64,',
    '          genderDiffs: false,',
    '        })],',
    '      }),',
    '      eggTier: EggTier.COMMON,',
    '      evolutions: [],',
    '      passives: AbilityId.CHLOROPHYLL,',
    '      levelMoves: [],',
    '      tms: [],',
    '    },',
    '  };',
    '',
    '  return generationOneSpeciesData;',
    '}',
    '',
  ].join('\n'))
  await writeFile(files.eggMoves, [
    'import { MoveId } from "../move-ids";',
    'import { SpeciesId } from "../../../enums/species-id";',
    'export const eggMoves = {',
    '  [SpeciesId.BULBASAUR]: [MoveId.PETAL_DANCE],',
    '} satisfies Partial<Record<SpeciesId, MoveId[]>>;',
    '',
  ].join('\n'))
  await writeFile(files.biome, [
    'import { SpeciesId } from "../../enums/species-id";',
    'import { BiomeId } from "../../enums/biome-id";',
    'export const pools = {',
    '  [BiomeId.PLAINS]: [SpeciesId.BULBASAUR],',
    '};',
    '',
  ].join('\n'))
  return { target, files }
}

function species(name, id, overrides = {}) {
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
    biomes: [],
    encounterPlacements: [],
    availability: {
      wildEncounters: false,
      starters: true,
      eggs: true,
      trainers: true,
      bosses: true,
      specialRewards: true,
    },
    flags: {
      legendary: false,
      mythical: false,
      starter: true,
    },
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
  it('installs modern species data, forms, conditions, replacement, assets, and restores exactly', async () => {
    const { target, files } = await makeModernTarget()
    const portableProject = await temporary('pokerogue-installer-project-')
    const assetPath = path.join(
      portableProject,
      'assets',
      'stage-1026',
      'sprite.png',
    )
    await mkdir(path.dirname(assetPath), { recursive: true })
    const asset = pngBytes()
    await writeFile(assetPath, asset)
    const manifestPath = path.join(portableProject, 'manifest.json')
    const embercub = species('Embercub', 1026, {
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
        trigger: {
          type: 'friendship',
          friendship: 220,
        },
      }],
      biomes: ['PLAINS'],
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
    const emberlion = species('Emberlion', 1027)
    const manifest = {
      format: 'pokerogue-mod-studio',
      schemaVersion: 3,
      mod: {
        id: 'emberline',
        name: 'Emberline',
        version: '1.0.1',
      },
      sourceRoot: portableProject,
      customSpecies: [embercub, emberlion],
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
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))

    const originals = Object.fromEntries(await Promise.all(
      Object.entries(files).map(async ([name, file]) => [name, await readFile(file)]),
    ))

    const preflight = run([
      '--manifest', manifestPath,
      '--project', target,
      '--dry-run',
    ])
    expect(preflight.status, preflight.stderr).toBe(0)
    expect(preflight.stdout).toMatch(/preflight passed/i)
    for (const [name, file] of Object.entries(files)) {
      expect(await readFile(file), `${name} changed during dry-run`).toEqual(originals[name])
    }

    const installed = run([
      '--manifest', manifestPath,
      '--project', target,
    ])
    expect(installed.status, installed.stderr).toBe(0)
    const enumSource = await readFile(files.species, 'utf8')
    const generationSource = await readFile(files.generation, 'utf8')
    const biomeSource = await readFile(files.biome, 'utf8')
    expect(enumSource).toContain('EMBERCUB = 1026')
    expect(enumSource).toContain('EMBERLION = 1027')
    expect(generationSource).toContain('species: new PokemonSpecies({')
    expect(generationSource).toContain('new PokemonForm({')
    expect(generationSource).toContain('SpeciesFormChangeItemTrigger')
    expect(generationSource).toContain('EvoCondKey.FRIENDSHIP')
    expect(generationSource).toContain('generationOneSpeciesData[SpeciesId.EMBERCUB]')
    expect(biomeSource).toContain('MOD-STUDIO REPLACED emberline:wildEncounters:BULBASAUR:EMBERCUB')
    expect(biomeSource).toContain('MOD-STUDIO SPAWN emberline:PLAINS:EMBERCUB')
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
      expect(await readFile(file), `${name} was not restored`).toEqual(originals[name])
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
