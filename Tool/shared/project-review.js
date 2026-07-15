import { calculateBst, validateProject } from './project-schema.js'
import { token } from './project-authoring.js'

export const MANIFEST_SCHEMA_VERSION = 3
export const OFFICIAL_DEX_MAX = 1025

function issue(severity, path, code, message) {
  return { severity, path, code, message }
}

function edgeHasRequirement(edge) {
  const trigger = edge?.trigger || {}
  if (trigger.type === 'level') return Number.isInteger(trigger.level) && trigger.level >= 1
  if (trigger.type === 'item') return Boolean(trigger.item)
  if (trigger.type === 'friendship') return Number.isInteger(trigger.friendship) && trigger.friendship >= 1
  if (trigger.type === 'time') return Boolean(trigger.time)
  if (trigger.type === 'move') return Boolean(trigger.move)
  return Boolean(trigger.description)
}

function findCycle(project) {
  const stages = Array.isArray(project.stages) ? project.stages : []
  const edges = Array.isArray(project.evolutionEdges) ? project.evolutionEdges : []
  const adjacency = new Map(stages.filter(Boolean).map(stage => [stage.stageId, []]))
  for (const edge of edges) if (edge && adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to)
  const visiting = new Set()
  const visited = new Set()
  function visit(stageId) {
    if (visiting.has(stageId)) return true
    if (visited.has(stageId)) return false
    visiting.add(stageId)
    for (const target of adjacency.get(stageId) || []) if (visit(target)) return true
    visiting.delete(stageId)
    visited.add(stageId)
    return false
  }
  return stages.some(stage => stage && visit(stage.stageId))
}

function assetCapability(kind) {
  if (kind === 'sprite' || kind === 'variant') return 'sprites'
  if (kind === 'icon') return 'icons'
  if (kind === 'cry') return 'cries'
  return null
}

