import { describe, expect, it } from 'vitest'
import {
  addStageAsset,
  addStageForm,
  addStageMove,
  setOfficialEncounterPolicy,
  upsertEncounterPlacement,
  upsertEvolutionEdge,
  upsertTargetBinding,
} from './project-authoring.js'
import { buildDeliveryManifest, reviewProject } from './project-review.js'
import { MAX_EGG_MOVES, addBlankStage, createBlankProject, removeStage, setStageField, validateProject } from './project-schema.js'

const HASH = 'a'.repeat(64)

function completeStage(project, stageId, name, type = 'FIRE') {
  let next = setStageField(project, stageId, 'name', name, { now: () => '2026-07-14T00:00:00.000Z' })
  next = setStageField(next, stageId, 'category', 'Test Pokémon', { now: () => '2026-07-14T00:00:00.000Z' })
  next = setStageField(next, stageId, 'types', [type], { now: () => '2026-07-14T00:00:00.000Z' })
  return setStageField(next, stageId, 'abilities', ['BLAZE'], { now: () => '2026-07-14T00:00:00.000Z' })
}

describe('project authoring domain', () => {
  it('authors validated moves, forms, branches, pool membership, assets, and target allocations', () => {
    const ids = ['project-1', 'stage-1', 'stage-2', 'form-1', 'edge-1', 'placement-1']
    let project = createBlankProject({ name: 'Emberline', idFactory: () => ids.shift(), now: () => '2026-07-14T00:00:00.000Z' })
    project = addBlankStage(project, { idFactory: () => ids.shift(), now: () => '2026-07-14T00:00:00.000Z' })
    project = completeStage(project, 'stage-1', 'Embercub')
    project = completeStage(project, 'stage-2', 'Emberlion')
    project = addStageMove(project, 'stage-1', 'levelUp', { level: 12, moveId: 'flame burst' })
    project = addStageMove(project, 'stage-1', 'tm', 'sunny day')
    project = addStageForm(project, 'stage-2', { name: 'Solar Form' }, { idFactory: () => ids.shift() })
    project = upsertEvolutionEdge(project, { from: 'stage-1', to: 'stage-2', trigger: { type: 'level', level: 28 } }, { idFactory: () => ids.shift() })
    project = upsertEncounterPlacement(project, { stageId: 'stage-1', biome: 'volcano', minLevel: 4, maxLevel: 8, weight: 5 }, { idFactory: () => ids.shift() })
    project = setOfficialEncounterPolicy(project, { speciesId: 'charmander', speciesNumber: 4, name: 'Charmander' }, 'replace', 'stage-1')
    project = addStageAsset(project, 'stage-1', { assetId: 'asset-1', kind: 'sprite', relativePath: 'assets/stage-1/sprite.png', fileName: 'sprite.png', mimeType: 'image/png', size: 24, sha256: HASH })
    project = upsertTargetBinding(project, {
      targetId: 'target-1',
      targetDir: 'C:\\Games\\PokeRogue',
      adapter: 'pokerogue-modern-source',
      capabilities: { species: true, evolutions: true, moves: true, eggMoves: true, encounters: true, sprites: true, icons: true, cries: true, forms: true, formChanges: true, advancedEvolutionTriggers: true, isolatedBuild: true },
      validationIssues: [],
      stageAllocations: { 'stage-1': 1400, 'stage-2': 1401 },
    })

    expect(project.stages[0].moves).toMatchObject({ levelUp: [{ level: 12, moveId: 'FLAME_BURST' }], tm: ['SUNNY_DAY'] })
    expect(project.stages[1].forms[0]).toMatchObject({ formId: 'form-1', key: 'solar-form' })
    expect(project.evolutionEdges[0]).toMatchObject({ edgeId: 'edge-1', trigger: { type: 'level', level: 28 } })
    expect(project.encounterPolicy.placements[0]).toEqual({ placementId: 'placement-1', stageId: 'stage-1', biome: 'VOLCANO' })
    expect(project.encounterPolicy.officialLines[0]).toMatchObject({ mode: 'replace', replacementStageId: 'stage-1' })

    const manifest = buildDeliveryManifest(project, project.targetBindings[0], { generatedAt: () => '2026-07-14T00:00:00.000Z', sourceRoot: 'C:\\Projects\\Emberline' })
    expect(manifest.customSpecies.map(species => species.speciesNumber)).toEqual([1400, 1401])
    expect(manifest.customSpecies[0]).toMatchObject({ speciesId: 'embercub', levelUpMoves: [[12, 'FLAME_BURST']], encounterPlacements: [{ placementId: 'placement-1', biome: 'VOLCANO' }] })
    expect(manifest.availabilityOverrides[0]).toMatchObject({ mode: 'replace', replacementSpeciesNumber: 1400, availability: { wildEncounters: false } })
    expect(validateProject(project)).toEqual([])
    expect(reviewProject(project).counts.error).toBe(0)
  })

  it('caps egg moves and replaces an existing asset role instead of creating a duplicate destination', () => {
    let project = createBlankProject({ name: 'Limits' })
    for (let index = 0; index < MAX_EGG_MOVES + 2; index += 1) project = addStageMove(project, project.stages[0].stageId, 'egg', `move ${index}`)
    project = addStageAsset(project, project.stages[0].stageId, { assetId: 'one', kind: 'sprite', relativePath: 'assets/one.png', fileName: 'one.png', mimeType: 'image/png', size: 24, sha256: HASH })
    project = addStageAsset(project, project.stages[0].stageId, { assetId: 'two', kind: 'sprite', relativePath: 'assets/two.png', fileName: 'two.png', mimeType: 'image/png', size: 24, sha256: HASH })

    expect(project.stages[0].moves.egg).toHaveLength(MAX_EGG_MOVES)
    expect(project.stages[0].assets).toEqual([expect.objectContaining({ assetId: 'two' })])
  })

  it('cascades stage deletion through graph, encounters, replacements, and allocations', () => {
    const ids = ['project-1', 'stage-1', 'stage-2', 'edge-1', 'placement-1']
    let project = createBlankProject({ name: 'Cascade', idFactory: () => ids.shift() })
    project = addBlankStage(project, { idFactory: () => ids.shift() })
    project = upsertEvolutionEdge(project, { from: 'stage-1', to: 'stage-2', trigger: { type: 'level', level: 10 } }, { idFactory: () => ids.shift() })
    project = upsertEncounterPlacement(project, { stageId: 'stage-2', biome: 'PLAINS' }, { idFactory: () => ids.shift() })
    project = setOfficialEncounterPolicy(project, { speciesId: 'bulbasaur', speciesNumber: 1, name: 'Bulbasaur' }, 'replace', 'stage-2')
    project = upsertTargetBinding(project, { targetId: 'target', targetDir: 'C:\\Game', adapter: 'pokerogue-modern-source', stageAllocations: { 'stage-1': 1026, 'stage-2': 1027 } })

    const next = removeStage(project, 'stage-2')
    expect(next.evolutionEdges).toEqual([])
    expect(next.encounterPolicy).toEqual({ officialLines: [], placements: [] })
    expect(next.targetBindings[0].stageAllocations).toEqual({ 'stage-1': 1026 })
  })

  it('reports cycles and incomplete replacement policies as blocking issues', () => {
    const ids = ['project-1', 'stage-1', 'stage-2', 'edge-1', 'edge-2']
    let project = createBlankProject({ name: 'Cycle', idFactory: () => ids.shift() })
    project = addBlankStage(project, { idFactory: () => ids.shift() })
    project = upsertEvolutionEdge(project, { from: 'stage-1', to: 'stage-2', trigger: { type: 'level', level: 10 } }, { idFactory: () => ids.shift() })
    project = upsertEvolutionEdge(project, { from: 'stage-2', to: 'stage-1', trigger: { type: 'level', level: 20 } }, { idFactory: () => ids.shift() })
    project = setOfficialEncounterPolicy(project, { speciesId: 'bulbasaur', speciesNumber: 1, name: 'Bulbasaur' }, 'replace', 'missing-stage')

    const report = reviewProject(project, { validateTargetCapabilities: false })
    expect(report.ready).toBe(false)
    expect(report.issues.map(item => item.code)).toEqual(expect.arrayContaining(['evolution-cycle', 'missing-replacement-stage']))
  })
})
