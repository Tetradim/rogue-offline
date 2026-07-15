import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_ENTRIES = 20000
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.pokerogue-mod-studio',
  'dist',
  'build',
  'coverage',
])
const SOURCE_EXTENSION = /\.(?:ts|tsx)$/i
const OWNER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/
const CATALOG_NAMES = [
  'PokemonType',
  'AbilityId',
  'GrowthRate',
  'MoveId',
  'EvolutionItem',
  'FormChangeItem',
  'TimeOfDay',
  'BiomeId',
]

function targetError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function normalized(relativePath) {
  return relativePath.replaceAll('\\', '/')
}

function hashData(value) {
  return createHash('sha256').update(value).digest('hex')
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) return null
  const candidate = path.resolve(root, relativePath)
  return isInside(root, candidate) && candidate !== root ? candidate : null
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function walk(root) {
  const files = []
  const directories = []
  const pending = [root]
  while (pending.length) {
    const directory = pending.pop()
    directories.push(directory)
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (files.length + directories.length > MAX_ENTRIES) {
        throw targetError('Target checkout is too large to inspect safely.')
      }
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) pending.push(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  return { files, directories }
}

function choose(files, root, patterns) {
  const candidates = files.map(file => ({
    file,
    relative: normalized(path.relative(root, file)).toLowerCase(),
  }))
  for (const pattern of patterns) {
    const found = candidates.find(candidate => pattern.test(candidate.relative))
    if (found) return found.file
  }
  return null
}

async function readOptional(file) {
  if (!file) return ''
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

async function readPackageJson(file) {
  if (!file) return {}
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return {}
  }
}

function parseSpeciesIds(source) {
  const ids = new Set()
  const names = new Set()
  for (const match of source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?/gm)) {
    names.add(match[1])
    ids.add(Number(match[2]))
  }
  return { ids, names }
}

function parseEnumMembers(source, enumName) {
  const escaped = enumName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:export\\s+)?(?:const\\s+)?enum\\s+${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  if (!match) return null
  const body = match[1].replace(/\/\/.*$/gm, '')
  const members = new Set()
  for (const fragment of body.split(',')) {
    const member = fragment.trim().match(/^([A-Z][A-Z0-9_]*)\b/)
    if (member) members.add(member[1])
  }
  return members
}

async function buildCatalogs(files, root) {
  const sourceFiles = files.filter(file => SOURCE_EXTENSION.test(file))
  const catalogs = Object.fromEntries(CATALOG_NAMES.map(name => [name, null]))
  const enumFiles = {}
  for (const file of sourceFiles) {
    if (Object.values(catalogs).every(Boolean)) break
    const relative = normalized(path.relative(root, file))
    const source = await readOptional(file)
    for (const name of CATALOG_NAMES) {
      if (catalogs[name]) continue
      const members = parseEnumMembers(source, name)
      if (members?.size) {
        catalogs[name] = members
        enumFiles[name] = relative
      }
    }
  }
  return { catalogs, enumFiles }
}