export function reviewProject(project, {
  requireTarget = false,
  validateTargetCapabilities = true,
} = {}) {
  const issues = validateProject(project)
    .map(error => issue('error', error.path, error.code, error.message))
  if (!project || typeof project !== 'object') return { issues, counts: { error: issues.length, warning: 0 }, ready: false }

  const stages = Array.isArray(project.stages) ? project.stages.filter(stage => stage && typeof stage === 'object') : []
  const edges = Array.isArray(project.evolutionEdges) ? project.evolutionEdges.filter(edge => edge && typeof edge === 'object') : []
  const stageIds = new Set(stages.map(stage => stage.stageId))
  const incoming = new Map(stages.map(stage => [stage.stageId, 0]))
  const binding = Array.isArray(project.targetBindings) ? project.targetBindings.at(-1) || null : null
  const capabilities = binding?.capabilities || null

  if (validateTargetCapabilities && binding?.validationIssues?.length) {
    for (const targetIssue of binding.validationIssues) {
      issues.push(issue(targetIssue.severity || 'error', targetIssue.path || 'targetBindings', targetIssue.code || 'target-validation', targetIssue.message || 'The selected checkout is not ready for delivery.'))
    }
  }

  for (const stage of stages) {
    const stagePath = `stages.${stage.stageId}`
    if (!stage.category?.trim()) issues.push(issue('warning', `${stagePath}.category`, 'missing-category', 'Category is blank.'))
    if (!stage.abilities?.length) issues.push(issue('warning', `${stagePath}.abilities`, 'missing-ability', 'At least one ability is recommended.'))
    const bst = calculateBst(stage)
    if (bst < 180) issues.push(issue('warning', `${stagePath}.baseStats`, 'low-bst', `BST ${bst} is unusually low.`))
    if (bst > 720) issues.push(issue('warning', `${stagePath}.baseStats`, 'high-bst', `BST ${bst} is unusually high.`))

    if (validateTargetCapabilities && capabilities && stage.moves?.egg?.length && !capabilities.eggMoves) {
      issues.push(issue('error', `${stagePath}.moves.egg`, 'unsupported-egg-moves', 'The bound checkout has no supported egg-move registry.'))
    }
    if (validateTargetCapabilities && capabilities && stage.forms?.length && !capabilities.forms) {
      issues.push(issue('error', `${stagePath}.forms`, 'unsupported-forms', 'The bound checkout cannot install form definitions safely.'))
    }
    for (const [formIndex, form] of (stage.forms || []).entries()) {
      if (validateTargetCapabilities && capabilities && form?.changeItem && !capabilities.formChanges) {
        issues.push(issue('error', `${stagePath}.forms.${formIndex}.changeItem`, 'unsupported-form-change', 'The bound checkout has no safely detected form-change item constructors.'))
      }
    }
    if (validateTargetCapabilities && capabilities) {
      for (const asset of stage.assets || []) {
        const capability = assetCapability(asset.kind)
        if (capability && !capabilities[capability]) {
          issues.push(issue('error', `${stagePath}.assets.${asset.assetId}`, 'unsupported-asset-target', `The bound checkout has no detected destination for ${asset.kind} assets.`))
        }
      }
    }
  }

  const edgePairs = new Set()
  for (const [index, edge] of edges.entries()) {
    const edgePath = `evolutionEdges.${index}`
    if (!stageIds.has(edge.from) || !stageIds.has(edge.to)) issues.push(issue('error', edgePath, 'missing-edge-stage', 'Evolution edge references a missing stage.'))
    if (edge.from === edge.to) issues.push(issue('error', edgePath, 'self-edge', 'A stage cannot evolve into itself.'))
    const pair = `${edge.from}:${edge.to}`
    if (edgePairs.has(pair)) issues.push(issue('error', edgePath, 'duplicate-edge', 'Duplicate evolution edges are not allowed.'))
    edgePairs.add(pair)
    if (!edgeHasRequirement(edge)) issues.push(issue('error', `${edgePath}.trigger`, 'missing-trigger', 'Evolution requirement is incomplete.'))
    if (validateTargetCapabilities && capabilities && edge.trigger?.type === 'custom') {
      issues.push(issue('error', `${edgePath}.trigger`, 'unsupported-custom-evolution', 'Custom prose evolution requirements are portable notes and cannot be installed automatically.'))
    } else if (validateTargetCapabilities && capabilities && ['friendship', 'time', 'move'].includes(edge.trigger?.type) && !capabilities.advancedEvolutionTriggers) {
      issues.push(issue('error', `${edgePath}.trigger`, 'unsupported-evolution-trigger', 'The bound checkout cannot install this evolution condition safely.'))
    }
    if (incoming.has(edge.to)) incoming.set(edge.to, incoming.get(edge.to) + 1)
  }
  if (edges.length && findCycle(project)) issues.push(issue('error', 'evolutionEdges', 'evolution-cycle', 'Evolution graph must not contain a cycle.'))
  if (stages.length > 1) {
    const roots = [...incoming.values()].filter(count => count === 0).length
    if (roots !== 1) issues.push(issue('warning', 'evolutionEdges', 'ambiguous-roots', 'A complete evolution line should have exactly one root stage.'))
  }

  const officialLines = Array.isArray(project.encounterPolicy?.officialLines) ? project.encounterPolicy.officialLines : []
  const placements = Array.isArray(project.encounterPolicy?.placements) ? project.encounterPolicy.placements : []
  for (const policy of officialLines) {
    if (policy.mode === 'replace' && !stageIds.has(policy.replacementStageId)) {
      issues.push(issue('error', `encounterPolicy.officialLines.${policy.speciesId}`, 'missing-replacement-stage', 'Replacement policy must select a custom stage.'))
    }
  }
  for (const placement of placements) {
    if (!stageIds.has(placement.stageId)) issues.push(issue('error', `encounterPolicy.placements.${placement.placementId}`, 'missing-placement-stage', 'Encounter placement references a missing stage.'))
  }
  if (validateTargetCapabilities && capabilities && (officialLines.length || placements.length) && !capabilities.encounters) {
    issues.push(issue('error', 'encounterPolicy', 'unsupported-encounters', 'The bound checkout has no supported simple biome species arrays.'))
  }

  if (requireTarget && !binding) issues.push(issue('error', 'targetBindings', 'missing-target', 'Bind a supported PokéRogue checkout before delivery.'))
  else if (!binding) issues.push(issue('warning', 'targetBindings', 'missing-target', 'No PokéRogue checkout is bound yet.'))
  else if (validateTargetCapabilities && !capabilities) issues.push(issue('error', 'targetBindings', 'unknown-capabilities', 'Re-analyze this older target binding before delivery.'))

  const counts = issues.reduce((result, item) => ({ ...result, [item.severity]: (result[item.severity] || 0) + 1 }), { error: 0, warning: 0 })
  return { issues, counts, ready: counts.error === 0 }
}

