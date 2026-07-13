// @vitest-environment node

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeAutosave, writeJsonAtomic } from './fs-utils.js'
import { createProjectRepository } from './project-repository.js'

const temporaryDirectories = []

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'pokerogue-mod-studio-'))
  temporaryDirectories.push(directory)
  return directory
}

async function pathExists(filePath) {
  try {
    await readFile(filePath)
    return true
  } catch (error) {
    if (error.code === 'EISDIR') return true
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function makeIdFactory() {
  const ids = ['project-1', 'stage-1']
  return () => ids.shift()
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('project filesystem utilities', () => {
  it('writes canonical JSON atomically into a recursively created parent', async () => {
    const parentDir = await makeTemporaryDirectory()
    const filePath = path.join(parentDir, 'nested', 'project.json')

    await writeJsonAtomic(filePath, { name: 'Ember Line' })

    await expect(readFile(filePath, 'utf8')).resolves.toBe('{\n  "name": "Ember Line"\n}\n')
    await expect(readdir(path.dirname(filePath))).resolves.toEqual(['project.json'])
  })

  it('retains autosaves by numeric revision while ignoring unrelated files', async () => {
    const projectDir = await makeTemporaryDirectory()
    const autosaveDir = path.join(projectDir, '.studio', 'autosaves')
    await mkdir(autosaveDir, { recursive: true })
    await writeFile(path.join(autosaveDir, 'notes.json'), '{}', 'utf8')

    for (const revision of [999999, 1000000, 12]) {
      await writeAutosave(projectDir, { revision }, 2)
    }

    expect((await readdir(autosaveDir)).sort()).toEqual([
      '1000000.json',
      '999999.json',
      'notes.json',
    ])
  })
})

describe('portable project repository', () => {
  it('creates and opens a canonical portable project folder', async () => {
    const parentDir = await makeTemporaryDirectory()
    const timestamp = '2026-07-13T12:00:00.000Z'
    const repository = createProjectRepository({
      now: () => timestamp,
      idFactory: makeIdFactory(),
    })

    const created = await repository.create({ parentDir, name: '  Ember Line  ' })

    expect(created.projectDir).toBe(path.join(path.resolve(parentDir), 'Ember Line'))
    expect(created.project).toMatchObject({
      projectId: 'project-1',
      name: 'Ember Line',
      slug: 'ember-line',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(await pathExists(path.join(created.projectDir, 'assets'))).toBe(true)
    expect(await pathExists(path.join(created.projectDir, '.studio', 'operation-logs'))).toBe(true)

    const canonicalText = await readFile(path.join(created.projectDir, 'project.json'), 'utf8')
    expect(canonicalText).toBe(`${JSON.stringify(created.project, null, 2)}\n`)
    expect(await readdir(path.join(created.projectDir, '.studio', 'autosaves'))).toEqual([
      '000001.json',
    ])
    await expect(repository.open(created.projectDir)).resolves.toEqual(created)
  })

  it('saves an edited project atomically with one revision increment and bounded autosaves', async () => {
    const parentDir = await makeTemporaryDirectory()
    const timestamps = [
      '2026-07-13T12:00:00.000Z',
      ...Array.from({ length: 12 }, (_, index) => (
        `2026-07-13T12:${String(index + 1).padStart(2, '0')}:00.000Z`
      )),
    ]
    const repository = createProjectRepository({
      now: () => timestamps.shift(),
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const edited = { ...created.project, name: 'Aurora Line' }

    let saved = await repository.save(created.projectDir, edited)

    expect(edited).toEqual({ ...created.project, name: 'Aurora Line' })
    expect(saved.project).toMatchObject({
      name: 'Aurora Line',
      slug: 'aurora-line',
      revision: 2,
      updatedAt: '2026-07-13T12:01:00.000Z',
    })
    expect(await readFile(path.join(created.projectDir, 'project.json'), 'utf8'))
      .toBe(`${JSON.stringify(saved.project, null, 2)}\n`)

    for (let index = 0; index < 11; index += 1) {
      saved = await repository.save(created.projectDir, saved.project)
    }

    expect(saved.project.revision).toBe(13)
    const autosaves = await readdir(path.join(created.projectDir, '.studio', 'autosaves'))
    expect(autosaves).toHaveLength(10)
    expect(autosaves.sort()).toEqual(Array.from({ length: 10 }, (_, index) => (
      `${String(index + 4).padStart(6, '0')}.json`
    )))
  })

  it.each(['', '   ', '\t\n'])('rejects a blank project name before filesystem mutation: %j', async name => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository()

    await expect(repository.create({ parentDir, name })).rejects.toThrow('Project name is required.')
    await expect(readdir(parentDir)).resolves.toEqual([])
  })

  it('reports invalid JSON and project validation failures when opening', async () => {
    const parentDir = await makeTemporaryDirectory()
    const invalidJsonDir = path.join(parentDir, 'Invalid JSON')
    const invalidProjectDir = path.join(parentDir, 'Invalid Project')
    await mkdir(invalidJsonDir)
    await mkdir(invalidProjectDir)
    await writeFile(path.join(invalidJsonDir, 'project.json'), '{ invalid json', 'utf8')
    await writeFile(path.join(invalidProjectDir, 'project.json'), JSON.stringify({ name: 'Broken' }), 'utf8')
    const repository = createProjectRepository()

    await expect(repository.open(invalidJsonDir)).rejects.toThrow(/Invalid project JSON.*project\.json/i)
    await expect(repository.open(invalidProjectDir)).rejects.toThrow(/Project validation failed.*Expected schema version 2\./i)
  })

  it('rejects an invalid save without replacing the canonical project', async () => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const canonicalPath = path.join(created.projectDir, 'project.json')
    const before = await readFile(canonicalPath, 'utf8')
    const invalid = { ...created.project, name: '   ' }

    await expect(repository.save(created.projectDir, invalid))
      .rejects.toThrow(/Project validation failed.*Project name is required\./i)
    await expect(readFile(canonicalPath, 'utf8')).resolves.toBe(before)
    await expect(readdir(path.join(created.projectDir, '.studio', 'autosaves')))
      .resolves.toEqual(['000001.json'])
  })

  it('chooses numbered sibling directories when project names collide', async () => {
    const parentDir = await makeTemporaryDirectory()
    const idFactories = [
      () => 'first-id',
      () => 'second-id',
      () => 'third-id',
    ]

    const directories = []
    for (const idFactory of idFactories) {
      const repository = createProjectRepository({
        now: () => '2026-07-13T12:00:00.000Z',
        idFactory,
      })
      directories.push((await repository.create({ parentDir, name: 'Name' })).projectDir)
    }

    expect(directories).toEqual([
      path.join(path.resolve(parentDir), 'Name'),
      path.join(path.resolve(parentDir), 'Name-2'),
      path.join(path.resolve(parentDir), 'Name-3'),
    ])
  })
})
