// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDeliveryService } from './delivery-service.js'
import { createProjectAssetRepository } from './project-assets.js'
import { createProjectRepository } from './project-repository.js'
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

function pngBytes(width = 1, height = 1) {
  const data = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data)
  data.write('IHDR', 12, 'ascii')
  data.writeUInt32BE(width, 16)
  data.writeUInt32BE(height, 20)
  return data
}

async function makeTarget() {
  const root = await temporary('pokerogue-target-')
  await write(root, 'package.json', JSON.stringify({ name: 'pokerogue', version: '9.9.9', scripts: { build: 'node -e "process.exit(0)"' } }))
  await write(root, 'src/enums/species-id.ts', 'export enum SpeciesId {\n  BULBASAUR = 1,\n  PECHARUNT = 1025,\n}\n')
  await write(root, 'src/enums/biome-id.ts', 'export enum BiomeId { PLAINS }\n')
  await write(root, 'src/data/ability/ability-id.ts', 'export enum AbilityId { NONE, BLAZE }\n')
  await write(root, 'src/data/moves/move-id.ts', 'export enum MoveId { NONE, EMBER }\n')
  await write(root, 'src/data/pokemon-type.ts', 'export enum PokemonType { NORMAL, FIRE }\n')
  await write(root, 'src/data/exp.ts', 'export enum GrowthRate { MEDIUM_FAST }\n')
  await write(root, 'src/data/pokemon-evolutions.ts', 'export enum EvolutionItem { NONE, FIRE_STONE }\nexport enum EvoCondKey { FRIENDSHIP, TIME, MOVE }\n')
  await write(root, 'src/data/form-change-items.ts', 'export enum FormChangeItem { NONE, MEGA_BRACELET }\n')
  await write(root, 'src/data/types/pokemon-species.ts', 'export enum TimeOfDay { DAY, NIGHT }\n')
  await write(root, 'src/data/balance/species/generation-01.ts', [
    'import { EvoCondKey, SpeciesEvolution } from "../../pokemon-evolutions";',
    'import { FormChangeItem } from "../../form-change-items";',
    'import { MoveId } from "../../moves/move-id";',
    'import { PokemonForm, PokemonSpecies } from "../../pokemon-species";',
    'import { SpeciesFormChange, SpeciesFormChangeItemTrigger } from "../../pokemon-forms";',
    'import { SpeciesDataMapConfig, TimeOfDay } from "../../types/pokemon-species";',
    'export function initGenerationOne(): SpeciesDataMapConfig {',
    '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
    '    [SpeciesId.BULBASAUR]: { species: new PokemonSpecies({ forms: [new PokemonForm({ formName: "Normal", formKey: "" })] }) },',
    '  };',
    '  return generationOneSpeciesData;',
    '}',
    '',
  ].join('\n'))
  await write(root, 'src/data/balance/moves/egg-moves.ts', 'export const eggMoves = {} satisfies Partial<Record<SpeciesId, MoveId[]>>;\n')
  await write(root, 'src/data/biomes/plains.ts', 'const pool = {\n  [BiomeId.PLAINS]: [\n    SpeciesId.BULBASAUR,\n  ],\n};\n')
  await mkdir(path.join(root, 'public', 'images', 'pokemon'), { recursive: true })
  await mkdir(path.join(root, 'public', 'audio', 'cry'), { recursive: true })

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

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('authoring companion services', () => {
  it('detects the verified modern checkout, catalogs symbols, and allocates unused IDs', async () => {
    const target = await makeTarget()
    const analysis = await analyzePokeRogueTarget(target, {
      stages: [{ stageId: 'one', types: ['NORMAL'], abilities: [], passive: '', growthRate: 'MEDIUM_FAST', moves: { levelUp: [], tm: [], egg: [] }, forms: [] }, { stageId: 'two', types: ['FIRE'], abilities: ['BLAZE'], passive: '', growthRate: 'MEDIUM_FAST', moves: { levelUp: [], tm: [], egg: [] }, forms: [] }],
      evolutionEdges: [],
      encounterPolicy: { placements: [] },
      targetBindings: [],
    })

    expect(analysis).toMatchObject({
      adapter: 'pokerogue-modern-source',
      version: '9.9.9',
      git: { available: true, clean: true },
      buildScript: 'build',
    })
    expect(analysis.capabilities).toMatchObject({ species: true, eggMoves: true, encounters: true, sprites: true, cries: true, forms: true, formChanges: true, advancedEvolutionTriggers: true, isolatedBuild: true })
    expect(analysis.catalogCounts).toMatchObject({ PokemonType: 2, AbilityId: 2, MoveId: 2, BiomeId: 1 })
    expect(analysis.validationIssues).toEqual([])
    expect(analysis.stageAllocations).toEqual({ one: 1026, two: 1027 })
    expect(analysis.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reports unknown target symbols and dirty source as blocking analysis issues', async () => {
    const target = await makeTarget()
    await writeFile(path.join(target, 'src', 'enums', 'species-id.ts'), 'export enum SpeciesId { BULBASAUR = 1, PECHARUNT = 1025 }\n// dirty\n')
    const analysis = await analyzePokeRogueTarget(target, {
      stages: [{ stageId: 'one', types: ['COSMIC'], abilities: ['UNKNOWN'], passive: '', growthRate: 'MEDIUM_FAST', moves: { levelUp: [], tm: [], egg: [] }, forms: [] }],
      evolutionEdges: [],
      encounterPolicy: { placements: [] },
      targetBindings: [],
    })
    expect(analysis.validationIssues.map(item => item.code)).toEqual(expect.arrayContaining(['dirty-target', 'unknown-target-symbol']))
    expect(analysis.capabilities.isolatedBuild).toBe(false)
  })

  it('stores validated assets and supports reversible quarantine', async () => {
    const parent = await temporary('pokerogue-assets-')
    const repository = createProjectRepository({ idFactory: () => 'fixed-id' })
    const created = await repository.create({ parentDir: parent, name: 'Assets' })
    const assets = createProjectAssetRepository({
      idFactory: vi.fn().mockReturnValueOnce('stored').mockReturnValueOnce('record').mockReturnValueOnce('quarantine'),
    })
    const data = pngBytes()
    const transaction = await assets.save(created.projectDir, created.project.stages[0].stageId, 'sprite', {
      fileName: 'hero.png',
      mimeType: 'image/png',
      size: data.length,
      dataBase64: data.toString('base64'),
    })
    expect(transaction.asset).toMatchObject({ kind: 'sprite', fileName: 'hero.png', size: data.length, width: 1, height: 1, mimeType: 'image/png' })
    const file = path.join(created.projectDir, transaction.asset.relativePath)
    expect(await readFile(file)).toEqual(data)

    const removal = await assets.quarantine(created.projectDir, transaction.asset.relativePath)
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await removal.rollback()
    expect(await readFile(file)).toEqual(data)
    await transaction.rollback()
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(assets.save(created.projectDir, created.project.stages[0].stageId, 'sprite', {
      fileName: 'fake.png',
      size: 4,
      dataBase64: Buffer.from('nope').toString('base64'),
    })).rejects.toThrow(/signature/i)
  })

  it('pins delivery to the saved revision and verifies an isolated target build before apply', async () => {
    const parent = await temporary('pokerogue-delivery-project-')
    const output = await temporary('pokerogue-package-')
    const target = await makeTarget()
    const repository = createProjectRepository({ idFactory: () => 'fixed-id' })
    const created = await repository.create({ parentDir: parent, name: 'Delivery' })
    const calls = []
    const runProcess = vi.fn(async (file, args) => {
      calls.push([file, args])
      return { stdout: args.includes('--dry-run') ? 'source preflight ok' : 'install ok', stderr: '' }
    })
    const verifyTarget = vi.fn(async () => 'isolated build ok')
    const service = createDeliveryService({ installerPath: 'C:\\Tool\\installer.cjs', nodePath: 'node.exe', runProcess, verifyTarget })

    await expect(service.plan(created.projectDir, target, 999)).rejects.toMatchObject({ statusCode: 409 })
    const planned = await service.plan(created.projectDir, target, created.project.revision)
    expect(planned.output).toContain('isolated build ok')
    const installed = await service.apply(created.projectDir, target, { expectedRevision: created.project.revision })
    expect(installed.output).toContain('install ok')
    const updated = await service.apply(created.projectDir, target, { force: true, expectedRevision: created.project.revision })
    expect(updated.title).toMatch(/updated/i)
    expect(verifyTarget).toHaveBeenCalledTimes(3)
    expect(calls.filter(([, args]) => args.includes('--dry-run'))).toHaveLength(3)
    expect(calls.at(-1)[1]).toContain('--force')

    const packaged = await service.packageProject(created.projectDir, output, created.project.revision)
    const bundle = JSON.parse(await readFile(packaged.packagePath, 'utf8'))
    expect(bundle).toMatchObject({ format: 'pokerogue-mod-package', project: { name: 'Delivery', targetBindings: [] }, assets: [] })
  })
})
