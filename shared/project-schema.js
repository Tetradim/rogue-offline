export const PROJECT_SCHEMA_VERSION = 2
export const STAT_NAMES = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed']

export function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }
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

export function createBlankStage({ ordinal = 1, idFactory = () => makeId('stage') } = {}) {
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

export function addBlankStage(project, {
  idFactory = () => makeId('stage'),
  now = () => new Date().toISOString(),
} = {}) {
  const usedSlugs = new Set(project.stages.map(stage => stage.slug))
  let ordinal = 1
  while (usedSlugs.has(slugify(`Custom Stage ${ordinal}`))) ordinal += 1
  const nextStage = createBlankStage({ ordinal, idFactory })
  return touch({ ...project, stages: [...project.stages, nextStage] }, now)
}

export function removeStage(project, stageId, {
  now = () => new Date().toISOString(),
} = {}) {
  if (project.stages.length === 1 || !project.stages.some(stage => stage.stageId === stageId)) {
    return project
  }
  return touch({
    ...project,
    stages: project.stages.filter(stage => stage.stageId !== stageId),
    evolutionEdges: project.evolutionEdges.filter(edge => edge.from !== stageId && edge.to !== stageId),
  }, now)
}

export function setStageField(project, stageId, field, value, {
  now = () => new Date().toISOString(),
} = {}) {
  if (field === 'stageId' || !project.stages.some(stage => stage.stageId === stageId)) {
    return project
  }
  const stages = project.stages.map(stage => {
    if (stage.stageId !== stageId) return stage
    const next = { ...stage, [field]: value, revision: stage.revision + 1 }
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
  const value = Math.min(255, Math.max(1, Number.isNaN(parsedValue) ? 1 : parsedValue))
  return setStageField(project, stageId, 'baseStats', {
    ...stage.baseStats,
    [stat]: value,
  }, options)
}

export function calculateBst(stage) {
  return STAT_NAMES.reduce((total, stat) => total + Number(stage.baseStats[stat] || 0), 0)
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
    errors.push({
      path: 'schemaVersion',
      code: 'unsupported-schema',
      message: `Expected schema version ${PROJECT_SCHEMA_VERSION}.`,
    })
  }
  if (!isNonEmptyString(project.projectId)) {
    errors.push({
      path: 'projectId',
      code: 'required-project-id',
      message: 'Project ID is required.',
    })
  }
  if (!isNonEmptyString(project.name)) {
    errors.push({ path: 'name', code: 'required', message: 'Project name is required.' })
  }
  if (!isNonEmptyString(project.slug)) {
    errors.push({
      path: 'slug',
      code: 'required-project-slug',
      message: 'Project slug is required.',
    })
  } else {
    const normalizedSlug = slugify(project.slug)
    if (normalizedSlug !== project.slug) {
      errors.push({
        path: 'slug',
        code: 'invalid-project-slug',
        message: `Project slug must be normalized as "${normalizedSlug}".`,
      })
    }
  }
  if (!isPositiveInteger(project.revision)) {
    errors.push({
      path: 'revision',
      code: 'invalid-project-revision',
      message: 'Project revision must be a positive integer.',
    })
  }
  if (!isIsoDateString(project.createdAt)) {
    errors.push({
      path: 'createdAt',
      code: 'invalid-created-at',
      message: 'Created timestamp must be an ISO date string.',
    })
  }
  if (!isIsoDateString(project.updatedAt)) {
    errors.push({
      path: 'updatedAt',
      code: 'invalid-updated-at',
      message: 'Updated timestamp must be an ISO date string.',
    })
  }
  if (!Array.isArray(project.stages)) {
    errors.push({ path: 'stages', code: 'invalid-stages', message: 'Stages must be an array.' })
  } else if (!project.stages.length) {
    errors.push({ path: 'stages', code: 'required', message: 'At least one custom stage is required.' })
  }
  if (!Array.isArray(project.evolutionEdges)) {
    errors.push({
      path: 'evolutionEdges',
      code: 'invalid-evolution-edges',
      message: 'Evolution edges must be an array.',
    })
  } else {
    for (const [index, edge] of project.evolutionEdges.entries()) {
      if (!isObject(edge)) {
        errors.push({
          path: `evolutionEdges.${index}`,
          code: 'invalid-evolution-edge',
          message: 'Evolution edge must be an object.',
        })
      }
    }
  }
  if (!isObject(project.encounterPolicy)) {
    errors.push({
      path: 'encounterPolicy',
      code: 'invalid-encounter-policy',
      message: 'Encounter policy must be an object.',
    })
  } else {
    if (!Array.isArray(project.encounterPolicy.officialLines)) {
      errors.push({
        path: 'encounterPolicy.officialLines',
        code: 'invalid-official-lines',
        message: 'Official encounter lines must be an array.',
      })
    }
    if (!Array.isArray(project.encounterPolicy.placements)) {
      errors.push({
        path: 'encounterPolicy.placements',
        code: 'invalid-placements',
        message: 'Encounter placements must be an array.',
      })
    }
  }
  if (!Array.isArray(project.targetBindings)) {
    errors.push({
      path: 'targetBindings',
      code: 'invalid-target-bindings',
      message: 'Target bindings must be an array.',
    })
  }

  const stageIds = new Set()
  const slugs = new Set()
  for (const [index, stage] of (Array.isArray(project.stages) ? project.stages : []).entries()) {
    if (!isObject(stage)) {
      errors.push({
        path: `stages.${index}`,
        code: 'invalid-stage',
        message: 'Stage must be an object.',
      })
      continue
    }

    const hasStageId = isNonEmptyString(stage.stageId)
    const hasStageName = isNonEmptyString(stage.name)
    const hasStageSlug = isNonEmptyString(stage.slug)
    const stagePath = `stages.${hasStageId ? stage.stageId : index}`

    if (!hasStageId) {
      errors.push({
        path: `${stagePath}.stageId`,
        code: 'required-stage-id',
        message: 'Stage ID is required.',
      })
    } else if (stageIds.has(stage.stageId)) {
      errors.push({
        path: `stages.${stage.stageId}.stageId`,
        code: 'duplicate-stage-id',
        message: `Stage ID "${stage.stageId}" is duplicated.`,
      })
    }
    if (hasStageId) stageIds.add(stage.stageId)

    if (!hasStageName) {
      errors.push({
        path: `${stagePath}.name`,
        code: 'required-stage-name',
        message: 'Stage name is required.',
      })
    }

    if (!hasStageSlug) {
      errors.push({
        path: `${stagePath}.slug`,
        code: 'required-stage-slug',
        message: 'Stage slug is required.',
      })
    } else {
      const normalizedSlug = slugify(stage.slug)
      if (normalizedSlug !== stage.slug) {
        errors.push({
          path: `${stagePath}.slug`,
          code: 'invalid-stage-slug',
          message: `Stage slug must be normalized as "${normalizedSlug}".`,
        })
      }
    }
    if (hasStageSlug && slugs.has(stage.slug)) {
      errors.push({
        path: `${stagePath}.slug`,
        code: 'duplicate-stage-slug',
        message: `Stage slug "${stage.slug}" is already used in this project.`,
      })
    }
    if (hasStageSlug) slugs.add(stage.slug)

    if (stage.source !== 'custom') {
      errors.push({
        path: `${stagePath}.source`,
        code: 'invalid-stage-source',
        message: 'Stage source must be "custom".',
      })
    }

    if (typeof stage.category !== 'string') {
      errors.push({
        path: `${stagePath}.category`,
        code: 'invalid-stage-category',
        message: 'Stage category must be a string.',
      })
    }
    if (!isPositiveInteger(stage.generation)) {
      errors.push({
        path: `${stagePath}.generation`,
        code: 'invalid-stage-generation',
        message: 'Stage generation must be a positive integer.',
      })
    }
    if (!Number.isFinite(stage.height) || stage.height <= 0) {
      errors.push({
        path: `${stagePath}.height`,
        code: 'invalid-stage-height',
        message: 'Stage height must be a positive finite number.',
      })
    }
    if (!Number.isFinite(stage.weight) || stage.weight <= 0) {
      errors.push({
        path: `${stagePath}.weight`,
        code: 'invalid-stage-weight',
        message: 'Stage weight must be a positive finite number.',
      })
    }
    if (!isNonEmptyString(stage.growthRate)) {
      errors.push({
        path: `${stagePath}.growthRate`,
        code: 'invalid-stage-growth-rate',
        message: 'Stage growth rate must be a non-empty string.',
      })
    }
    if (!isIntegerInRange(stage.baseFriendship, 0, 255)) {
      errors.push({
        path: `${stagePath}.baseFriendship`,
        code: 'invalid-stage-base-friendship',
        message: 'Stage base friendship must be an integer from 0 to 255.',
      })
    }
    if (!isIntegerInRange(stage.captureRate, 0, 255)) {
      errors.push({
        path: `${stagePath}.captureRate`,
        code: 'invalid-stage-capture-rate',
        message: 'Stage capture rate must be an integer from 0 to 255.',
      })
    }
    if (!isFiniteInRange(stage.genderRatio, 0, 100)) {
      errors.push({
        path: `${stagePath}.genderRatio`,
        code: 'invalid-stage-gender-ratio',
        message: 'Stage gender ratio must be a finite number from 0 to 100.',
      })
    }
    if (typeof stage.passive !== 'string') {
      errors.push({
        path: `${stagePath}.passive`,
        code: 'invalid-stage-passive',
        message: 'Stage passive must be a string.',
      })
    }
    if (!isPositiveInteger(stage.revision)) {
      errors.push({
        path: `${stagePath}.revision`,
        code: 'invalid-stage-revision',
        message: 'Stage revision must be a positive integer.',
      })
    }

    if (!isObject(stage.flags)) {
      errors.push({
        path: `${stagePath}.flags`,
        code: 'invalid-stage-flags',
        message: 'Stage flags must be an object.',
      })
    } else {
      for (const flag of ['legendary', 'mythical', 'starter']) {
        if (typeof stage.flags[flag] !== 'boolean') {
          errors.push({
            path: `${stagePath}.flags.${flag}`,
            code: 'invalid-stage-flag',
            message: `Stage flag "${flag}" must be boolean.`,
          })
        }
      }
    }

    if (!Array.isArray(stage.types)
      || !stage.types.length
      || !stage.types.every(type => isNonEmptyString(type))) {
      errors.push({
        path: `${stagePath}.types`,
        code: 'invalid-stage-types',
        message: 'Stage types must be a non-empty array of strings.',
      })
    }
    if (!Array.isArray(stage.abilities)
      || !stage.abilities.every(ability => isNonEmptyString(ability))) {
      errors.push({
        path: `${stagePath}.abilities`,
        code: 'invalid-stage-abilities',
        message: 'Stage abilities must be an array of strings.',
      })
    }

    if (!isObject(stage.baseStats)) {
      errors.push({
        path: `${stagePath}.baseStats`,
        code: 'invalid-base-stats',
        message: 'Base stats must be an object.',
      })
    } else {
      for (const stat of STAT_NAMES) {
        const value = stage.baseStats[stat]
        if (!Number.isInteger(value) || value < 1 || value > 255) {
          errors.push({
            path: `${stagePath}.baseStats.${stat}`,
            code: 'invalid-stat',
            message: `${stat} must be an integer from 1 to 255.`,
          })
        }
      }
    }

    if (!isObject(stage.moves)) {
      errors.push({
        path: `${stagePath}.moves`,
        code: 'invalid-moves',
        message: 'Moves must be an object.',
      })
    } else {
      for (const list of ['levelUp', 'tm', 'egg']) {
        if (!Array.isArray(stage.moves[list])) {
          errors.push({
            path: `${stagePath}.moves.${list}`,
            code: 'invalid-move-list',
            message: `Move list "${list}" must be an array.`,
          })
        }
      }
    }

    if (!Array.isArray(stage.forms)) {
      errors.push({
        path: `${stagePath}.forms`,
        code: 'invalid-forms',
        message: 'Forms must be an array.',
      })
    }
    if (!Array.isArray(stage.assets)) {
      errors.push({
        path: `${stagePath}.assets`,
        code: 'invalid-assets',
        message: 'Assets must be an array.',
      })
    }
  }
  return errors
}
