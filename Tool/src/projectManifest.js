import { buildRegistry, defaultAvailability, OFFICIAL_DEX_MAX } from './projectStore.js'

export const MOD_SCHEMA_VERSION = 2

function enumName(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function buildProjectManifest(speciesList, metadata = {}) {
  const registry = buildRegistry(speciesList)
  if (registry.conflicts.length) throw new Error('Cannot export a project with duplicate numeric species IDs.')

  const customSpecies = speciesList
    .filter(s => s.source === 'custom' || Number(s.speciesNumber) > OFFICIAL_DEX_MAX)
    .map(s => ({ ...s, enumName: enumName(s.speciesId), availability: { ...defaultAvailability(), ...(s.availability || {}) } }))

  const availabilityOverrides = speciesList
    .filter(s => Object.values({ ...defaultAvailability(), ...(s.availability || {}) }).some(v => v === false))
    .map(s => ({
      projectId: s.projectId,
      speciesNumber: Number(s.speciesNumber),
      speciesId: s.speciesId,
      enumName: enumName(s.speciesId),
      name: s.name,
      source: s.source,
      availability: { ...defaultAvailability(), ...(s.availability || {}) },
    }))

  return {
    schemaVersion: MOD_SCHEMA_VERSION,
    format: 'pokerogue-mod-studio',
    mod: {
      id: metadata.id || 'local-custom-species',
      name: metadata.name || 'Local Custom Species',
      version: metadata.version || '1.0.0',
      generatedAt: new Date().toISOString(),
    },
    target: { game: 'pokerogue', adapter: 'rogue-offline-pokerogue-fork', minimumOfficialDex: OFFICIAL_DEX_MAX },
    registry: registry.allocations,
    customSpecies,
    availabilityOverrides,
  }
}

export function downloadProjectManifest(speciesList) {
  const manifest = buildProjectManifest(speciesList)
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'pokerogue-mod-project.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