function classifyRegistry(speciesSource, generationSource) {
  if (!/\benum\s+SpeciesId\b/.test(speciesSource)) {
    throw targetError('The detected species ID file does not contain a recognizable SpeciesId enum.')
  }
  const modern = (
    /\bSpeciesDataMapConfig\b/.test(generationSource)
    && /\bnew\s+PokemonSpecies\s*\(/.test(generationSource)
    && /\bgenerationOneSpeciesData\b/.test(generationSource)
  )
  if (!modern) {
    throw targetError(
      'Only the verified modern SpeciesDataMapConfig/PokemonSpecies registry is supported. Legacy or unfamiliar registries are refused.',
    )
  }
  return 'modern'
}

function detectEncounterAdapters(files, root, sources) {
  const adapters = []
  for (const file of files) {
    const relative = normalized(path.relative(root, file))
    if (!SOURCE_EXTENSION.test(file) || !/(?:biome|encounter|wild)/i.test(relative)) continue
    const source = sources.get(file) || ''
    const biomes = new Set()
    for (const match of source.matchAll(/\[(?:BiomeId|Biome)\.([A-Z][A-Z0-9_]*)\]\s*:\s*\[/g)) {
      biomes.add(match[1])
    }
    if (biomes.size) {
      adapters.push({
        file: relative,
        kind: 'simple-species-array',
        biomes: [...biomes].sort(),
      })
    }
  }
  return adapters
}

function symbolIssue(pathName, catalog, value) {
  return {
    severity: 'error',
    path: pathName,
    code: 'unknown-target-symbol',
    message: `${value} does not exist in the selected checkout's ${catalog} enum.`,
  }
}

function validateProjectSymbols(project, catalogs) {
  const issues = []
  function check(pathName, catalogName, value, optional = false) {
    if (optional && !value) return
    const catalog = catalogs[catalogName]
    if (!catalog?.has(value)) issues.push(symbolIssue(pathName, catalogName, value || '(blank)'))
  }
  for (const stage of project?.stages || []) {
    const stagePath = `stages.${stage.stageId}`
    for (const [index, type] of (stage.types || []).entries()) {
      check(`${stagePath}.types.${index}`, 'PokemonType', type)
    }
    for (const [index, ability] of (stage.abilities || []).entries()) {
      check(`${stagePath}.abilities.${index}`, 'AbilityId', ability)
    }
    check(`${stagePath}.passive`, 'AbilityId', stage.passive, true)
    check(`${stagePath}.growthRate`, 'GrowthRate', stage.growthRate)
    for (const [index, move] of (stage.moves?.levelUp || []).entries()) {
      check(`${stagePath}.moves.levelUp.${index}.moveId`, 'MoveId', move.moveId)
    }
    for (const list of ['tm', 'egg']) {
      for (const [index, move] of (stage.moves?.[list] || []).entries()) {
        check(`${stagePath}.moves.${list}.${index}`, 'MoveId', move)
      }
    }
    for (const [formIndex, form] of (stage.forms || []).entries()) {
      const formPath = `${stagePath}.forms.${formIndex}`
      for (const [index, type] of (form.types || []).entries()) {
        check(`${formPath}.types.${index}`, 'PokemonType', type)
      }
      for (const [index, ability] of (form.abilities || []).entries()) {
        check(`${formPath}.abilities.${index}`, 'AbilityId', ability)
      }
      check(`${formPath}.passive`, 'AbilityId', form.passive, true)
      check(`${formPath}.changeItem`, 'FormChangeItem', form.changeItem, true)
    }
  }
  for (const [index, edge] of (project?.evolutionEdges || []).entries()) {
    const pathName = `evolutionEdges.${index}.trigger`
    if (edge.trigger?.type === 'item') check(`${pathName}.item`, 'EvolutionItem', edge.trigger.item)
    if (edge.trigger?.type === 'time') check(`${pathName}.time`, 'TimeOfDay', edge.trigger.time)
    if (edge.trigger?.type === 'move') check(`${pathName}.move`, 'MoveId', edge.trigger.move)
  }
  for (const [index, placement] of (project?.encounterPolicy?.placements || []).entries()) {
    check(`encounterPolicy.placements.${index}.biome`, 'BiomeId', placement.biome)
  }
  return issues
}

function parseStatusPaths(output) {
  const paths = []
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    const value = line.slice(3).trim()
    const target = value.includes(' -> ') ? value.split(' -> ').at(-1) : value
    if (target) paths.push(normalized(target.replace(/^"|"$/g, '')))
  }
  return paths
}

async function readGitState(root) {
  try {
    const [{ stdout: revision }, { stdout: statusOutput }] = await Promise.all([
      execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        windowsHide: true,
      }),
      execFileAsync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    ])
    return {
      available: true,
      revision: revision.trim(),
      clean: !statusOutput.trim(),
      changedPaths: parseStatusPaths(statusOutput),
    }
  } catch {
    return {
      available: false,
      revision: null,
      clean: false,
      changedPaths: [],
    }
  }
}

