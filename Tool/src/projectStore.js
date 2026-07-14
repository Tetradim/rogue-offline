const STORAGE_KEY = 'pokerogue-mod-studio.project.v1'
export const OFFICIAL_DEX_MAX = 1025
export const CUSTOM_ID_START = 1026

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function defaultAvailability() {
  return {
    wildEncounters: true,
    starters: true,
    eggs: true,
    trainers: true,
    bosses: true,
    specialRewards: true,
  }
}

export function normalizeSpecies(species, { legacy = false } = {}) {
  return {
    ...species,
    projectId: species.projectId || uuid(),
    source: species.source || (legacy || species.speciesNumber <= OFFICIAL_DEX_MAX ? 'legacy' : 'custom'),
    availability: { ...defaultAvailability(), ...(species.availability || {}) },
    revision: Number.isInteger(species.revision) ? species.revision : 1,
  }
}

export function buildRegistry(speciesList) {
  const allocations = {}
  const conflicts = []
  for (const species of speciesList) {
    const key = String(species.speciesNumber)
    if (allocations[key] && allocations[key].projectId !== species.projectId) {
      conflicts.push({ id: species.speciesNumber, first: allocations[key], second: species })
      continue
    }
    allocations[key] = {
      projectId: species.projectId,
      speciesId: species.speciesId,
      name: species.name,
      source: species.source,
    }
  }
  return { allocations, conflicts }
}

export function nextAvailableId(speciesList, start = CUSTOM_ID_START) {
  const used = new Set(speciesList.map(s => Number(s.speciesNumber)))
  let candidate = Math.max(start, CUSTOM_ID_START)
  while (used.has(candidate)) candidate += 1
  return candidate
}

export function validateSpecies(species, speciesList) {
  const errors = []
  const id = Number(species.speciesNumber)
  if (!Number.isInteger(id) || id < CUSTOM_ID_START) {
    errors.push(`Custom species IDs must be ${CUSTOM_ID_START} or greater. Official slots 1-${OFFICIAL_DEX_MAX} are permanently reserved.`)
  }
  const collision = speciesList.find(s => s.projectId !== species.projectId && Number(s.speciesNumber) === id)
  if (collision) errors.push(`#${id} is already owned by ${collision.name} (${collision.speciesId}).`)
  const slugCollision = speciesList.find(s => s.projectId !== species.projectId && s.speciesId === species.speciesId)
  if (slugCollision) errors.push(`Species ID "${species.speciesId}" is already owned by #${slugCollision.speciesNumber} ${slugCollision.name}.`)
  return errors
}

export function loadProject(baseSpecies) {
  const normalizedBase = baseSpecies.map(s => normalizeSpecies(s, { legacy: s.speciesNumber <= OFFICIAL_DEX_MAX }))
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return normalizedBase
    const saved = JSON.parse(raw)
    const savedCustom = (saved.species || []).filter(s => s.source === 'custom' || s.speciesNumber > OFFICIAL_DEX_MAX)
    const legacyOverrides = new Map((saved.species || []).filter(s => s.source === 'legacy').map(s => [s.speciesNumber, s]))
    const mergedLegacy = normalizedBase.map(base => {
      const override = legacyOverrides.get(base.speciesNumber)
      return override ? normalizeSpecies({ ...base, availability: override.availability, projectId: override.projectId, revision: override.revision }, { legacy: true }) : base
    })
    return [...mergedLegacy, ...savedCustom.map(s => normalizeSpecies(s))]
  } catch (error) {
    console.error('Could not restore project; using base roster.', error)
    return normalizedBase
  }
}

export function saveProject(speciesList) {
  const registry = buildRegistry(speciesList)
  if (registry.conflicts.length) throw new Error('Project registry contains duplicate numeric IDs.')
  const payload = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    registry: registry.allocations,
    species: speciesList,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return payload
}
