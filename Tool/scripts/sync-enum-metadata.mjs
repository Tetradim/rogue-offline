import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ABILITY_OPTIONS, MOVE_OPTIONS } from '../src/options.generated.js'

const LOCALE_COMMIT = '7ac925063b91cfb58eaaddf5a3b9c8c8e87d1e43'
const LOCALE_ROOT = `https://raw.githubusercontent.com/pagefaultgames/pokerogue-locales/${LOCALE_COMMIT}/en`
const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/enum-metadata.generated.js')

function normalized(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

function tokenToCamel(token) {
  const words = token.toLowerCase().split('_')
  return words[0] + words.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

async function readLocale(file) {
  const response = await fetch(`${LOCALE_ROOT}/${file}`)
  if (!response.ok) throw new Error(`Failed to download ${file}: HTTP ${response.status}`)
  return response.json()
}

function buildIndex(locale) {
  const byName = new Map()
  const byKey = new Map()
  for (const [key, entry] of Object.entries(locale)) {
    byKey.set(normalized(key), entry)
    if (entry?.name) byName.set(normalized(entry.name), entry)
  }
  return { byName, byKey }
}

function buildMetadata(options, locale, descriptionField, catalogName) {
  const index = buildIndex(locale)
  const metadata = {}
  const missing = []

  for (const token of options) {
    if (token === 'NONE') continue
    const direct = locale[tokenToCamel(token)]
    const entry = direct || index.byKey.get(normalized(token)) || index.byName.get(normalized(token))
    const description = entry?.[descriptionField]
    if (!entry?.name || !description) {
      missing.push(token)
      continue
    }
    metadata[token] = { name: entry.name, description }
  }

  if (missing.length) {
    throw new Error(`${catalogName} metadata is missing ${missing.length} entries: ${missing.join(', ')}`)
  }
  return metadata
}

const [abilities, moves] = await Promise.all([
  readLocale('ability.json'),
  readLocale('move.json'),
])

const abilityMetadata = buildMetadata(ABILITY_OPTIONS, abilities, 'description', 'Ability')
const moveMetadata = buildMetadata(MOVE_OPTIONS, moves, 'effect', 'Move')
const banner = `// Generated from pagefaultgames/pokerogue-locales at ${LOCALE_COMMIT}.\n// Sources: en/ability.json descriptions and en/move.json effects.\n// Run \`npm run sync:enum-metadata\` to refresh. Do not edit by hand.\n`
const source = `${banner}\nexport const ABILITY_METADATA = ${JSON.stringify(abilityMetadata, null, 2)}\n\nexport const MOVE_METADATA = ${JSON.stringify(moveMetadata, null, 2)}\n`

await writeFile(outputPath, source, 'utf8')
console.log(`Wrote ${Object.keys(abilityMetadata).length} ability descriptions and ${Object.keys(moveMetadata).length} move descriptions to ${outputPath}`)
