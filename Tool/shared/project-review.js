import { calculateBst, validateProject } from './project-schema.js'
import { token } from './project-authoring.js'

export const MANIFEST_SCHEMA_VERSION = 3
export const OFFICIAL_DEX_MAX = 1025

function issue(severity, path, code, message) {
  return { severity, path, code, message }
}

function edgeHasRequirement(edge) {
  const trigger = edge.trigger || {}
  if (trigger.type === 'level') return Number.isInteger(trigger.level) && trigger.level >= 1
  if (trigger.type === 'item') return Boolean(trigger.item)
  if (trigger.type === 'friendship') return Number.isInteger(trigger.friendship) && trigger.friendship >= 1
  if (trigger.type === 'time') return Boolean(trigger.time)
  if (trigger.type === 'move') return Boolean(trigger.move)
  return Boolean(trigger.description)
}

function findCycle(project) {
  const adjacency = new Map(project.stages.map(stage => [stage.stageId, []]))
  for (const edge of project.evolutionEdges || []) adjacency.get(edge.from)?.push(edge.to)
  const visiting = new Set()
  const visited = new Set()
  function visit(stageId) {
    if (visiting.has(stageId)) return true
    if (visited.has(stageId)) return false
    visiting.add(stageId)
    for (const target of adjacency.get(stageId) || []) {
      if (visit(target)) return true
    }
    visiting.delete(stageId)
    visited.add(stageId)
    return false
  }
  return project.stages.some(stage => visit(stage.stageId))
}

function assetCapability(kind) {
  if (kind === 'sprite') return 'sprites'
  if (kind === 'icon') return 'icons'
  if (kind === 'cry') return 'cries'
  if (kind === 'variant') return 'sprites'
  return null
}