async function readOwnedInstallation(targetRoot, project, git) {
  const owner = project?.slug
  if (!OWNER_PATTERN.test(String(owner || ''))) return null
  const file = path.join(
    targetRoot,
    '.pokerogue-mod-studio',
    'mods',
    owner,
    'journal.json',
  )
  if (!await exists(file)) return null

  try {
    const journal = JSON.parse(await readFile(file, 'utf8'))
    if (
      journal?.owner !== owner
      || journal.state !== 'committed'
      || !Array.isArray(journal.files)
      || !Array.isArray(journal.copies)
    ) {
      return { valid: false, reason: 'The installed Mod Studio journal is malformed.' }
    }

    const ownedPaths = new Set()
    const backups = new Map()
    for (const item of [...journal.files, ...journal.copies]) {
      const target = resolveInside(targetRoot, item.path)
      if (!target || !await exists(target)) {
        return { valid: false, reason: `Installed target is missing or unsafe: ${item.path}` }
      }
      const current = await readFile(target)
      if (!item.afterHash || hashData(current) !== item.afterHash) {
        return { valid: false, reason: `Installed target changed after delivery: ${item.path}` }
      }
      const relative = normalized(path.relative(targetRoot, target))
      ownedPaths.add(relative)
      if (item.backup) {
        const backup = resolveInside(targetRoot, item.backup)
        if (!backup || !await exists(backup)) {
          return { valid: false, reason: `Installed backup is missing or unsafe: ${item.backup}` }
        }
        const backupData = await readFile(backup)
        if (item.beforeHash && hashData(backupData) !== item.beforeHash) {
          return { valid: false, reason: `Installed backup hash changed: ${item.backup}` }
        }
        backups.set(relative, backupData)
      }
    }

    const unrelated = git.changedPaths.filter(changed => !ownedPaths.has(changed))
    if (unrelated.length) {
      return {
        valid: false,
        reason: `The checkout also has unrelated tracked changes: ${unrelated.join(', ')}`,
      }
    }
    return {
      valid: true,
      owner,
      journal,
      ownedPaths,
      backups,
    }
  } catch (error) {
    return {
      valid: false,
      reason: `Could not validate the installed Mod Studio journal: ${error.message}`,
    }
  }
}

function selectBuildScript(packageJson) {
  const scripts = packageJson.scripts || {}
  if (typeof scripts.typecheck === 'string') return 'typecheck'
  if (typeof scripts.build === 'string') return 'build'
  return null
}

function allocateStages(project, registry, storedBinding) {
  const allocations = {}
  const used = new Set(registry.ids)
  let candidate = Math.max(1025, ...registry.ids) + 1
  for (const stage of project?.stages || []) {
    const stored = Number(storedBinding?.stageAllocations?.[stage.stageId])
    if (Number.isInteger(stored) && stored > 1025 && !used.has(stored)) {
      allocations[stage.stageId] = stored
      used.add(stored)
      continue
    }
    while (used.has(candidate)) candidate += 1
    allocations[stage.stageId] = candidate
    used.add(candidate)
    candidate += 1
  }
  return allocations
}

