import { makeId, setStageField, slugify } from './project-schema.js'

export const MOVE_LISTS = ['levelUp', 'tm', 'egg']
export const EVOLUTION_TRIGGER_TYPES = ['level', 'item', 'friendship', 'time', 'move', 'custom']
export const ENCOUNTER_MODES = ['keep', 'suppress', 'replace']
export const ASSET_KINDS = ['sprite', 'icon', 'cry', 'variant']

function nowValue(now) {
  return typeof now === 'function' ? now() : now
}

function touch(project, now = () => new Date().toISOString()) {
  return { ...project, revision: project.revision + 1, updatedAt: nowValue(now) }
}

export function token(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function normalizeMoveEntry(kind, value) {
  if (kind === 'levelUp') {
    const level = Math.min(100, Math.max(1, Number.parseInt(value?.level, 10) || 1))
    const moveId = token(value?.moveId ?? value?.move)
    return moveId ? { level, moveId } : null
  }
  const moveId = token(value?.moveId ?? value)
  return moveId || null
}

export function setStageMoves(project, stageId, kind, entries, options) {
  if (!MOVE_LISTS.includes(kind)) return project
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  const normalized = []
  const seen = new Set()
  for (const entry of entries || []) {
    const value = normalizeMoveEntry(kind, entry)
    if (!value) continue
    const key = kind === 'levelUp' ? `${value.level}:${value.moveId}` : value
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(value)
  }
  if (kind === 'levelUp') normalized.sort((left, right) => left.level - right.level || left.moveId.localeCompare(right.moveId))
  return setStageField(project, stageId, 'moves', { ...stage.moves, [kind]: normalized }, options)
}

export function addStageMove(project, stageId, kind, value, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage || !MOVE_LISTS.includes(kind)) return project
  return setStageMoves(project, stageId, kind, [...(stage.moves?.[kind] || []), value], options)
}

export function removeStageMove(project, stageId, kind, index, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage || !MOVE_LISTS.includes(kind)) return project
  return setStageMoves(project, stageId, kind, (stage.moves?.[kind] || []).filter((_, itemIndex) => itemIndex !== index), options)
}

export function addStageForm(project, stageId, form = {}, {
  idFactory = () => makeId('form'),
  now,
} = {}) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  const name = String(form.name || `Form ${stage.forms.length + 1}`).trim()
  const nextForm = {
    formId: form.formId || idFactory(),
    key: slugify(form.key || name),
    name,
    types: Array.isArray(form.types) && form.types.length ? form.types.slice(0, 2) : [...stage.types],
    abilities: Array.isArray(form.abilities) ? form.abilities.map(token).filter(Boolean).slice(0, 3) : [...stage.abilities],
    passive: token(form.passive || stage.passive),
    statOverrides: { ...(form.statOverrides || {}) },
    assetVariant: String(form.assetVariant || '').trim(),
  }
  return setStageField(project, stageId, 'forms', [...stage.forms, nextForm], { now })
}

export function updateStageForm(project, stageId, formId, patch, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  const forms = stage.forms.map(form => {
    if (form.formId !== formId) return form
    const next = { ...form, ...patch, formId }
    if (patch.name !== undefined && patch.key === undefined) next.key = slugify(patch.name)
    if (patch.key !== undefined) next.key = slugify(patch.key)
    if (patch.abilities !== undefined) next.abilities = patch.abilities.map(token).filter(Boolean).slice(0, 3)
    if (patch.passive !== undefined) next.passive = token(patch.passive)
    return next
  })
  return setStageField(project, stageId, 'forms', forms, options)
}

export function removeStageForm(project, stageId, formId, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  return setStageField(project, stageId, 'forms', stage.forms.filter(form => form.formId !== formId), options)
}

export function upsertEvolutionEdge(project, edge, {
  idFactory = () => makeId('edge'),
  now,
} = {}) {
  if (!project.stages.some(stage => stage.stageId === edge.from)
    || !project.stages.some(stage => stage.stageId === edge.to)
    || edge.from === edge.to) return project
  const triggerType = EVOLUTION_TRIGGER_TYPES.includes(edge.trigger?.type) ? edge.trigger.type : 'level'
  const normalized = {
    edgeId: edge.edgeId || idFactory(),
    from: edge.from,
    to: edge.to,
    trigger: {
      type: triggerType,
      level: triggerType === 'level' ? Math.min(100, Math.max(1, Number.parseInt(edge.trigger?.level, 10) || 1)) : undefined,
      item: triggerType === 'item' ? token(edge.trigger?.item) : undefined,
      friendship: triggerType === 'friendship' ? Math.min(255, Math.max(1, Number.parseInt(edge.trigger?.friendship, 10) || 220)) : undefined,
      time: triggerType === 'time' ? String(edge.trigger?.time || 'DAY').toUpperCase() : undefined,
      move: triggerType === 'move' ? token(edge.trigger?.move) : undefined,
      description: String(edge.trigger?.description || '').trim(),
    },
    priority: Number.parseInt(edge.priority, 10) || 0,
  }
  const existingIndex = project.evolutionEdges.findIndex(candidate => candidate.edgeId === normalized.edgeId)
  const edges = [...project.evolutionEdges]
  if (existingIndex >= 0) edges[existingIndex] = normalized
  else edges.push(normalized)
  return touch({ ...project, evolutionEdges: edges }, now)
}