export function reviewProject(project, {
  requireTarget = false,
  validateTargetCapabilities = true,
} = {}) {
  const issues = validateProject(project)
    .map(error => issue('error', error.path, error.code, error.message))
  const stageIds = new Set((project.stages || []).map(stage => stage.stageId))
  const incoming = new Map((project.stages || []).map(stage => [stage.stageId, 0]))
  const binding = project.targetBindings?.at(-1) || null
  const capabilities = binding?.capabilities || null

  for (const stage of project.stages || []) {
    const stagePath = `stages.${stage.stageId}`
    if (!stage.category?.trim()) {
      issues.push(issue('warning', `${stagePath}.category`, 'missing-category', 'Category is blank.'))
    }
    if (!stage.abilities?.length) {
      issues.push(issue('warning', `${stagePath}.abilities`, 'missing-ability', 'At least one ability is recommended.'))
    }
    if (stage.types?.length > 2 || new Set(stage.types || []).size !== (stage.types || []).length) {
      issues.push(issue('error', `${stagePath}.types`, 'invalid-type-pair', 'A stage may have one or two unique types.'))
    }
    const bst = calculateBst(stage)
    if (bst < 180) issues.push(issue('warning', `${stagePath}.baseStats`, 'low-bst', `BST ${bst} is unusually low.`))
    if (bst > 720) issues.push(issue('warning', `${stagePath}.baseStats`, 'high-bst', `BST ${bst} is unusually high.`))

    for (const kind of ['levelUp', 'tm', 'egg']) {
      const entries = stage.moves?.[kind] || []
      const keys = entries.map(entry => kind === 'levelUp' ? `${entry.level}:${entry.moveId}` : entry)
      if (new Set(keys).size !== keys.length) {
        issues.push(issue('error', `${stagePath}.moves.${kind}`, 'duplicate-move', `Duplicate ${kind} move entries are not allowed.`))
      }
    }
    if (
      validateTargetCapabilities
      && capabilities
      && stage.moves?.egg?.length
      && !capabilities.eggMoves
    ) {
      issues.push(issue('error', `${stagePath}.moves.egg`, 'unsupported-egg-moves', 'The bound checkout has no supported egg-move registry.'))
    }

    const formKeys = (stage.forms || []).map(form => form.key)
    if (new Set(formKeys).size !== formKeys.length) {
      issues.push(issue('error', `${stagePath}.forms`, 'duplicate-form-key', 'Form keys must be unique within a stage.'))
    }
    if (
      validateTargetCapabilities
      && capabilities
      && stage.forms?.length
      && !capabilities.forms
    ) {
      issues.push(issue('error', `${stagePath}.forms`, 'unsupported-forms', 'Forms are preserved in the portable project, but the bound checkout adapter cannot install form definitions safely.'))
    }

    const assetKinds = new Set((stage.assets || []).map(asset => asset.kind))
    if (!assetKinds.has('sprite')) {
      issues.push(issue('warning', `${stagePath}.assets`, 'missing-sprite', 'No uploaded sprite is assigned; a donor or target fallback will be required.'))
    }
    if (validateTargetCapabilities && capabilities) {
      for (const asset of stage.assets || []) {
        const capability = assetCapability(asset.kind)
        if (capability && !capabilities[capability]) {
          issues.push(issue(
            'error',
            `${stagePath}.assets.${asset.assetId}`,
            'unsupported-asset-target',
            `The bound checkout has no detected destination for ${asset.kind} assets.`,
          ))
        }
      }
    }
  }

  const edgePairs = new Set()
  for (const [index, edge] of (project.evolutionEdges || []).entries()) {
    const edgePath = `evolutionEdges.${index}`
    if (!stageIds.has(edge.from) || !stageIds.has(edge.to)) {
      issues.push(issue('error', edgePath, 'missing-edge-stage', 'Evolution edge references a missing stage.'))
    }
    if (edge.from === edge.to) {
      issues.push(issue('error', edgePath, 'self-edge', 'A stage cannot evolve into itself.'))
    }
    const pair = `${edge.from}:${edge.to}`
    if (edgePairs.has(pair)) {
      issues.push(issue('error', edgePath, 'duplicate-edge', 'Duplicate evolution edges are not allowed.'))
    }
    edgePairs.add(pair)
    if (!edgeHasRequirement(edge)) {
      issues.push(issue('error', `${edgePath}.trigger`, 'missing-trigger', 'Evolution requirement is incomplete.'))
    }
    if (
      validateTargetCapabilities
      && capabilities
      && !['level', 'item'].includes(edge.trigger?.type)
      && !capabilities.advancedEvolutionTriggers
    ) {
      issues.push(issue('error', `${edgePath}.trigger`, 'unsupported-evolution-trigger', 'The bound checkout adapter installs level and item evolution requirements only.'))
    }
    if (incoming.has(edge.to)) incoming.set(edge.to, incoming.get(edge.to) + 1)
  }
  if ((project.evolutionEdges || []).length && findCycle(project)) {
    issues.push(issue('error', 'evolutionEdges', 'evolution-cycle', 'Evolution graph must not contain a cycle.'))
  }
  if ((project.stages || []).length > 1) {
    const roots = [...incoming.entries()].filter(([, count]) => count === 0)
    if (roots.length !== 1) {
      issues.push(issue('warning', 'evolutionEdges', 'ambiguous-roots', 'A complete evolution line should have exactly one root stage.'))
    }
  }

  for (const policy of project.encounterPolicy?.officialLines || []) {
    if (policy.mode === 'replace' && !stageIds.has(policy.replacementStageId)) {
      issues.push(issue('error', `encounterPolicy.officialLines.${policy.speciesId}`, 'missing-replacement-stage', 'Replacement policy must select a custom stage.'))
    }
  }
  for (const placement of project.encounterPolicy?.placements || []) {
    if (!stageIds.has(placement.stageId)) {
      issues.push(issue('error', `encounterPolicy.placements.${placement.placementId}`, 'missing-placement-stage', 'Encounter placement references a missing stage.'))
    }
    if (!placement.biome) {
      issues.push(issue('error', `encounterPolicy.placements.${placement.placementId}.biome`, 'missing-biome', 'Encounter placement requires a biome.'))
    }
  }
  if (
    validateTargetCapabilities
    && capabilities
    && (
      project.encounterPolicy?.officialLines?.length
      || project.encounterPolicy?.placements?.length
    )
    && !capabilities.encounters
  ) {
    issues.push(issue('error', 'encounterPolicy', 'unsupported-encounters', 'The bound checkout has no detected encounter tables.'))
  }

  if (requireTarget && !binding) {
    issues.push(issue('error', 'targetBindings', 'missing-target', 'Bind at least one PokéRogue checkout before delivery.'))
  } else if (!binding) {
    issues.push(issue('warning', 'targetBindings', 'missing-target', 'No PokéRogue checkout is bound yet.'))
  } else if (validateTargetCapabilities && !capabilities) {
    issues.push(issue('warning', 'targetBindings', 'unknown-capabilities', 'Re-analyze this older target binding before delivery.'))
  }

  const counts = issues.reduce((result, item) => ({
    ...result,
    [item.severity]: (result[item.severity] || 0) + 1,
  }), { error: 0, warning: 0 })
  return { issues, counts, ready: counts.error === 0 }
}

