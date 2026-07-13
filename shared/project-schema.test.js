import { describe, expect, it } from 'vitest'
import {
  addBlankStage,
  calculateBst,
  createBlankProject,
  removeStage,
  setStageField,
  setStageStat,
  validateProject,
} from './project-schema.js'

const makeIdFactory = () => {
  const ids = ['project-1', 'stage-1', 'stage-2', 'stage-3']
  return () => ids.shift()
}

const now = () => '2026-07-13T12:00:00.000Z'

describe('portable project domain', () => {
  it('creates a blank one-stage evolution family without official data', () => {
    const idFactory = makeIdFactory()
    const project = createBlankProject({ name: 'Emberline', idFactory, now })

    expect(project).toEqual({
      schemaVersion: 2,
      projectId: 'project-1',
      name: 'Emberline',
      slug: 'emberline',
      revision: 1,
      createdAt: '2026-07-13T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
      stages: [{
        stageId: 'stage-1',
        source: 'custom',
        name: 'Custom Stage 1',
        slug: 'custom-stage-1',
        category: '',
        generation: 9,
        height: 1,
        weight: 1,
        growthRate: 'MEDIUM_FAST',
        baseFriendship: 50,
        captureRate: 45,
        genderRatio: 50,
        flags: { legendary: false, mythical: false, starter: false },
        types: ['NORMAL'],
        abilities: [],
        passive: '',
        baseStats: {
          hp: 1,
          attack: 1,
          defense: 1,
          specialAttack: 1,
          specialDefense: 1,
          speed: 1,
        },
        moves: { levelUp: [], tm: [], egg: [] },
        forms: [],
        assets: [],
        revision: 1,
      }],
      evolutionEdges: [],
      encounterPolicy: { officialLines: [], placements: [] },
      targetBindings: [],
    })
    expect(project.officialSpecies).toBeUndefined()
  })

  it('adds and removes stages while preserving immutable IDs', () => {
    const idFactory = makeIdFactory()
    const original = createBlankProject({ name: 'Emberline', idFactory, now })
    const withSecondStage = addBlankStage(original, { idFactory, now })

    expect(original.stages.map(stage => stage.stageId)).toEqual(['stage-1'])
    expect(withSecondStage.stages.map(stage => stage.stageId)).toEqual(['stage-1', 'stage-2'])

    const withoutFirstStage = removeStage(withSecondStage, 'stage-1', { now })

    expect(withSecondStage.stages.map(stage => stage.stageId)).toEqual(['stage-1', 'stage-2'])
    expect(withoutFirstStage.stages.map(stage => stage.stageId)).toEqual(['stage-2'])
  })

  it('synchronizes clamped base stats and calculates BST', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })

    project = setStageStat(project, 'stage-1', 'attack', 999, { now })
    project = setStageStat(project, 'stage-1', 'speed', 100, { now })

    expect(project.stages[0].baseStats.attack).toBe(255)
    expect(project.stages[0].baseStats.speed).toBe(100)
    expect(calculateBst(project.stages[0])).toBe(359)
  })

  it('normalizes slugs and reports duplicate stage slugs', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    project = setStageField(project, 'stage-2', 'name', 'Custom Stage 1', { now })

    expect(project.stages[1].slug).toBe('custom-stage-1')
    expect(validateProject(project)).toContainEqual({
      path: 'stages.stage-2.slug',
      code: 'duplicate-stage-slug',
      message: 'Stage slug "custom-stage-1" is already used in this project.',
    })
  })

  it('reuses the lowest available default stage ordinal after a middle removal', () => {
    const ids = ['project-1', 'stage-1', 'stage-2', 'stage-3', 'stage-4']
    const idFactory = () => ids.shift()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    project = removeStage(project, 'stage-2', { now })
    project = addBlankStage(project, { idFactory, now })

    expect(project.stages.map(stage => stage.name)).toEqual([
      'Custom Stage 1',
      'Custom Stage 3',
      'Custom Stage 2',
    ])
    expect(project.stages.map(stage => stage.slug)).toEqual([
      'custom-stage-1',
      'custom-stage-3',
      'custom-stage-2',
    ])
    expect(validateProject(project)).toEqual([])
  })

  it.each([null, undefined, 42, 'project', []])(
    'returns a structured error for a non-object project: %j',
    project => {
      expect(validateProject(project)).toEqual([{
        path: 'project',
        code: 'invalid-project',
        message: 'Project must be an object.',
      }])
    },
  )

  it('rejects non-string project names and invalid stage collections', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const requiredName = {
      path: 'name',
      code: 'required',
      message: 'Project name is required.',
    }

    for (const name of [undefined, null, 17, '   ']) {
      expect(validateProject({ ...project, name })).toContainEqual(requiredName)
    }
    for (const stages of [undefined, null, {}, 'stages']) {
      expect(validateProject({ ...project, stages })).toContainEqual({
        path: 'stages',
        code: 'invalid-stages',
        message: 'Stages must be an array.',
      })
    }
    expect(validateProject({ ...project, stages: [] })).toContainEqual({
      path: 'stages',
      code: 'required',
      message: 'At least one custom stage is required.',
    })
  })

  it.each([null, 17, 'stage', []])(
    'rejects a non-object stage without throwing: %j',
    stage => {
      const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })

      expect(validateProject({ ...project, stages: [stage] })).toContainEqual({
        path: 'stages.0',
        code: 'invalid-stage',
        message: 'Stage must be an object.',
      })
    },
  )

  it('requires stage identity fields without duplicate-error cascades', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const invalidStages = [
      { ...project.stages[0], stageId: undefined, name: undefined, slug: undefined },
      { ...project.stages[0], stageId: '', name: '   ', slug: '' },
    ]
    const errors = validateProject({ ...project, stages: invalidStages })

    for (const index of [0, 1]) {
      expect(errors).toContainEqual({
        path: `stages.${index}.stageId`,
        code: 'required-stage-id',
        message: 'Stage ID is required.',
      })
      expect(errors).toContainEqual({
        path: `stages.${index}.name`,
        code: 'required-stage-name',
        message: 'Stage name is required.',
      })
      expect(errors).toContainEqual({
        path: `stages.${index}.slug`,
        code: 'required-stage-slug',
        message: 'Stage slug is required.',
      })
    }
    expect(errors.some(error => error.code === 'duplicate-stage-id')).toBe(false)
    expect(errors.some(error => error.code === 'duplicate-stage-slug')).toBe(false)
  })

  it('rejects non-custom stage sources and non-normalized slugs', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const stage = {
      ...project.stages[0],
      source: 'official',
      slug: 'Custom Stage 1',
    }
    const errors = validateProject({ ...project, stages: [stage] })

    expect(errors).toContainEqual({
      path: 'stages.stage-1.source',
      code: 'invalid-stage-source',
      message: 'Stage source must be "custom".',
    })
    expect(errors).toContainEqual({
      path: 'stages.stage-1.slug',
      code: 'invalid-stage-slug',
      message: 'Stage slug must be normalized as "custom-stage-1".',
    })
  })

  it('requires base stats, moves, forms, and assets containers', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const invalidStage = {
      ...project.stages[0],
      baseStats: null,
      moves: null,
      forms: null,
      assets: {},
    }
    const missingStage = { ...project.stages[0] }
    delete missingStage.baseStats
    delete missingStage.moves
    delete missingStage.forms
    delete missingStage.assets
    const errorSets = [invalidStage, missingStage]
      .map(stage => validateProject({ ...project, stages: [stage] }))

    for (const errors of errorSets) {
      expect(errors).toContainEqual({
        path: 'stages.stage-1.baseStats',
        code: 'invalid-base-stats',
        message: 'Base stats must be an object.',
      })
      expect(errors).toContainEqual({
        path: 'stages.stage-1.moves',
        code: 'invalid-moves',
        message: 'Moves must be an object.',
      })
      expect(errors).toContainEqual({
        path: 'stages.stage-1.forms',
        code: 'invalid-forms',
        message: 'Forms must be an array.',
      })
      expect(errors).toContainEqual({
        path: 'stages.stage-1.assets',
        code: 'invalid-assets',
        message: 'Assets must be an array.',
      })
      expect(errors.some(error => error.code === 'invalid-stat')).toBe(false)
      expect(errors.some(error => error.code === 'invalid-move-list')).toBe(false)
    }
  })

  it('requires level-up, TM, and egg move arrays', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const stage = {
      ...project.stages[0],
      moves: { levelUp: null, tm: {}, egg: 'moves' },
    }
    const errors = validateProject({ ...project, stages: [stage] })

    for (const list of ['levelUp', 'tm', 'egg']) {
      expect(errors).toContainEqual({
        path: `stages.stage-1.moves.${list}`,
        code: 'invalid-move-list',
        message: `Move list "${list}" must be an array.`,
      })
    }
  })

  it('rejects missing or malformed evolution edges before domain operations', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    const missingEdges = { ...project }
    delete missingEdges.evolutionEdges

    for (const candidate of [missingEdges, { ...project, evolutionEdges: {} }]) {
      expect(validateProject(candidate)).toContainEqual({
        path: 'evolutionEdges',
        code: 'invalid-evolution-edges',
        message: 'Evolution edges must be an array.',
      })
    }
    expect(validateProject({ ...project, evolutionEdges: [null] })).toContainEqual({
      path: 'evolutionEdges.0',
      code: 'invalid-evolution-edge',
      message: 'Evolution edge must be an object.',
    })
  })

  it('requires complete project identity and metadata', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const cases = [
      ['projectId', undefined, {
        path: 'projectId',
        code: 'required-project-id',
        message: 'Project ID is required.',
      }],
      ['name', undefined, {
        path: 'name',
        code: 'required',
        message: 'Project name is required.',
      }],
      ['slug', undefined, {
        path: 'slug',
        code: 'required-project-slug',
        message: 'Project slug is required.',
      }],
      ['slug', 'Ember Line', {
        path: 'slug',
        code: 'invalid-project-slug',
        message: 'Project slug must be normalized as "ember-line".',
      }],
      ['schemaVersion', undefined, {
        path: 'schemaVersion',
        code: 'unsupported-schema',
        message: 'Expected schema version 2.',
      }],
      ['revision', 0, {
        path: 'revision',
        code: 'invalid-project-revision',
        message: 'Project revision must be a positive integer.',
      }],
      ['createdAt', 'not-a-date', {
        path: 'createdAt',
        code: 'invalid-created-at',
        message: 'Created timestamp must be an ISO date string.',
      }],
      ['updatedAt', undefined, {
        path: 'updatedAt',
        code: 'invalid-updated-at',
        message: 'Updated timestamp must be an ISO date string.',
      }],
    ]

    for (const [field, value, expectedError] of cases) {
      expect(validateProject({ ...project, [field]: value })).toContainEqual(expectedError)
    }
  })

  it('requires encounter policy arrays and target bindings without child cascades', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const invalidPolicyErrors = validateProject({ ...project, encounterPolicy: null })

    expect(invalidPolicyErrors).toContainEqual({
      path: 'encounterPolicy',
      code: 'invalid-encounter-policy',
      message: 'Encounter policy must be an object.',
    })
    expect(invalidPolicyErrors.some(error => [
      'invalid-official-lines',
      'invalid-placements',
    ].includes(error.code))).toBe(false)

    const invalidLists = validateProject({
      ...project,
      encounterPolicy: { officialLines: null, placements: {} },
    })
    expect(invalidLists).toContainEqual({
      path: 'encounterPolicy.officialLines',
      code: 'invalid-official-lines',
      message: 'Official encounter lines must be an array.',
    })
    expect(invalidLists).toContainEqual({
      path: 'encounterPolicy.placements',
      code: 'invalid-placements',
      message: 'Encounter placements must be an array.',
    })

    const missingBindings = { ...project }
    delete missingBindings.targetBindings
    expect(validateProject(missingBindings)).toContainEqual({
      path: 'targetBindings',
      code: 'invalid-target-bindings',
      message: 'Target bindings must be an array.',
    })
  })

  it('requires complete stage scalar metadata and dimensions', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const cases = [
      ['category', undefined, {
        path: 'stages.stage-1.category',
        code: 'invalid-stage-category',
        message: 'Stage category must be a string.',
      }],
      ['generation', 0, {
        path: 'stages.stage-1.generation',
        code: 'invalid-stage-generation',
        message: 'Stage generation must be a positive integer.',
      }],
      ['height', '1', {
        path: 'stages.stage-1.height',
        code: 'invalid-stage-height',
        message: 'Stage height must be a positive finite number.',
      }],
      ['weight', 0, {
        path: 'stages.stage-1.weight',
        code: 'invalid-stage-weight',
        message: 'Stage weight must be a positive finite number.',
      }],
      ['growthRate', '', {
        path: 'stages.stage-1.growthRate',
        code: 'invalid-stage-growth-rate',
        message: 'Stage growth rate must be a non-empty string.',
      }],
      ['baseFriendship', -1, {
        path: 'stages.stage-1.baseFriendship',
        code: 'invalid-stage-base-friendship',
        message: 'Stage base friendship must be an integer from 0 to 255.',
      }],
      ['captureRate', 256, {
        path: 'stages.stage-1.captureRate',
        code: 'invalid-stage-capture-rate',
        message: 'Stage capture rate must be an integer from 0 to 255.',
      }],
      ['genderRatio', '50', {
        path: 'stages.stage-1.genderRatio',
        code: 'invalid-stage-gender-ratio',
        message: 'Stage gender ratio must be a finite number from 0 to 100.',
      }],
      ['passive', null, {
        path: 'stages.stage-1.passive',
        code: 'invalid-stage-passive',
        message: 'Stage passive must be a string.',
      }],
      ['revision', 0, {
        path: 'stages.stage-1.revision',
        code: 'invalid-stage-revision',
        message: 'Stage revision must be a positive integer.',
      }],
    ]

    for (const [field, value, expectedError] of cases) {
      const stage = { ...project.stages[0], [field]: value }
      expect(validateProject({ ...project, stages: [stage] })).toContainEqual(expectedError)
    }
  })

  it('requires stage flags, types, and abilities with essential value types', () => {
    const project = createBlankProject({ name: 'Emberline', idFactory: makeIdFactory(), now })
    const stage = project.stages[0]
    const invalidFlagsErrors = validateProject({ ...project, stages: [{ ...stage, flags: null }] })

    expect(invalidFlagsErrors).toContainEqual({
      path: 'stages.stage-1.flags',
      code: 'invalid-stage-flags',
      message: 'Stage flags must be an object.',
    })
    expect(invalidFlagsErrors.some(error => error.code === 'invalid-stage-flag')).toBe(false)

    const invalidFlagValueErrors = validateProject({
      ...project,
      stages: [{
        ...stage,
        flags: { legendary: false, mythical: 'false', starter: false },
      }],
    })
    expect(invalidFlagValueErrors).toContainEqual({
      path: 'stages.stage-1.flags.mythical',
      code: 'invalid-stage-flag',
      message: 'Stage flag "mythical" must be boolean.',
    })

    for (const types of [undefined, [], ['NORMAL', 17]]) {
      expect(validateProject({ ...project, stages: [{ ...stage, types }] })).toContainEqual({
        path: 'stages.stage-1.types',
        code: 'invalid-stage-types',
        message: 'Stage types must be a non-empty array of strings.',
      })
    }
    for (const abilities of [undefined, {}, ['OVERGROW', 17]]) {
      expect(validateProject({ ...project, stages: [{ ...stage, abilities }] })).toContainEqual({
        path: 'stages.stage-1.abilities',
        code: 'invalid-stage-abilities',
        message: 'Stage abilities must be an array of strings.',
      })
    }
  })
})
