export const PROJECT_SCHEMA_VERSION = 2
export const STAT_NAMES = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed']
export const ASSET_KINDS = ['sprite', 'icon', 'cry', 'variant']
export const EVOLUTION_TRIGGER_TYPES = ['level', 'item', 'friendship', 'time', 'move', 'custom']
export const MAX_EGG_MOVES = 4
export const MAX_ASSET_BYTES = 8 * 1024 * 1024

const TOKEN_PATTERN = /^[A-Z][A-Z0-9_]*$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/i

export function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'
}

function resolveNow(now) {
  return typeof now === 'function' ? now() : now
}

function touch(project, now) {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: resolveNow(now),
  }
}

export function createBlankStage({
  ordinal = 1,
  idFactory = () => makeId('stage'),
} = {}) {
  const name = `Custom Stage ${ordinal}`
  return {
    stageId: idFactory(),
    source: 'custom',
    name,
    slug: slugify(name),
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
  }
}

export function createBlankProject({
  name,
  idFactory = () => makeId('project'),
  now = () => new Date().toISOString(),
} = {}) {
  const timestamp = resolveNow(now)
  const projectName = String(name || '').trim() || 'Untitled Evolution Line'
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: idFactory(),
    name: projectName,
    slug: slugify(projectName),
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    stages: [createBlankStage({ ordinal: 1, idFactory })],
    evolutionEdges: [],
    encounterPolicy: { officialLines: [], placements: [] },
    targetBindings: [],
  }
}

export function addBlankStage(project, {
  idFactory = () => makeId('stage'),
  now = () => new Date().toISOString(),
} = {}) {
  const usedSlugs = new Set(project.stages.map(stage => stage.slug))
  let ordinal = 1
  while (usedSlugs.has(slugify(`Custom Stage ${ordinal}`))) ordinal += 1
  const stage = createBlankStage({ ordinal, idFactory })
  return touch({ ...project, stages: [...project.stages, stage] }, now)
}

export function removeStage(project, stageId, {
  now = () => new Date().toISOString(),
} = {}) {
  if (
    project.stages.length === 1
    || !project.stages.some(stage => stage.stageId === stageId)
  ) return project

  const targetBindings = (project.targetBindings || []).map(binding => ({
    ...binding,
    stageAllocations: Object.fromEntries(
      Object.entries(binding.stageAllocations || {})
        .filter(([candidate]) => candidate !== stageId),
    ),
  }))
  return touch({
    ...project,
    stages: project.stages.filter(stage => stage.stageId !== stageId),
    evolutionEdges: (project.evolutionEdges || [])
      .filter(edge => edge.from !== stageId && edge.to !== stageId),
    encounterPolicy: {
      officialLines: (project.encounterPolicy?.officialLines || [])
        .filter(policy => policy.replacementStageId !== stageId),
      placements: (project.encounterPolicy?.placements || [])
        .filter(placement => placement.stageId !== stageId),
    },
    targetBindings,
  }, now)
}

export function setStageField(project, stageId, field, value, {
  now = () => new Date().toISOString(),
} = {}) {
  if (
    field === 'stageId'
    || !project.stages.some(stage => stage.stageId === stageId)
  ) return project

  const stages = project.stages.map(stage => {
    if (stage.stageId !== stageId) return stage
    const next = {
      ...stage,
      [field]: value,
      revision: stage.revision + 1,
    }
    if (field === 'name') next.slug = slugify(value)
    return next
  })
  return touch({ ...project, stages }, now)
}

export function setStageStat(project, stageId, stat, rawValue, options = {}) {
  if (!STAT_NAMES.includes(stat)) return project
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  const parsedValue = Number.parseInt(rawValue, 10)
  const value = Math.min(
    255,
    Math.max(1, Number.isNaN(parsedValue) ? 1 : parsedValue),
  )
  return setStageField(project, stageId, 'baseStats', {
    ...stage.baseStats,
    [stat]: value,
  }, options)
}

