import { describe, expect, it } from 'vitest'
import { createBlankProject, validateProject } from './project-schema.js'

function codes(project) {
  return validateProject(project).map(error => error.code)
}

describe('deep portable project validation', () => {
  it('rejects malformed nested forms, assets, moves, edges, encounters, and bindings without throwing', () => {
    const project = createBlankProject({ name: 'Malformed' })
    project.stages[0] = {
      ...project.stages[0],
      moves: { levelUp: [null], tm: ['bad move'], egg: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] },
      forms: [null],
      assets: [{ assetId: 'asset', kind: 'sprite', relativePath: 'assets/../escape.png', fileName: '', mimeType: '', size: 0, sha256: 'bad' }],
    }
    project.evolutionEdges = [{ edgeId: '', from: '', to: '', trigger: { type: 'item', item: '' }, priority: 'high' }]
    project.encounterPolicy = {
      officialLines: [{ speciesId: '', speciesNumber: 5000, name: '', mode: 'keep' }],
      placements: [{ placementId: '', stageId: '', biome: 'bad biome' }],
    }
    project.targetBindings = [{ targetId: '', targetDir: '', adapter: '', stageAllocations: { stage: 5 } }]

    expect(() => validateProject(project)).not.toThrow()
    expect(codes(project)).toEqual(expect.arrayContaining([
      'invalid-level-move',
      'invalid-move-id',
      'too-many-egg-moves',
      'invalid-form',
      'invalid-asset-path',
      'invalid-asset-hash',
      'required-edge-id',
      'invalid-evolution-item',
      'invalid-edge-priority',
      'invalid-official-number',
      'invalid-official-mode',
      'invalid-placement-biome',
      'required-target-id',
      'invalid-stage-allocation',
    ]))
  })

  it('accepts explicit genderless data and valid zero friendship and capture rate', () => {
    const project = createBlankProject({ name: 'Genderless' })
    project.stages[0] = {
      ...project.stages[0],
      baseFriendship: 0,
      captureRate: 0,
      flags: { ...project.stages[0].flags, genderless: true },
    }
    expect(validateProject(project)).toEqual([])
  })
})