export async function analyzePokeRogueTarget(targetDir, project = null) {
  const targetRoot = await realpath(path.resolve(targetDir)).catch(error => {
    throw targetError(
      `Could not open target checkout: ${error.message}`,
      error.code === 'ENOENT' ? 404 : 400,
    )
  })
  if (!(await stat(targetRoot)).isDirectory()) {
    throw targetError('Target path must be a directory.')
  }

  const { files, directories } = await walk(targetRoot)
  const packageFile = choose(files, targetRoot, [/^package\.json$/])
  const packageJson = await readPackageJson(packageFile)
  const speciesId = choose(files, targetRoot, [
    /(^|\/)src\/enums\/species-id\.tsx?$/,
    /species[-_]id\.tsx?$/,
  ])
  const generation = choose(files, targetRoot, [
    /(^|\/)src\/data\/balance\/species\/generation-0?1\.ts$/,
    /generation-0?1\.ts$/,
  ])
  if (!speciesId || !generation) {
    throw targetError(
      'This folder does not contain the verified PokéRogue species enum and generation-one registry paths.',
    )
  }

  const sourceFiles = files.filter(file => SOURCE_EXTENSION.test(file))
  const sources = new Map()
  await Promise.all(sourceFiles.map(async file => {
    sources.set(file, await readOptional(file))
  }))
  const speciesSource = sources.get(speciesId) || ''
  const generationSource = sources.get(generation) || ''
  classifyRegistry(speciesSource, generationSource)

  const git = await readGitState(targetRoot)
  const ownedInstallation = await readOwnedInstallation(targetRoot, project, git)
  const deliveryClean = Boolean(git.clean || ownedInstallation?.valid)
  const baselineSource = file => {
    const relative = normalized(path.relative(targetRoot, file))
    const backup = ownedInstallation?.backups?.get(relative)
    return backup ? backup.toString('utf8') : sources.get(file) || ''
  }

  const registry = parseSpeciesIds(baselineSource(speciesId))
  const { catalogs, enumFiles } = await buildCatalogs(sourceFiles, targetRoot)
  const requiredCatalogs = ['PokemonType', 'AbilityId', 'GrowthRate', 'MoveId']
  const missingRequired = requiredCatalogs.filter(name => !catalogs[name]?.size)
  if (missingRequired.length) {
    throw targetError(`The checkout is missing required enum catalogs: ${missingRequired.join(', ')}.`)
  }

  const eggMoves = choose(files, targetRoot, [
    /(^|\/)src\/data\/balance\/moves\/egg-moves\.ts$/,
    /egg[-_]moves\.ts$/,
  ])
  const encounterAdapters = detectEncounterAdapters(sourceFiles, targetRoot, sources)
  const pokemonImages = directories.find(directory => (
    /(?:^|[\\/])(?:assets|public)[\\/]images[\\/]pokemon$/i.test(directory)
  )) || null
  const pokemonIcons = directories.find(directory => (
    /(?:^|[\\/])(?:assets|public)[\\/]images[\\/]pokemon[\\/](?:icons|icon)$/i.test(directory)
  )) || null
  const cryDir = directories.find(directory => (
    /(?:^|[\\/])(?:assets|public)[\\/]audio[\\/](?:cry|cries)$/i.test(directory)
  )) || null
  const packageManager = files.some(file => path.basename(file) === 'pnpm-lock.yaml')
    ? 'pnpm'
    : files.some(file => path.basename(file) === 'yarn.lock')
      ? 'yarn'
      : 'npm'
  const buildScript = selectBuildScript(packageJson)
  const hasNodeModules = await exists(path.join(targetRoot, 'node_modules'))

  const relativeLayout = {
    registryKind: 'modern',
    speciesId: normalized(path.relative(targetRoot, speciesId)),
    generation: normalized(path.relative(targetRoot, generation)),
    eggMoves: eggMoves ? normalized(path.relative(targetRoot, eggMoves)) : null,
    packageFile: packageFile ? normalized(path.relative(targetRoot, packageFile)) : null,
    enumFiles,
    pokemonImages: pokemonImages
      ? normalized(path.relative(targetRoot, pokemonImages))
      : null,
    pokemonIcons: pokemonIcons
      ? normalized(path.relative(targetRoot, pokemonIcons))
      : null,
    cryDir: cryDir ? normalized(path.relative(targetRoot, cryDir)) : null,
    encounterAdapters,
  }
  const fingerprintFiles = [
    speciesId,
    generation,
    eggMoves,
    ...encounterAdapters.map(adapter => path.join(targetRoot, adapter.file)),
  ].filter(Boolean)
  const sourceHashes = Object.fromEntries(fingerprintFiles.map(file => [
    normalized(path.relative(targetRoot, file)),
    hashData(Buffer.from(baselineSource(file))),
  ]))
  const packageVersion = String(packageJson.version || '')
  const fingerprint = hashData(JSON.stringify({
    packageVersion,
    revision: git.revision,
    relativeLayout,
    sourceHashes,
  }))
  const storedBinding = (project?.targetBindings || []).find(binding => (
    path.resolve(binding.targetDir || '') === targetRoot
  ))
  const stageAllocations = allocateStages(project, registry, storedBinding)

  const forms = (
    /\bPokemonForm\b/.test(generationSource)
    && /\bnew\s+PokemonForm\s*\(/.test(generationSource)
  )
  const formChanges = (
    forms
    && /\bSpeciesFormChange\b/.test(generationSource)
    && /\bSpeciesFormChangeItemTrigger\b/.test(generationSource)
    && Boolean(catalogs.FormChangeItem?.size)
  )
  const advancedEvolutionTriggers = (
    /\bEvoCondKey\b/.test(generationSource)
    && Boolean(catalogs.TimeOfDay?.size)
    && Boolean(catalogs.MoveId?.size)
  )
  const validationIssues = validateProjectSymbols(project, catalogs)
  if (!git.available) {
    validationIssues.push({
      severity: 'error',
      path: 'targetBindings',
      code: 'target-not-git',
      message: 'Transactional delivery requires a Git checkout so preflight can build an isolated worktree.',
    })
  } else if (!deliveryClean) {
    validationIssues.push({
      severity: 'error',
      path: 'targetBindings',
      code: 'dirty-target',
      message: ownedInstallation?.reason
        || 'Commit or stash target source changes before delivery.',
    })
  }
  if (!buildScript) {
    validationIssues.push({
      severity: 'error',
      path: 'targetBindings',
      code: 'missing-target-build',
      message: 'The checkout has no typecheck or build script for isolated preflight verification.',
    })
  }
  if (!hasNodeModules) {
    validationIssues.push({
      severity: 'error',
      path: 'targetBindings',
      code: 'missing-target-dependencies',
      message: 'Install the target checkout dependencies before delivery so isolated preflight can compile it.',
    })
  }

  const capabilities = {
    species: true,
    evolutions: true,
    moves: true,
    eggMoves: Boolean(eggMoves),
    encounters: encounterAdapters.length > 0,
    sprites: Boolean(pokemonImages),
    icons: Boolean(pokemonIcons),
    cries: Boolean(cryDir),
    forms,
    formChanges,
    advancedEvolutionTriggers,
    rollback: true,
    packages: true,
    isolatedBuild: git.available
      && deliveryClean
      && Boolean(buildScript)
      && hasNodeModules,
  }
  const warnings = []
  if (!eggMoves) {
    warnings.push(
      'Egg move registry was not detected; egg moves cannot be delivered to this checkout.',
    )
  }
  if (!pokemonImages) {
    warnings.push(
      'Pokémon image directory was not detected; uploaded sprites cannot be delivered automatically.',
    )
  }
  if (!pokemonIcons) {
    warnings.push(
      'Pokémon icon directory was not detected; uploaded icons cannot be delivered automatically.',
    )
  }
  if (!cryDir) {
    warnings.push(
      'Cry directory was not detected; uploaded cries cannot be delivered automatically.',
    )
  }
  if (!encounterAdapters.length) {
    warnings.push(
      'No supported simple biome species arrays were detected; encounter placement and suppression are unavailable.',
    )
  }

  return {
    targetId: `target_${fingerprint.slice(0, 16)}`,
    targetDir: targetRoot,
    adapter: 'pokerogue-modern-source',
    fingerprint,
    version: packageVersion || git.revision?.slice(0, 12) || 'unversioned checkout',
    revision: git.revision,
    git: {
      ...git,
      deliveryClean,
      ownedInstall: Boolean(ownedInstallation?.valid),
    },
    packageManager,
    buildScript,
    layout: relativeLayout,
    capabilities,
    catalogCounts: Object.fromEntries(Object.entries(catalogs).map(([name, values]) => [
      name,
      values?.size || 0,
    ])),
    validationIssues,
    stageAllocations,
    warnings,
    summary: `Detected the verified modern adapter with ${registry.ids.size} registered species, ${encounterAdapters.length} supported encounter file${encounterAdapters.length === 1 ? '' : 's'}, and ${validationIssues.length} blocking target issue${validationIssues.length === 1 ? '' : 's'}.`,
  }
}