export function removeEvolutionEdge(project, edgeId, { now } = {}) {
  const edges = project.evolutionEdges.filter(edge => edge.edgeId !== edgeId)
  if (edges.length === project.evolutionEdges.length) return project
  return touch({ ...project, evolutionEdges: edges }, now)
}

export function setOfficialEncounterPolicy(project, official, mode, replacementStageId, { now } = {}) {
  if (!official?.speciesId || !ENCOUNTER_MODES.includes(mode)) return project
  const record = {
    speciesId: official.speciesId,
    speciesNumber: Number(official.speciesNumber),
    name: official.name,
    mode,
    replacementStageId: mode === 'replace' ? replacementStageId || null : null,
  }
  const lines = (project.encounterPolicy?.officialLines || []).filter(line => line.speciesId !== record.speciesId)
  if (mode !== 'keep') lines.push(record)
  return touch({
    ...project,
    encounterPolicy: { ...(project.encounterPolicy || {}), officialLines: lines, placements: [...(project.encounterPolicy?.placements || [])] },
  }, now)
}

export function upsertEncounterPlacement(project, placement, {
  idFactory = () => makeId('placement'),
  now,
} = {}) {
  if (!project.stages.some(stage => stage.stageId === placement.stageId)) return project
  const normalized = {
    placementId: placement.placementId || idFactory(),
    stageId: placement.stageId,
    biome: token(placement.biome),
    weight: Math.max(1, Number.parseInt(placement.weight, 10) || 1),
    minLevel: Math.max(1, Number.parseInt(placement.minLevel, 10) || 1),
    maxLevel: Math.max(1, Number.parseInt(placement.maxLevel, 10) || Number.parseInt(placement.minLevel, 10) || 1),
    rarity: String(placement.rarity || 'common').toLowerCase(),
  }
  if (!normalized.biome) return project
  if (normalized.maxLevel < normalized.minLevel) normalized.maxLevel = normalized.minLevel
  const placements = [...(project.encounterPolicy?.placements || [])]
  const index = placements.findIndex(candidate => candidate.placementId === normalized.placementId)
  if (index >= 0) placements[index] = normalized
  else placements.push(normalized)
  return touch({
    ...project,
    encounterPolicy: { ...(project.encounterPolicy || {}), officialLines: [...(project.encounterPolicy?.officialLines || [])], placements },
  }, now)
}

export function removeEncounterPlacement(project, placementId, { now } = {}) {
  const placements = (project.encounterPolicy?.placements || []).filter(item => item.placementId !== placementId)
  if (placements.length === (project.encounterPolicy?.placements || []).length) return project
  return touch({
    ...project,
    encounterPolicy: { ...(project.encounterPolicy || {}), officialLines: [...(project.encounterPolicy?.officialLines || [])], placements },
  }, now)
}

export function addStageAsset(project, stageId, asset, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage || !ASSET_KINDS.includes(asset?.kind) || !asset?.relativePath) return project
  const record = {
    assetId: asset.assetId || makeId('asset'),
    kind: asset.kind,
    relativePath: String(asset.relativePath).replaceAll('\\', '/'),
    fileName: String(asset.fileName || '').trim(),
    mimeType: String(asset.mimeType || 'application/octet-stream'),
    size: Number(asset.size) || 0,
    sha256: String(asset.sha256 || ''),
  }
  return setStageField(project, stageId, 'assets', [...stage.assets.filter(item => item.assetId !== record.assetId), record], options)
}

export function removeStageAsset(project, stageId, assetId, options) {
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  return setStageField(project, stageId, 'assets', stage.assets.filter(asset => asset.assetId !== assetId), options)
}

export function upsertTargetBinding(project, binding, { now } = {}) {
  if (!binding?.targetId || !binding?.targetDir) return project
  const bindings = [...(project.targetBindings || [])]
  const index = bindings.findIndex(candidate => candidate.targetId === binding.targetId || candidate.targetDir === binding.targetDir)
  const normalized = { ...binding, boundAt: binding.boundAt || nowValue(now || (() => new Date().toISOString())) }
  if (index >= 0) bindings[index] = normalized
  else bindings.push(normalized)
  return touch({ ...project, targetBindings: bindings }, now)
}

export function removeTargetBinding(project, targetId, { now } = {}) {
  const bindings = (project.targetBindings || []).filter(binding => binding.targetId !== targetId)
  if (bindings.length === (project.targetBindings || []).length) return project
  return touch({ ...project, targetBindings: bindings }, now)
}