function allocationFor(binding, stage, index) {
  const configured = binding?.stageAllocations?.[stage.stageId]
  const parsed = Number(configured)
  return Number.isInteger(parsed) && parsed > OFFICIAL_DEX_MAX
    ? parsed
    : OFFICIAL_DEX_MAX + index + 1
}

function availabilityForStage(project, stage) {
  const placements = (project.encounterPolicy?.placements || [])
    .filter(item => item.stageId === stage.stageId)
  return {
    wildEncounters: placements.length > 0,
    starters: Boolean(stage.flags?.starter),
    eggs: true,
    trainers: true,
    bosses: true,
    specialRewards: true,
  }
}

export function buildDeliveryManifest(
  project,
  binding = null,
  { generatedAt = () => new Date().toISOString(), sourceRoot } = {},
) {
  const allocations = new Map(project.stages.map((stage, index) => [
    stage.stageId,
    allocationFor(binding, stage, index),
  ]))
  const byId = new Map(project.stages.map(stage => [stage.stageId, stage]))
  const customSpecies = project.stages.map(stage => {
    const edges = (project.evolutionEdges || [])
      .filter(edge => edge.from === stage.stageId)
    const placements = (project.encounterPolicy?.placements || [])
      .filter(item => item.stageId === stage.stageId)
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
      forms: [...(stage.forms || [])],
      evolutions: edges.map(edge => {
        const target = byId.get(edge.to)
        return {
          speciesId: target?.slug,
          level: edge.trigger?.type === 'level' ? edge.trigger.level : undefined,
          item: edge.trigger?.type === 'item' ? edge.trigger.item : undefined,
          trigger: { ...edge.trigger },
        }
      }),
      biomes: placements.map(placement => placement.biome),
      encounterPlacements: placements.map(placement => ({ ...placement })),
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
    replacementSpeciesNumber: policy.mode === 'replace'
      ? allocations.get(policy.replacementStageId)
      : null,
    availability: policy.mode === 'keep'
      ? {
          wildEncounters: true,
          starters: true,
          eggs: true,
          trainers: true,
          bosses: true,
          specialRewards: true,
        }
      : {
          wildEncounters: false,
          starters: false,
          eggs: false,
          trainers: false,
          bosses: false,
          specialRewards: false,
        },
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
      adapter: binding?.adapter || 'auto-detect',
      targetId: binding?.targetId || null,
      fingerprint: binding?.fingerprint || null,
      minimumOfficialDex: OFFICIAL_DEX_MAX,
    },
    sourceRoot: sourceRoot || null,
    registry: customSpecies.map(species => ({
      projectId: species.projectId,
      speciesNumber: species.speciesNumber,
      enumName: species.enumName,
    })),
    customSpecies,
    availabilityOverrides: officialOverrides,
  }
}
