// @vitest-environment node

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
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

async function makeTarget() {
  const root = await temporary('pokerogue-target-')
  await mkdir(path.join(root, 'src', 'enums'), { recursive: true })
  await mkdir(path.join(root, 'src', 'data', 'balance', 'species'), {
    recursive: true,
  })
  await mkdir(path.join(root, 'src', 'data', 'balance', 'moves'), {
    recursive: true,
  })
  await mkdir(path.join(root, 'src', 'data', 'biomes'), { recursive: true })
  await mkdir(path.join(root, 'public', 'images', 'pokemon'), {
    recursive: true,
  })
  await mkdir(path.join(root, 'public', 'audio', 'cry'), { recursive: true })
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'pokerogue', version: '9.9.9' }),
  )
  await writeFile(
    path.join(root, 'src', 'enums', 'species-id.ts'),
    'export enum SpeciesId {\n  BULBASAUR = 1,\n  PECHARUNT = 1025,\n}\n',
  )
  await writeFile(
    path.join(root, 'src', 'data', 'balance', 'species', 'generation-01.ts'),
    [
      'import { EvoCondKey, SpeciesEvolution } from "../pokemon-evolutions";',
      'import { FormChangeItem } from "../form-change-items";',
      'import { MoveId } from "../moves/move-ids";',
      'import { PokemonForm, PokemonSpecies } from "../../pokemon-species";',
      'import { SpeciesFormChange, SpeciesFormChangeItemTrigger } from "../pokemon-forms";',
      'import { SpeciesDataMapConfig, TimeOfDay } from "../../types/pokemon-species";',
      'export function initGenerationOne(): SpeciesDataMapConfig {',
      '  const generationOneSpeciesData: SpeciesDataMapConfig = {',
      '    [SpeciesId.BULBASAUR]: {',
      '      species: new PokemonSpecies({',
      '        forms: [new PokemonForm({ formName: "Normal", formKey: "" })],',
      '      }),',
      '    },',
      '  };',
      '  return generationOneSpeciesData;',
      '}',
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'src', 'data', 'balance', 'moves', 'egg-moves.ts'),
    'export const eggMoves = {} satisfies Partial<Record<SpeciesId, MoveId[]>>;\n',
  )
  await writeFile(
    path.join(root, 'src', 'data', 'biomes', 'plains.ts'),
    'const pool = { [BiomeId.PLAINS]: [SpeciesId.BULBASAUR] };\n',
  )
  return root
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('authoring companion services', () => {
  it('detects a compatible arbitrary checkout and allocates unused stage IDs', async () => {
    const target = await makeTarget()
    const analysis = await analyzePokeRogueTarget(target, {
      stages: [{ stageId: 'one' }, { stageId: 'two' }],
    })

    expect(analysis).toMatchObject({
      adapter: 'pokerogue-modern-source',
      version: '9.9.9',
    })
    expect(analysis.capabilities).toMatchObject({
      species: true,
      eggMoves: true,
      encounters: true,
      sprites: true,
      cries: true,
      forms: true,
      formChanges: true,
      advancedEvolutionTriggers: true,
    })
    expect(analysis.stageAllocations).toEqual({ one: 1026, two: 1027 })
    expect(analysis.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stores and removes validated assets inside a portable project', async () => {
    const parent = await temporary('pokerogue-assets-')
    const repository = createProjectRepository({ idFactory: () => 'fixed-id' })
    const created = await repository.create({
      parentDir: parent,
      name: 'Assets',
    })
    const assets = createProjectAssetRepository({
      idFactory: vi.fn()
        .mockReturnValueOnce('stored')
        .mockReturnValueOnce('record'),
    })
    const data = pngBytes()

    const asset = await assets.save(
      created.projectDir,
      created.project.stages[0].stageId,
      'sprite',
      {
        fileName: 'hero.png',
        mimeType: 'image/png',
        size: data.length,
        dataBase64: data.toString('base64'),
      },
    )
    expect(asset).toMatchObject({
      kind: 'sprite',
      fileName: 'hero.png',
      size: data.length,
      width: 1,
      height: 1,
      mimeType: 'image/png',
    })
    expect(await readFile(path.join(created.projectDir, asset.relativePath)))
      .toEqual(data)
    await expect(assets.remove(created.projectDir, asset.relativePath))
      .resolves.toEqual({ removed: true })
    await expect(assets.save(
      created.projectDir,
      created.project.stages[0].stageId,
      'sprite',
      {
        fileName: 'fake.png',
        size: 4,
        dataBase64: Buffer.from('nope').toString('base64'),
      },
    )).rejects.toThrow(/signature/i)
  })

  it('runs preflight before install and journal validation before update', async () => {
    const parent = await temporary('pokerogue-delivery-project-')
    const output = await temporary('pokerogue-package-')
    const target = await makeTarget()
    const repository = createProjectRepository({ idFactory: () => 'fixed-id' })
    const created = await repository.create({
      parentDir: parent,
      name: 'Delivery',
    })
    const calls = []
    const runProcess = vi.fn(async (file, args) => {
      calls.push([file, args])
      return {
        stdout: args.includes('--dry-run') ? 'preflight ok' : 'install ok',
        stderr: '',
      }
    })
    const service = createDeliveryService({
      installerPath: 'C:\\Tool\\installer.cjs',
      nodePath: 'node.exe',
      runProcess,
    })

    const planned = await service.plan(created.projectDir, target)
    expect(planned.output).toContain('preflight ok')
    const installed = await service.apply(created.projectDir, target)
    expect(installed.output).toContain('install ok')
    const updated = await service.apply(created.projectDir, target, {
      force: true,
    })
    expect(updated.title).toMatch(/updated/i)

    expect(calls[0][1]).toEqual(expect.arrayContaining([
      '--manifest',
      '--dry-run',
    ]))
    expect(calls[1][1]).toEqual(expect.arrayContaining([
      '--manifest',
      '--dry-run',
    ]))
    expect(calls[2][1]).not.toContain('--dry-run')
    expect(calls[3][1]).toEqual(expect.arrayContaining([
      '--uninstall',
      'delivery',
      '--dry-run',
    ]))
    expect(calls[4][1]).toContain('--force')

    const packaged = await service.packageProject(created.projectDir, output)
    const bundle = JSON.parse(await readFile(packaged.packagePath, 'utf8'))
    expect(bundle).toMatchObject({
      format: 'pokerogue-mod-package',
      project: { name: 'Delivery' },
      assets: [],
    })
  })
})
