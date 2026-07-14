import { createHash } from 'node:crypto'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const MAX_ENTRIES = 20000
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.pokerogue-mod-studio', 'dist', 'build', 'coverage'])

function targetError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

async function walk(root) {
  const files = []
  const directories = []
  const pending = [root]
  while (pending.length) {
    const directory = pending.pop()
    directories.push(directory)
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (files.length + directories.length > MAX_ENTRIES) throw targetError('Target checkout is too large to inspect safely.')
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) pending.push(full)
      } else if (entry.isFile()) files.push(full)
    }
  }
  return { files, directories }
}

function normalized(relativePath) {
  return relativePath.replaceAll('\\', '/')
}

function choose(files, root, patterns) {
  const candidates = files.map(file => ({ file, relative: normalized(path.relative(root, file)).toLowerCase() }))
  for (const pattern of patterns) {
    const found = candidates.find(candidate => pattern.test(candidate.relative))
    if (found) return found.file
  }
  return null
}

async function readOptional(file) {
  if (!file) return ''
  try { return await readFile(file, 'utf8') } catch { return '' }
}

function parseSpeciesIds(source) {
  const ids = new Set()
  const names = new Set()
  const pattern = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?/gm
  for (const match of source.matchAll(pattern)) {
    names.add(match[1])
    ids.add(Number(match[2]))
  }
  return { ids, names }
}

async function resolveGitRevision(root) {
  const head = await readOptional(path.join(root, '.git', 'HEAD'))
  if (!head.trim()) return null
  if (!head.startsWith('ref:')) return head.trim()
  const ref = head.slice(5).trim()
  return (await readOptional(path.join(root, '.git', ref))).trim() || ref
}

export async function analyzePokeRogueTarget(targetDir, project = null) {
  const targetRoot = await realpath(path.resolve(targetDir)).catch(error => {
    throw targetError(`Could not open target checkout: ${error.message}`, error.code === 'ENOENT' ? 404 : 400)
  })
  if (!(await stat(targetRoot)).isDirectory()) throw targetError('Target path must be a directory.')
  const { files, directories } = await walk(targetRoot)
  const packageFile = choose(files, targetRoot, [/^package\.json$/, /\/package\.json$/])
  const packageJson = packageFile ? JSON.parse(await readFile(packageFile, 'utf8')).catch(() => ({})) : {}
  const speciesId = choose(files, targetRoot, [/(^|\/)src\/enums\/species-id\.tsx?$/, /species[-_]id\.tsx?$/, /species.*enum.*\.tsx?$/])
  const generation = choose(files, targetRoot, [/(^|\/)src\/data\/balance\/species\/generation-0?1\.ts$/, /generation-\d+\.ts$/, /species.*data.*\.ts$/])
  if (!speciesId || !generation) throw targetError('This folder does not contain a recognizable PokéRogue species enum and species registry.')
  const eggMoves = choose(files, targetRoot, [/egg-moves\.ts$/, /egg.*move.*\.ts$/])
  const encounterFiles = files.filter(file => /(?:biome|encounter|wild|starter|trainer|boss|reward|mystery)/i.test(normalized(path.relative(targetRoot, file))) && /\.tsx?$/.test(file))
  const pokemonImages = directories.find(directory => /(?:^|[\\/])(?:assets|public)[\\/]images[\\/]pokemon$/i.test(directory)) || null
  const pokemonIcons = directories.find(directory => /(?:^|[\\/])(?:assets|public)[\\/]images[\\/]pokemon[\\/](?:icons|icon)$/i.test(directory)) || null
  const cryDir = directories.find(directory => /(?:^|[\\/])(?:assets|public)[\\/]audio[\\/](?:cry|cries)$/i.test(directory)) || null
  const speciesSource = await readFile(speciesId, 'utf8')
  const registry = parseSpeciesIds(speciesSource)
  const highestId = Math.max(1025, ...registry.ids)
  const stageAllocations = {}
  let candidate = highestId + 1
  for (const stage of project?.stages || []) {
    while (registry.ids.has(candidate)) candidate += 1
    stageAllocations[stage.stageId] = candidate
    candidate += 1
  }
  const revision = await resolveGitRevision(targetRoot)
  const packageVersion = String(packageJson.version || '')
  const relativeLayout = {
    speciesId: normalized(path.relative(targetRoot, speciesId)),
    generation: normalized(path.relative(targetRoot, generation)),
    eggMoves: eggMoves ? normalized(path.relative(targetRoot, eggMoves)) : null,
    pokemonImages: pokemonImages ? normalized(path.relative(targetRoot, pokemonImages)) : null,
    pokemonIcons: pokemonIcons ? normalized(path.relative(targetRoot, pokemonIcons)) : null,
    cryDir: cryDir ? normalized(path.relative(targetRoot, cryDir)) : null,
    encounterFiles: encounterFiles.map(file => normalized(path.relative(targetRoot, file))).slice(0, 200),
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ packageVersion, revision, relativeLayout })).digest('hex')
  const modern = relativeLayout.speciesId === 'src/enums/species-id.ts' && relativeLayout.generation.includes('src/data/balance/species/')
  const warnings = []
  if (!eggMoves) warnings.push('Egg move registry was not detected; egg moves will be skipped.')
  if (!pokemonImages) warnings.push('Pokémon image directory was not detected; sprite delivery requires manual target support.')
  if (!cryDir) warnings.push('Cry directory was not detected; cry delivery will be skipped.')
  if (!encounterFiles.length) warnings.push('Encounter tables were not detected; placement and suppression will remain plan warnings.')
  const adapter = modern ? 'pokerogue-modern-source' : 'pokerogue-compatible-source'
  return {
    targetId: `target_${fingerprint.slice(0, 16)}`,
    targetDir: targetRoot,
    adapter,
    fingerprint,
    version: packageVersion || revision?.slice(0, 12) || 'unversioned checkout',
    revision,
    packageManager: files.some(file => path.basename(file) === 'pnpm-lock.yaml') ? 'pnpm' : files.some(file => path.basename(file) === 'yarn.lock') ? 'yarn' : 'npm',
    layout: relativeLayout,
    capabilities: {
      species: true,
      evolutions: true,
      moves: true,
      eggMoves: Boolean(eggMoves),
      encounters: encounterFiles.length > 0,
      sprites: Boolean(pokemonImages),
      icons: Boolean(pokemonIcons || pokemonImages),
      cries: Boolean(cryDir),
      rollback: true,
    },
    stageAllocations,
    warnings,
    summary: `Detected ${adapter} with ${registry.ids.size} registered species and ${encounterFiles.length} encounter-related source files.`,
  }
}
