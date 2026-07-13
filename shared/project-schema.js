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
  if (typeof project.name !== 'string' || !project.name.trim()) {
    errors.push({ path: 'name', code: 'required', message: 'Project name is required.' })
  }
  if (!Array.isArray(project.stages)) {
    errors.push({ path: 'stages', code: 'invalid-stages', message: 'Stages must be an array.' })
  } else if (!project.stages.length) {
    errors.push({ path: 'stages', code: 'required', message: 'At least one custom stage is required.' })
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

    const hasStageId = typeof stage.stageId === 'string' && Boolean(stage.stageId.trim())
    const hasStageName = typeof stage.name === 'string' && Boolean(stage.name.trim())
    const hasStageSlug = typeof stage.slug === 'string' && Boolean(stage.slug.trim())
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