export function calculateBst(stage) {
  return STAT_NAMES.reduce(
    (total, stat) => total + Number(stage?.baseStats?.[stat] || 0),
    0,
  )
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

function isIsoDateString(value) {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function validToken(value, { optional = false } = {}) {
  if (optional && value === '') return true
  return isNonEmptyString(value) && TOKEN_PATTERN.test(value)
}

function add(errors, path, code, message) {
  errors.push({ path, code, message })
}

function validateMoveLists(errors, stage, stagePath) {
  if (!isObject(stage.moves)) {
    add(errors, `${stagePath}.moves`, 'invalid-moves', 'Moves must be an object.')
    return
  }
  for (const list of ['levelUp', 'tm', 'egg']) {
    const entries = stage.moves[list]
    if (!Array.isArray(entries)) {
      add(
        errors,
        `${stagePath}.moves.${list}`,
        'invalid-move-list',
        `Move list "${list}" must be an array.`,
      )
      continue
    }
    if (list === 'egg' && entries.length > MAX_EGG_MOVES) {
      add(
        errors,
        `${stagePath}.moves.egg`,
        'too-many-egg-moves',
        `Egg moves are limited to ${MAX_EGG_MOVES}.`,
      )
    }
    entries.forEach((entry, index) => {
      if (list === 'levelUp') {
        if (
          !isObject(entry)
          || !isIntegerInRange(entry.level, 1, 100)
          || !validToken(entry.moveId)
        ) {
          add(
            errors,
            `${stagePath}.moves.levelUp.${index}`,
            'invalid-level-move',
            'Level-up moves require a level from 1 to 100 and an enum-style move ID.',
          )
        }
      } else if (!validToken(entry)) {
        add(
          errors,
          `${stagePath}.moves.${list}.${index}`,
          'invalid-move-id',
          'Move IDs must use enum-style A_Z tokens.',
        )
      }
    })
  }
}

function validateForms(errors, stage, stagePath) {
  if (!Array.isArray(stage.forms)) {
    add(errors, `${stagePath}.forms`, 'invalid-forms', 'Forms must be an array.')
    return
  }
  const ids = new Set()
  const keys = new Set()
  stage.forms.forEach((form, index) => {
    const formPath = `${stagePath}.forms.${index}`
    if (!isObject(form)) {
      add(errors, formPath, 'invalid-form', 'Form must be an object.')
      return
    }
    if (!isNonEmptyString(form.formId)) {
      add(errors, `${formPath}.formId`, 'required-form-id', 'Form ID is required.')
    } else if (ids.has(form.formId)) {
      add(
        errors,
        `${formPath}.formId`,
        'duplicate-form-id',
        `Form ID "${form.formId}" is duplicated.`,
      )
    } else ids.add(form.formId)

    if (!isNonEmptyString(form.name)) {
      add(errors, `${formPath}.name`, 'required-form-name', 'Form name is required.')
    }
    if (!isNonEmptyString(form.key) || slugify(form.key) !== form.key) {
      add(
        errors,
        `${formPath}.key`,
        'invalid-form-key',
        'Form key must be a normalized non-empty slug.',
      )
    } else if (keys.has(form.key)) {
      add(
        errors,
        `${formPath}.key`,
        'duplicate-form-key',
        `Form key "${form.key}" is duplicated.`,
      )
    } else keys.add(form.key)

    if (
      !Array.isArray(form.types)
      || form.types.length < 1
      || form.types.length > 2
      || !form.types.every(value => validToken(value))
    ) {
      add(
        errors,
        `${formPath}.types`,
        'invalid-form-types',
        'Form types must contain one or two enum-style IDs.',
      )
    }
    if (
      !Array.isArray(form.abilities)
      || form.abilities.length > 3
      || !form.abilities.every(value => validToken(value))
    ) {
      add(
        errors,
        `${formPath}.abilities`,
        'invalid-form-abilities',
        'Form abilities must contain at most three enum-style IDs.',
      )
    }
    if (
      typeof form.passive !== 'string'
      || !validToken(form.passive, { optional: true })
    ) {
      add(
        errors,
        `${formPath}.passive`,
        'invalid-form-passive',
        'Form passive must be blank or an enum-style ID.',
      )
    }
    if (typeof form.assetVariant !== 'string') {
      add(
        errors,
        `${formPath}.assetVariant`,
        'invalid-form-asset-variant',
        'Form asset variant must be a string.',
      )
    }
    if (
      typeof form.changeItem !== 'string'
      || !validToken(form.changeItem, { optional: true })
    ) {
      add(
        errors,
        `${formPath}.changeItem`,
        'invalid-form-change-item',
        'Form change item must be blank or an enum-style ID.',
      )
    }
    if (typeof form.isStarterSelectable !== 'boolean') {
      add(
        errors,
        `${formPath}.isStarterSelectable`,
        'invalid-form-starter-flag',
        'Form starter visibility must be boolean.',
      )
    }
    if (!isObject(form.statOverrides)) {
      add(
        errors,
        `${formPath}.statOverrides`,
        'invalid-form-stat-overrides',
        'Form stat overrides must be an object.',
      )
    } else {
      for (const [name, value] of Object.entries(form.statOverrides)) {
        if (!STAT_NAMES.includes(name) || !isIntegerInRange(value, 1, 255)) {
          add(
            errors,
            `${formPath}.statOverrides.${name}`,
            'invalid-form-stat',
            'Form stat overrides must use known stats with values from 1 to 255.',
          )
        }
      }
    }
  })
}

function validateAssets(errors, stage, stagePath) {
  if (!Array.isArray(stage.assets)) {
    add(errors, `${stagePath}.assets`, 'invalid-assets', 'Assets must be an array.')
    return
  }
  const ids = new Set()
  const kinds = new Set()
  stage.assets.forEach((asset, index) => {
    const assetPath = `${stagePath}.assets.${index}`
    if (!isObject(asset)) {
      add(errors, assetPath, 'invalid-asset', 'Asset must be an object.')
      return
    }
    if (!isNonEmptyString(asset.assetId)) {
      add(errors, `${assetPath}.assetId`, 'required-asset-id', 'Asset ID is required.')
    } else if (ids.has(asset.assetId)) {
      add(
        errors,
        `${assetPath}.assetId`,
        'duplicate-asset-id',
        `Asset ID "${asset.assetId}" is duplicated.`,
      )
    } else ids.add(asset.assetId)

    if (!ASSET_KINDS.includes(asset.kind)) {
      add(errors, `${assetPath}.kind`, 'invalid-asset-kind', 'Asset kind is not supported.')
    } else if (kinds.has(asset.kind)) {
      add(
        errors,
        `${assetPath}.kind`,
        'duplicate-asset-kind',
        `Only one ${asset.kind} asset may be assigned to a stage.`,
      )
    } else kinds.add(asset.kind)

    const relative = typeof asset.relativePath === 'string'
      ? asset.relativePath.replaceAll('\\', '/')
      : ''
    if (
      !relative.startsWith('assets/')
      || relative.split('/').includes('..')
    ) {
      add(
        errors,
        `${assetPath}.relativePath`,
        'invalid-asset-path',
        'Asset path must stay under assets/.',
      )
    }
    if (!isNonEmptyString(asset.fileName)) {
      add(
        errors,
        `${assetPath}.fileName`,
        'required-asset-filename',
        'Asset filename is required.',
      )
    }
    if (!isNonEmptyString(asset.mimeType)) {
      add(
        errors,
        `${assetPath}.mimeType`,
        'required-asset-mime',
        'Asset MIME type is required.',
      )
    }
    if (
      !Number.isInteger(asset.size)
      || asset.size < 1
      || asset.size > MAX_ASSET_BYTES
    ) {
      add(
        errors,
        `${assetPath}.size`,
        'invalid-asset-size',
        `Asset size must be from 1 through ${MAX_ASSET_BYTES} bytes.`,
      )
    }
    if (
      typeof asset.sha256 !== 'string'
      || !SHA256_PATTERN.test(asset.sha256)
    ) {
      add(
        errors,
        `${assetPath}.sha256`,
        'invalid-asset-hash',
        'Asset SHA-256 must contain 64 hexadecimal characters.',
      )
    }
    for (const dimension of ['width', 'height']) {
      if (
        asset[dimension] !== undefined
        && !isIntegerInRange(asset[dimension], 1, 4096)
      ) {
        add(
          errors,
          `${assetPath}.${dimension}`,
          'invalid-asset-dimension',
          'Asset dimensions must be integers from 1 to 4096.',
        )
      }
    }
  })
}

function validateEdges(errors, project) {
  if (!Array.isArray(project.evolutionEdges)) {
    add(
      errors,
      'evolutionEdges',
      'invalid-evolution-edges',
      'Evolution edges must be an array.',
    )
    return
  }
  const ids = new Set()
  project.evolutionEdges.forEach((edge, index) => {
    const edgePath = `evolutionEdges.${index}`
    if (!isObject(edge)) {
      add(errors, edgePath, 'invalid-evolution-edge', 'Evolution edge must be an object.')
      return
    }
    if (!isNonEmptyString(edge.edgeId)) {
      add(errors, `${edgePath}.edgeId`, 'required-edge-id', 'Evolution edge ID is required.')
    } else if (ids.has(edge.edgeId)) {
      add(
        errors,
        `${edgePath}.edgeId`,
        'duplicate-edge-id',
        `Evolution edge ID "${edge.edgeId}" is duplicated.`,
      )
    } else ids.add(edge.edgeId)

    if (!isNonEmptyString(edge.from)) {
      add(errors, `${edgePath}.from`, 'required-edge-from', 'Evolution source stage is required.')
    }
    if (!isNonEmptyString(edge.to)) {
      add(errors, `${edgePath}.to`, 'required-edge-to', 'Evolution target stage is required.')
    }
    if (
      !isObject(edge.trigger)
      || !EVOLUTION_TRIGGER_TYPES.includes(edge.trigger.type)
    ) {
      add(
        errors,
        `${edgePath}.trigger`,
        'invalid-evolution-trigger',
        'Evolution trigger is invalid.',
      )
      return
    }
    const trigger = edge.trigger
    if (
      trigger.type === 'level'
      && !isIntegerInRange(trigger.level, 1, 100)
    ) {
      add(
        errors,
        `${edgePath}.trigger.level`,
        'invalid-evolution-level',
        'Evolution level must be from 1 to 100.',
      )
    }
    if (
      trigger.type === 'friendship'
      && !isIntegerInRange(trigger.friendship, 1, 255)
    ) {
      add(
        errors,
        `${edgePath}.trigger.friendship`,
        'invalid-evolution-friendship',
        'Evolution friendship must be from 1 to 255.',
      )
    }
    if (trigger.type === 'item' && !validToken(trigger.item)) {
      add(
        errors,
        `${edgePath}.trigger.item`,
        'invalid-evolution-item',
        'Evolution item must be an enum-style ID.',
      )
    }
    if (trigger.type === 'time' && !validToken(trigger.time)) {
      add(
        errors,
        `${edgePath}.trigger.time`,
        'invalid-evolution-time',
        'Evolution time must be an enum-style ID.',
      )
    }
    if (trigger.type === 'move' && !validToken(trigger.move)) {
      add(
        errors,
        `${edgePath}.trigger.move`,
        'invalid-evolution-move',
        'Evolution move must be an enum-style ID.',
      )
    }
    if (
      trigger.type === 'custom'
      && !isNonEmptyString(trigger.description)
    ) {
      add(
        errors,
        `${edgePath}.trigger.description`,
        'invalid-evolution-description',
        'Custom evolution description is required.',
      )
    }
    if (!Number.isInteger(edge.priority)) {
      add(
        errors,
        `${edgePath}.priority`,
        'invalid-edge-priority',
        'Evolution edge priority must be an integer.',
      )
    }
  })
}

function validateEncounterPolicy(errors, project) {
  if (!isObject(project.encounterPolicy)) {
    add(
      errors,
      'encounterPolicy',
      'invalid-encounter-policy',
      'Encounter policy must be an object.',
    )
    return
  }
  if (!Array.isArray(project.encounterPolicy.officialLines)) {
    add(
      errors,
      'encounterPolicy.officialLines',
      'invalid-official-lines',
      'Official encounter lines must be an array.',
    )
  } else {
    project.encounterPolicy.officialLines.forEach((policy, index) => {
      const policyPath = `encounterPolicy.officialLines.${index}`
      if (!isObject(policy)) {
        add(
          errors,
          policyPath,
          'invalid-official-policy',
          'Official encounter policy must be an object.',
        )
        return
      }
      if (!isNonEmptyString(policy.speciesId)) {
        add(
          errors,
          `${policyPath}.speciesId`,
          'required-official-species',
          'Official species ID is required.',
        )
      }
      if (!isIntegerInRange(policy.speciesNumber, 1, 1025)) {
        add(
          errors,
          `${policyPath}.speciesNumber`,
          'invalid-official-number',
          'Official species number must be from 1 to 1025.',
        )
      }
      if (!isNonEmptyString(policy.name)) {
        add(
          errors,
          `${policyPath}.name`,
          'required-official-name',
          'Official species name is required.',
        )
      }
      if (!['suppress', 'replace'].includes(policy.mode)) {
        add(
          errors,
          `${policyPath}.mode`,
          'invalid-official-mode',
          'Stored official policy must be suppress or replace.',
        )
      }
      if (
        policy.mode === 'replace'
        && !isNonEmptyString(policy.replacementStageId)
      ) {
        add(
          errors,
          `${policyPath}.replacementStageId`,
          'required-replacement-stage',
          'Replacement stage is required.',
        )
      }
    })
  }

  if (!Array.isArray(project.encounterPolicy.placements)) {
    add(
      errors,
      'encounterPolicy.placements',
      'invalid-placements',
      'Encounter placements must be an array.',
    )
  } else {
    project.encounterPolicy.placements.forEach((placement, index) => {
      const placementPath = `encounterPolicy.placements.${index}`
      if (!isObject(placement)) {
        add(
          errors,
          placementPath,
          'invalid-placement',
          'Encounter placement must be an object.',
        )
        return
      }
      if (!isNonEmptyString(placement.placementId)) {
        add(
          errors,
          `${placementPath}.placementId`,
          'required-placement-id',
          'Encounter placement ID is required.',
        )
      }
      if (!isNonEmptyString(placement.stageId)) {
        add(
          errors,
          `${placementPath}.stageId`,
          'required-placement-stage',
          'Encounter placement stage is required.',
        )
      }
      if (!validToken(placement.biome)) {
        add(
          errors,
          `${placementPath}.biome`,
          'invalid-placement-biome',
          'Biome must be an enum-style ID.',
        )
      }
    })
  }
}

function validateBindings(errors, project) {
  if (!Array.isArray(project.targetBindings)) {
    add(
      errors,
      'targetBindings',
      'invalid-target-bindings',
      'Target bindings must be an array.',
    )
    return
  }
  project.targetBindings.forEach((binding, index) => {
    const bindingPath = `targetBindings.${index}`
    if (!isObject(binding)) {
      add(
        errors,
        bindingPath,
        'invalid-target-binding',
        'Target binding must be an object.',
      )
      return
    }
    if (!isNonEmptyString(binding.targetId)) {
      add(errors, `${bindingPath}.targetId`, 'required-target-id', 'Target ID is required.')
    }
    if (!isNonEmptyString(binding.targetDir)) {
      add(
        errors,
        `${bindingPath}.targetDir`,
        'required-target-dir',
        'Target directory is required.',
      )
    }
    if (!isNonEmptyString(binding.adapter)) {
      add(
        errors,
        `${bindingPath}.adapter`,
        'required-target-adapter',
        'Target adapter is required.',
      )
    }
    if (!isObject(binding.stageAllocations)) {
      add(
        errors,
        `${bindingPath}.stageAllocations`,
        'invalid-stage-allocations',
        'Target stage allocations must be an object.',
      )
    } else {
      for (const [stageId, value] of Object.entries(binding.stageAllocations)) {
        if (
          !isNonEmptyString(stageId)
          || !Number.isInteger(value)
          || value <= 1025
        ) {
          add(
            errors,
            `${bindingPath}.stageAllocations.${stageId}`,
            'invalid-stage-allocation',
            'Custom species allocation must be an integer above 1025.',
          )
        }
      }
    }
  })
}

export function validateProject(project) {
  if (!isObject(project)) {
    return [{
      path: 'project',
      code: 'invalid-project',
      message: 'Project must be an object.',
    }]
  }
  const errors = []
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    add(
      errors,
      'schemaVersion',
      'unsupported-schema',
      `Expected schema version ${PROJECT_SCHEMA_VERSION}.`,
    )
  }
  if (!isNonEmptyString(project.projectId)) {
    add(errors, 'projectId', 'required-project-id', 'Project ID is required.')
  }
  if (!isNonEmptyString(project.name)) {
    add(errors, 'name', 'required', 'Project name is required.')
  }
  if (!isNonEmptyString(project.slug)) {
    add(errors, 'slug', 'required-project-slug', 'Project slug is required.')
  } else if (slugify(project.slug) !== project.slug) {
    add(
      errors,
      'slug',
      'invalid-project-slug',
      `Project slug must be normalized as "${slugify(project.slug)}".`,
    )
  }
  if (!isPositiveInteger(project.revision)) {
    add(
      errors,
      'revision',
      'invalid-project-revision',
      'Project revision must be a positive integer.',
    )
  }
  if (!isIsoDateString(project.createdAt)) {
    add(
      errors,
      'createdAt',
      'invalid-created-at',
      'Created timestamp must be an ISO date string.',
    )
  }
  if (!isIsoDateString(project.updatedAt)) {
    add(
      errors,
      'updatedAt',
      'invalid-updated-at',
      'Updated timestamp must be an ISO date string.',
    )
  }

  const stageIds = new Set()
  const slugs = new Set()
  if (!Array.isArray(project.stages)) {
    add(errors, 'stages', 'invalid-stages', 'Stages must be an array.')
  } else if (!project.stages.length) {
    add(errors, 'stages', 'required', 'At least one custom stage is required.')
  } else {
    project.stages.forEach((stage, index) => {
      if (!isObject(stage)) {
        add(errors, `stages.${index}`, 'invalid-stage', 'Stage must be an object.')
        return
      }
      const hasId = isNonEmptyString(stage.stageId)
      const stagePath = `stages.${hasId ? stage.stageId : index}`
      if (!hasId) {
        add(
          errors,
          `${stagePath}.stageId`,
          'required-stage-id',
          'Stage ID is required.',
        )
      } else if (stageIds.has(stage.stageId)) {
        add(
          errors,
          `${stagePath}.stageId`,
          'duplicate-stage-id',
          `Stage ID "${stage.stageId}" is duplicated.`,
        )
      } else stageIds.add(stage.stageId)

      if (!isNonEmptyString(stage.name)) {
        add(
          errors,
          `${stagePath}.name`,
          'required-stage-name',
          'Stage name is required.',
        )
      }
      if (!isNonEmptyString(stage.slug)) {
        add(
          errors,
          `${stagePath}.slug`,
          'required-stage-slug',
          'Stage slug is required.',
        )
      } else if (slugify(stage.slug) !== stage.slug) {
        add(
          errors,
          `${stagePath}.slug`,
          'invalid-stage-slug',
          `Stage slug must be normalized as "${slugify(stage.slug)}".`,
        )
      } else if (slugs.has(stage.slug)) {
        add(
          errors,
          `${stagePath}.slug`,
          'duplicate-stage-slug',
          `Stage slug "${stage.slug}" is already used in this project.`,
        )
      } else slugs.add(stage.slug)

      if (stage.source !== 'custom') {
        add(
          errors,
          `${stagePath}.source`,
          'invalid-stage-source',
          'Stage source must be "custom".',
        )
      }
      if (typeof stage.category !== 'string') {
        add(
          errors,
          `${stagePath}.category`,
          'invalid-stage-category',
          'Stage category must be a string.',
        )
      }
      if (!isPositiveInteger(stage.generation)) {
        add(
          errors,
          `${stagePath}.generation`,
          'invalid-stage-generation',
          'Stage generation must be a positive integer.',
        )
      }
      if (!Number.isFinite(stage.height) || stage.height <= 0) {
        add(
          errors,
          `${stagePath}.height`,
          'invalid-stage-height',
          'Stage height must be a positive finite number.',
        )
      }
      if (!Number.isFinite(stage.weight) || stage.weight <= 0) {
        add(
          errors,
          `${stagePath}.weight`,
          'invalid-stage-weight',
          'Stage weight must be a positive finite number.',
        )
      }
      if (!isNonEmptyString(stage.growthRate)) {
        add(
          errors,
          `${stagePath}.growthRate`,
          'invalid-stage-growth-rate',
          'Stage growth rate must be a non-empty string.',
        )
      } else if (!validToken(stage.growthRate)) {
        add(
          errors,
          `${stagePath}.growthRate`,
          'invalid-stage-growth-rate-token',
          'Stage growth rate must be an enum-style ID.',
        )
      }
      if (!isIntegerInRange(stage.baseFriendship, 0, 255)) {
        add(
          errors,
          `${stagePath}.baseFriendship`,
          'invalid-stage-base-friendship',
          'Stage base friendship must be an integer from 0 to 255.',
        )
      }
      if (!isIntegerInRange(stage.captureRate, 0, 255)) {
        add(
          errors,
          `${stagePath}.captureRate`,
          'invalid-stage-capture-rate',
          'Stage capture rate must be an integer from 0 to 255.',
        )
      }
      if (!isFiniteInRange(stage.genderRatio, 0, 100)) {
        add(
          errors,
          `${stagePath}.genderRatio`,
          'invalid-stage-gender-ratio',
          'Stage gender ratio must be a finite number from 0 to 100.',
        )
      }
      if (typeof stage.passive !== 'string') {
        add(
          errors,
          `${stagePath}.passive`,
          'invalid-stage-passive',
          'Stage passive must be a string.',
        )
      } else if (!validToken(stage.passive, { optional: true })) {
        add(
          errors,
          `${stagePath}.passive`,
          'invalid-stage-passive-token',
          'Stage passive must be blank or an enum-style ID.',
        )
      }
      if (!isPositiveInteger(stage.revision)) {
        add(
          errors,
          `${stagePath}.revision`,
          'invalid-stage-revision',
          'Stage revision must be a positive integer.',
        )
      }

      if (!isObject(stage.flags)) {
        add(
          errors,
          `${stagePath}.flags`,
          'invalid-stage-flags',
          'Stage flags must be an object.',
        )
      } else {
        for (const flag of ['legendary', 'mythical', 'starter']) {
          if (typeof stage.flags[flag] !== 'boolean') {
            add(
              errors,
              `${stagePath}.flags.${flag}`,
              'invalid-stage-flag',
              `Stage flag "${flag}" must be boolean.`,
            )
          }
        }
        if (
          stage.flags.genderless !== undefined
          && typeof stage.flags.genderless !== 'boolean'
        ) {
          add(
            errors,
            `${stagePath}.flags.genderless`,
            'invalid-stage-flag',
            'Stage flag "genderless" must be boolean.',
          )
        }
      }

      const validTypesShape = (
        Array.isArray(stage.types)
        && stage.types.length > 0
        && stage.types.every(isNonEmptyString)
      )
      if (!validTypesShape) {
        add(
          errors,
          `${stagePath}.types`,
          'invalid-stage-types',
          'Stage types must be a non-empty array of strings.',
        )
      } else if (
        stage.types.length > 2
        || !stage.types.every(value => validToken(value))
      ) {
        add(
          errors,
          `${stagePath}.types`,
          'invalid-stage-type-tokens',
          'Stage types must contain one or two enum-style IDs.',
        )
      }

      const validAbilitiesShape = (
        Array.isArray(stage.abilities)
        && stage.abilities.every(isNonEmptyString)
      )
      if (!validAbilitiesShape) {
        add(
          errors,
          `${stagePath}.abilities`,
          'invalid-stage-abilities',
          'Stage abilities must be an array of strings.',
        )
      } else if (
        stage.abilities.length > 3
        || !stage.abilities.every(value => validToken(value))
      ) {
        add(
          errors,
          `${stagePath}.abilities`,
          'invalid-stage-ability-tokens',
          'Stage abilities must contain at most three enum-style IDs.',
        )
      }

      if (!isObject(stage.baseStats)) {
        add(
          errors,
          `${stagePath}.baseStats`,
          'invalid-base-stats',
          'Base stats must be an object.',
        )
      } else {
        for (const stat of STAT_NAMES) {
          if (!isIntegerInRange(stage.baseStats[stat], 1, 255)) {
            add(
              errors,
              `${stagePath}.baseStats.${stat}`,
              'invalid-stat',
              `${stat} must be an integer from 1 to 255.`,
            )
          }
        }
      }

      validateMoveLists(errors, stage, stagePath)
      validateForms(errors, stage, stagePath)
      validateAssets(errors, stage, stagePath)
    })
  }

  validateEdges(errors, project)
  validateEncounterPolicy(errors, project)
  validateBindings(errors, project)
  return errors
}
