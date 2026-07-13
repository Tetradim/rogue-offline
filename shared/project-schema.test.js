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
})