function allocationFor(binding, stage, index) {
  const configured = Number(binding?.stageAllocations?.[stage.stageId])
  return Number.isInteger(configured) && configured > OFFICIAL_DEX_MAX ? configured : OFFICIAL_DEX_MAX + index + 1
}

function availabilityForStage(project, stage) {
  const placements = (project.encounterPolicy?.placements || []).filter(item => item.stageId === stage.stageId)
  return {
    wildEncounters: placements.length > 0,
    starters: Boolean(stage.flags?.starter),
    eggs: Boolean(stage.moves?.egg?.length),
  }
}

export function buildDeliveryManifest(
  project,
  binding = null,
  { generatedAt = () => new Date().toISOString(), sourceRoot } = {},
) {
  const stages = project.stages || []
  const allocations = new Map(stages.map((stage, index) => [stage.stageId, allocationFor(binding, stage, index)]))
  const byId = new Map(stages.map(stage => [stage.stageId, stage]))
  const customSpecies = stages.map(stage => {
    const edges = (project.evolutionEdges || []).filter(edge => edge.from === stage.stageId)
    const placements = (project.encounterPolicy?.placements || []).filter(item => item.stageId === stage.stageId)
    return {
      projectId: stage.stageId,
      speciesNumber: allocations.get(stage.stageId),
      speciesId: stage.slug,
      enumName: token(stage.slug),
      name: stage.name,
      source: 'custom',
      category: stage.category,
      generation: stage.generation,
      height: stage.height,
      weight: stage.weight,
      growthRate: stage.growthRate,
      baseFriendship: stage.baseFriendship,
      captureRate: stage.captureRate,
      genderRatio: stage.genderRatio,
      genderless: Boolean(stage.flags?.genderless),
      primaryType: stage.types[0],
      secondaryType: stage.types[1] || null,
      ability1: stage.abilities[0] || null,
      ability2: stage.abilities[1] || null,
      hiddenAbility: stage.abilities[2] || null,
      passiveAbility: stage.passive || null,
      baseStats: { ...stage.baseStats },
      levelUpMoves: (stage.moves?.levelUp || []).map(move => [move.level, move.moveId]),
      tmMoves: [...(stage.moves?.tm || [])],
      eggMoves: [...(stage.moves?.egg || [])],
      forms: (stage.forms || []).map(form => ({ ...form, statOverrides: { ...(form.statOverrides || {}) } })),
      evolutions: edges.map(edge => ({
        speciesId: byId.get(edge.to)?.slug,
        level: edge.trigger?.type === 'level' ? edge.trigger.level : undefined,
        item: edge.trigger?.type === 'item' ? edge.trigger.item : undefined,
        trigger: { ...edge.trigger },
      })),
      encounterPlacements: placements.map(placement => ({ placementId: placement.placementId, biome: placement.biome })),
      availability: availabilityForStage(project, stage),
      flags: { ...stage.flags },
      assets: (stage.assets || []).map(asset => ({ ...asset })),
    }
  })
  const officialOverrides = (project.encounterPolicy?.officialLines || []).map(policy => ({
    speciesNumber: policy.speciesNumber,
    speciesId: policy.speciesId,
    enumName: token(policy.speciesId),
    name: policy.name,
    source: 'official',
    mode: policy.mode,
    replacementSpeciesNumber: policy.mode === 'replace' ? allocations.get(policy.replacementStageId) : null,
    availability: { wildEncounters: false },
  }))
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    format: 'pokerogue-mod-studio',
    mod: {
      id: project.slug,
      name: project.name,
      version: `1.0.${project.revision}`,
      generatedAt: generatedAt(),
    },
    target: {
      game: 'pokerogue',
      adapter: binding?.adapter || 'pokerogue-modern-source',
      targetId: binding?.targetId || null,
      fingerprint: binding?.fingerprint || null,
      expectedRevision: binding?.revision || null,
      minimumOfficialDex: OFFICIAL_DEX_MAX,
    },
    sourceRoot: sourceRoot || null,
    registry: customSpecies.map(species => ({ projectId: species.projectId, speciesNumber: species.speciesNumber, enumName: species.enumName })),
    customSpecies,
    availabilityOverrides: officialOverrides,
  }
}
