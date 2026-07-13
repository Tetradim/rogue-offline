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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
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
    const edited = structuredClone(created.project)
    edited.name = 'Aurora Line'
    const editedSnapshot = structuredClone(edited)
    deepFreeze(edited)

    let saved = await repository.save(created.projectDir, edited)

    expect(edited).toEqual(editedSnapshot)
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

  it('rejects traversal and separators without escaping the selected parent', async () => {
    const rootDir = await makeTemporaryDirectory()
    const parentDir = path.join(rootDir, 'projects')
    await mkdir(parentDir)
    const repository = createProjectRepository()

    for (const name of ['../escaped-project', 'nested/project', 'nested\\project']) {
      await expect(repository.create({ parentDir, name }))
        .rejects.toThrow('Project name cannot be used as a Windows folder name.')
    }

    await expect(readdir(parentDir)).resolves.toEqual([])
    expect(await pathExists(path.join(rootDir, 'escaped-project'))).toBe(false)
  })

  it.each([
    'angle<name',
    'angle>name',
    'colon:name',
    'quote"name',
    'pipe|name',
    'question?name',
    'star*name',
    'control\u0001name',
    'trailing.',
    '.',
    '..',
    'CON',
    'con.txt',
    'PRN',
    'AUX.json',
    'nul',
    'COM1',
    'com9.log',
    'LPT1',
    'lpt9.txt',
  ])('rejects a Windows-invalid or reserved project folder name: %j', async name => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository()

    await expect(repository.create({ parentDir, name }))
      .rejects.toThrow('Project name cannot be used as a Windows folder name.')
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

  it('does not coerce an invalid draft revision into a valid saved revision', async () => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const canonicalPath = path.join(created.projectDir, 'project.json')
    const canonicalBefore = await readFile(canonicalPath, 'utf8')

    await expect(repository.save(created.projectDir, {
      ...structuredClone(created.project),
      revision: '1',
    })).rejects.toThrow(/Project revision must be a positive integer\./i)
    await expect(readFile(canonicalPath, 'utf8')).resolves.toBe(canonicalBefore)
  })

  it('rejects a stale draft without replacing canonical state or autosaves', async () => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const firstDraft = { ...structuredClone(created.project), name: 'First Save' }
    const staleDraft = { ...structuredClone(created.project), name: 'Stale Overwrite' }
    await repository.save(created.projectDir, firstDraft)
    const canonicalPath = path.join(created.projectDir, 'project.json')
    const autosaveDir = path.join(created.projectDir, '.studio', 'autosaves')
    const canonicalAfterFirstSave = await readFile(canonicalPath, 'utf8')
    const autosavesAfterFirstSave = (await readdir(autosaveDir)).sort()

    await expect(repository.save(created.projectDir, staleDraft)).rejects.toThrow(/stale/i)
    await expect(readFile(canonicalPath, 'utf8')).resolves.toBe(canonicalAfterFirstSave)
    expect((await readdir(autosaveDir)).sort()).toEqual(autosavesAfterFirstSave)
  })

  it.each([
    ['projectId', 'other-project'],
    ['createdAt', '2026-07-12T12:00:00.000Z'],
    ['schemaVersion', 1],
  ])('rejects a draft that changes immutable project identity field %s', async (field, value) => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const canonicalPath = path.join(created.projectDir, 'project.json')
    const autosaveDir = path.join(created.projectDir, '.studio', 'autosaves')
    const canonicalBefore = await readFile(canonicalPath, 'utf8')
    const autosavesBefore = await readdir(autosaveDir)
    const foreignDraft = { ...structuredClone(created.project), [field]: value }

    await expect(repository.save(created.projectDir, foreignDraft))
      .rejects.toThrow(new RegExp(`identity.*${field}`, 'i'))
    await expect(readFile(canonicalPath, 'utf8')).resolves.toBe(canonicalBefore)
    await expect(readdir(autosaveDir)).resolves.toEqual(autosavesBefore)
  })

  it('does not replace canonical state when the autosave cannot be written', async () => {
    const parentDir = await makeTemporaryDirectory()
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
    })
    const created = await repository.create({ parentDir, name: 'Ember Line' })
    const canonicalPath = path.join(created.projectDir, 'project.json')
    const autosavePath = path.join(created.projectDir, '.studio', 'autosaves')
    const canonicalBefore = await readFile(canonicalPath, 'utf8')
    await rm(autosavePath, { recursive: true })
    await writeFile(autosavePath, 'autosaves unavailable', 'utf8')

    await expect(repository.save(created.projectDir, {
      ...structuredClone(created.project),
      name: 'Must Not Commit',
    })).rejects.toThrow()

    await expect(readFile(canonicalPath, 'utf8')).resolves.toBe(canonicalBefore)
    await expect(readFile(autosavePath, 'utf8')).resolves.toBe('autosaves unavailable')
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

  it('removes a claimed project directory after ordered initialization fails', async () => {
    const parentDir = await makeTemporaryDirectory()
    const projectDir = path.join(parentDir, 'Name')
    const initializationError = new Error('operation-log initialization failed')
    const fileSystem = {
      mkdir: async (directory, options) => {
        if (directory === path.join(projectDir, '.studio', 'operation-logs')) {
          throw initializationError
        }
        return mkdir(directory, options)
      },
      readFile,
      rm,
    }
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
      fileSystem,
    })

    await expect(repository.create({ parentDir, name: 'Name' })).rejects.toBe(initializationError)
    expect(await pathExists(projectDir)).toBe(false)
  })

  it('reports both initialization and cleanup errors when partial-create cleanup fails', async () => {
    const parentDir = await makeTemporaryDirectory()
    const projectDir = path.join(parentDir, 'Name')
    const initializationError = new Error('operation-log initialization failed')
    const cleanupError = new Error('project cleanup failed')
    const fileSystem = {
      mkdir: async (directory, options) => {
        if (directory === path.join(projectDir, '.studio', 'operation-logs')) {
          throw initializationError
        }
        return mkdir(directory, options)
      },
      readFile,
      rm: async directory => {
        if (directory === projectDir) throw cleanupError
        return rm(directory, { recursive: true, force: true })
      },
    }
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: makeIdFactory(),
      fileSystem,
    })

    let failure
    try {
      await repository.create({ parentDir, name: 'Name' })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors).toEqual([initializationError, cleanupError])
    expect(failure.message).toMatch(/initialization.*cleanup/i)
  })
})
