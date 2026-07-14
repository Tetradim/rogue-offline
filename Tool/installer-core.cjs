'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const childProcess = require('node:child_process')

const OFFICIAL_DEX_MAX = 1025
const STATE_DIR = '.pokerogue-mod-studio'
const JOURNAL_VERSION = 2
const TOKEN_PATTERN = /^[A-Z][A-Z0-9_]*$/
const OWNER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/
const MAX_EGG_MOVES = 4
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  STATE_DIR,
  'dist',
  'build',
  'coverage',
])

function parseArgs(argv) {
  const options = { dryRun: false, force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--manifest') options.manifest = argv[++index]
    else if (argument === '--project') options.project = argv[++index]
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--force') options.force = true
    else if (argument === '--uninstall') options.uninstall = argv[++index]
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function die(message) {
  throw new Error(message)
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function readText(file) {
  if (!fs.existsSync(file)) die(`Required file not found: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

function readJson(file) {
  try {
    return JSON.parse(readText(file))
  } catch (error) {
    die(`Invalid JSON in ${file}: ${error.message}`)
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, file)
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function enumName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeOwner(value) {
  const owner = enumName(value).toLowerCase()
  if (!OWNER_PATTERN.test(owner)) {
    die('Mod ID must normalize to 1-80 lowercase letters, numbers, underscores, or hyphens.')
  }
  return owner
}

function quote(value) {
  return JSON.stringify(String(value ?? ''))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function safeRelative(value, label = 'journal path') {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) {
    die(`Invalid ${label}.`)
  }
  const normalized = path.normalize(value)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    die(`Invalid ${label}: path escapes the checkout.`)
  }
  return normalized
}

function resolveInside(root, relative, label) {
  const candidate = path.resolve(root, safeRelative(relative, label))
  if (!isInside(root, candidate) || candidate === root) {
    die(`Invalid ${label}: path escapes the checkout.`)
  }
  return candidate
}

function relativeTo(root, file) {
  if (!isInside(root, file) || file === root) {
    die(`Operation path escapes checkout: ${file}`)
  }
  return path.relative(root, file).replaceAll('\\', '/')
}

function canonicalRoot(project) {
  const resolved = fs.realpathSync(path.resolve(project))
  if (!fs.statSync(resolved).isDirectory()) die('Project path must be a directory.')
  return resolved
}

function walk(directory, predicate, output = []) {
  if (!fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full, predicate, output)
    else if (entry.isFile() && (!predicate || predicate(full))) output.push(full)
  }
  return output
}

function findFirst(project, candidates) {
  for (const candidate of candidates) {
    const full = path.join(project, candidate)
    if (fs.existsSync(full)) return full
  }
  return null
}

function findByName(project, pattern) {
  return walk(project, file => pattern.test(file.replaceAll('\\', '/')))[0] || null
}

function parseEnumMembers(source, name) {
  const match = source.match(new RegExp(
    `(?:export\\s+)?(?:const\\s+)?enum\\s+${escapeRegExp(name)}\\s*\\{([\\s\\S]*?)\\}`,
  ))
  if (!match) return null
  const body = match[1].replace(/\/\/.*$/gm, '')
  const members = new Set()
  for (const fragment of body.split(',')) {
    const member = fragment.trim().match(/^([A-Z][A-Z0-9_]*)\b/)
    if (member) members.add(member[1])
  }
  return members
}

function findEnumCatalog(project, name) {
  for (const file of walk(
    path.join(project, 'src'),
    candidate => /\.(?:ts|tsx)$/i.test(candidate),
  )) {
    const members = parseEnumMembers(readText(file), name)
    if (members?.size) return { file, members }
  }
  return null
}

function gitRevision(project) {
  try {
    return childProcess.execFileSync(
      'git',
      ['-C', project, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return null
  }
}

function detectSimpleEncounterFiles(project) {
  const files = []
  for (const file of walk(
    path.join(project, 'src'),
    candidate => (
      /\.(?:ts|tsx)$/i.test(candidate)
      && /(?:biome|encounter|wild)/i.test(candidate)
    ),
  )) {
    const source = readText(file)
    if (/\[(?:BiomeId|Biome)\.[A-Z][A-Z0-9_]*\]\s*:\s*\[/.test(source)) {
      files.push(file)
    }
  }
  return files
}

function detectLayout(project) {
  const speciesId = findFirst(project, [
    'src/enums/species-id.ts',
    'src/enums/species-id.tsx',
  ]) || findByName(project, /species[-_]id\.tsx?$/i)
  const generation = findFirst(project, [
    'src/data/balance/species/generation-01.ts',
    'src/data/balance/species/generation-1.ts',
  ]) || findByName(project, /generation-0?1\.ts$/i)
  if (!speciesId || !generation) {
    die('This does not contain the verified PokéRogue species enum and generation-one registry paths.')
  }

  const speciesSource = readText(speciesId)
  const generationSource = readText(generation)
  if (!/\benum\s+SpeciesId\b/.test(speciesSource)) {
    die('The species ID file has no recognized SpeciesId enum.')
  }
  if (
    !/\bSpeciesDataMapConfig\b/.test(generationSource)
    || !/\bnew\s+PokemonSpecies\s*\(/.test(generationSource)
    || !/\bgenerationOneSpeciesData\b/.test(generationSource)
  ) {
    die('Only the verified modern SpeciesDataMapConfig/PokemonSpecies registry is supported.')
  }
  for (const name of [
    'PokemonSpecies',
    'PokemonType',
    'AbilityId',
    'GrowthRate',
    'SpeciesEvolution',
    'MoveId',
  ]) {
    if (!new RegExp(`\\b${name}\\b`).test(generationSource)) {
      die(`The modern species registry is missing required ${name} anchors.`)
    }
  }

  const catalogs = {}
  for (const name of [
    'PokemonType',
    'AbilityId',
    'GrowthRate',
    'MoveId',
    'EvolutionItem',
    'FormChangeItem',
    'TimeOfDay',
    'BiomeId',
  ]) {
    catalogs[name] = findEnumCatalog(project, name)?.members || new Set()
  }
  for (const name of ['PokemonType', 'AbilityId', 'GrowthRate', 'MoveId']) {
    if (!catalogs[name].size) {
      die(`The target checkout has no readable ${name} enum catalog.`)
    }
  }

  const encounterFiles = detectSimpleEncounterFiles(project)
  const pokemonImages = findFirst(project, [
    'assets/images/pokemon',
    'public/images/pokemon',
  ])
  return {
    project,
    speciesId,
    generation,
    generationSource,
    eggMoves: findFirst(project, [
      'src/data/balance/moves/egg-moves.ts',
    ]) || findByName(project, /egg[-_]moves\.ts$/i),
    encounterFiles,
    forms: (
      /\bPokemonForm\b/.test(generationSource)
      && /\bnew\s+PokemonForm\s*\(/.test(generationSource)
    ),
    formChanges: (
      /\bSpeciesFormChange\b/.test(generationSource)
      && /\bSpeciesFormChangeItemTrigger\b/.test(generationSource)
      && catalogs.FormChangeItem.size > 0
    ),
    advancedEvolutionTriggers: (
      /\bEvoCondKey\b/.test(generationSource)
      && catalogs.TimeOfDay.size > 0
      && catalogs.MoveId.size > 0
    ),
    eggTier: /\bEggTier\b/.test(generationSource),
    pokemonImages,
    pokemonIcons: findFirst(project, [
      'assets/images/pokemon/icons',
      'public/images/pokemon/icons',
    ]),
    cryDir: findFirst(project, [
      'assets/audio/cry',
      'assets/audio/cries',
      'public/audio/cry',
      'public/audio/cries',
    ]),
    catalogs,
    revision: gitRevision(project),
  }
}

function parseSpeciesEnum(source) {
  const byId = new Map()
  const byName = new Map()
  for (const match of source.matchAll(
    /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?/gm,
  )) {
    const id = Number(match[2])
    byId.set(id, match[1])
    byName.set(match[1], id)
  }
  return { byId, byName }
}

function requireCatalog(layout, name, value, label, optional = false) {
  if (optional && !value) return
  if (
    !TOKEN_PATTERN.test(String(value || ''))
    || !layout.catalogs[name]?.has(value)
  ) {
    die(`${label}: ${value || '(blank)'} does not exist in the target ${name} enum.`)
  }
}

function validateManifest(manifest, registry, layout) {
  if (
    manifest.format !== 'pokerogue-mod-studio'
    || Number(manifest.schemaVersion) !== 3
  ) {
    die('Unsupported manifest. Export a current Mod Studio project.')
  }
  if (
    manifest.target?.adapter
    && manifest.target.adapter !== 'pokerogue-modern-source'
  ) {
    die('Manifest targets an unsupported adapter.')
  }
  if (
    manifest.target?.expectedRevision
    && layout.revision
    && manifest.target.expectedRevision !== layout.revision
  ) {
    die('The target checkout revision changed after binding. Re-analyze it before delivery.')
  }

  const custom = Array.isArray(manifest.customSpecies)
    ? manifest.customSpecies
    : []
  if (!custom.length) die('Manifest contains no custom species.')
  const seenIds = new Set()
  const seenNames = new Set()
  const customNames = new Set(custom.map(species => (
    species.enumName || enumName(species.speciesId)
  )))

  for (const species of custom) {
    const id = Number(species.speciesNumber)
    const name = species.enumName || enumName(species.speciesId)
    if (!Number.isInteger(id) || id <= OFFICIAL_DEX_MAX) {
      die(`${species.name}: custom ID must be greater than ${OFFICIAL_DEX_MAX}.`)
    }
    if (!TOKEN_PATTERN.test(name)) die(`${species.name}: enum name is invalid.`)
    if (seenIds.has(id)) die(`Manifest custom ID #${id} is duplicated.`)
    if (seenNames.has(name)) die(`Manifest enum name ${name} is duplicated.`)
    if (registry.byId.has(id)) {
      die(`#${id} is already occupied by ${registry.byId.get(id)} in the target checkout.`)
    }
    if (registry.byName.has(name)) {
      die(`${name} already exists at #${registry.byName.get(name)} in the target checkout.`)
    }
    seenIds.add(id)
    seenNames.add(name)

    requireCatalog(
      layout,
      'PokemonType',
      species.primaryType || 'NORMAL',
      `${species.name} primary type`,
    )
    requireCatalog(
      layout,
      'PokemonType',
      species.secondaryType,
      `${species.name} secondary type`,
      true,
    )
    requireCatalog(layout, 'AbilityId', species.ability1, `${species.name} primary ability`, true)
    requireCatalog(layout, 'AbilityId', species.ability2, `${species.name} secondary ability`, true)
    requireCatalog(layout, 'AbilityId', species.hiddenAbility, `${species.name} hidden ability`, true)
    requireCatalog(layout, 'AbilityId', species.passiveAbility, `${species.name} passive`, true)
    requireCatalog(
      layout,
      'GrowthRate',
      species.growthRate || 'MEDIUM_FAST',
      `${species.name} growth rate`,
    )

    for (const [index, move] of (species.levelUpMoves || []).entries()) {
      requireCatalog(
        layout,
        'MoveId',
        move?.[1],
        `${species.name} level move ${index + 1}`,
      )
    }
    for (const move of species.tmMoves || []) {
      requireCatalog(layout, 'MoveId', move, `${species.name} TM move`)
    }
    if ((species.eggMoves || []).length > MAX_EGG_MOVES) {
      die(`${species.name}: egg moves are limited to ${MAX_EGG_MOVES}.`)
    }
    for (const move of species.eggMoves || []) {
      requireCatalog(layout, 'MoveId', move, `${species.name} egg move`)
    }

    if (species.forms?.length && !layout.forms) {
      die(`${species.name}: the selected checkout has no supported PokemonForm registry anchors.`)
    }
    for (const form of species.forms || []) {
      for (const type of form.types || []) {
        requireCatalog(layout, 'PokemonType', type, `${species.name}/${form.name} type`)
      }
      for (const ability of form.abilities || []) {
        requireCatalog(layout, 'AbilityId', ability, `${species.name}/${form.name} ability`)
      }
      requireCatalog(
        layout,
        'AbilityId',
        form.passive,
        `${species.name}/${form.name} passive`,
        true,
      )
      if (form.changeItem) {
        if (!layout.formChanges) {
          die(`${species.name}: form-change items are not supported by the selected checkout.`)
        }
        requireCatalog(
          layout,
          'FormChangeItem',
          form.changeItem,
          `${species.name}/${form.name} change item`,
        )
      }
    }

    for (const evolution of species.evolutions || []) {
      const target = enumName(evolution.speciesId)
      if (!customNames.has(target)) {
        die(`${species.name}: evolution target ${target} is not a custom species in this manifest.`)
      }
      const type = evolution.trigger?.type || (evolution.item ? 'item' : 'level')
      if (type === 'custom') {
        die(`${species.name}: custom prose evolution requirements cannot be installed automatically.`)
      }
      if (!['level', 'item', 'friendship', 'time', 'move'].includes(type)) {
        die(`${species.name}: unsupported evolution trigger ${type}.`)
      }
      if (
        ['friendship', 'time', 'move'].includes(type)
        && !layout.advancedEvolutionTriggers
      ) {
        die(`${species.name}: evolution trigger ${type} is not supported by this checkout.`)
      }
      if (type === 'item') {
        requireCatalog(
          layout,
          'EvolutionItem',
          evolution.trigger?.item || evolution.item,
          `${species.name} evolution item`,
        )
      }
      if (type === 'time') {
        requireCatalog(
          layout,
          'TimeOfDay',
          evolution.trigger?.time,
          `${species.name} evolution time`,
        )
      }
      if (type === 'move') {
        requireCatalog(
          layout,
          'MoveId',
          evolution.trigger?.move,
          `${species.name} evolution move`,
        )
      }
    }
    for (const placement of species.encounterPlacements || []) {
      requireCatalog(
        layout,
        'BiomeId',
        placement.biome,
        `${species.name} biome`,
      )
    }
  }

  for (const override of manifest.availabilityOverrides || []) {
    if (!['suppress', 'replace'].includes(override.mode)) {
      die(`${override.name || override.speciesId}: invalid official override mode.`)
    }
    if (
      override.mode === 'replace'
      && !seenIds.has(Number(override.replacementSpeciesNumber))
    ) {
      die(`${override.name || override.speciesId}: replacement species is missing from this manifest.`)
    }
  }
}

function replaceOwnedBlock(source, owner, section, body, anchor) {
  const begin = `// MOD-STUDIO BEGIN ${owner}:${section}`
  const end = `// MOD-STUDIO END ${owner}:${section}`
  source = source.replace(
    new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, 'g'),
    '',
  )
  const index = anchor(source)
  if (index < 0) die(`Could not find insertion anchor for ${section}.`)
  return `${source.slice(0, index)}${begin}\n${body.trimEnd()}\n${end}\n${source.slice(index)}`
}

function speciesEnumBody(custom) {
  return custom.map(species => (
    `  ${species.enumName || enumName(species.speciesId)} = ${Number(species.speciesNumber)},`
  )).join('\n')
}

function enumRef(type, value, fallback = 'NONE') {
  return `${type}.${value ? enumName(value) : fallback}`
}

function numberValue(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function baseTotal(stats = {}) {
  return [
    'hp',
    'attack',
    'defense',
    'specialAttack',
    'specialDefense',
    'speed',
  ].reduce((total, key) => total + numberValue(stats[key], 0), 0)
}

function statValue(stats, key, fallback = 1) {
  const parsed = Number(stats?.[key])
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback
}

function malePercent(species) {
  if (species.genderless || species.flags?.genderless) return 'null'
  return String(Math.max(0, Math.min(100, numberValue(species.genderRatio, 50))))
}

function modernFormBody(species, form, index) {
  const stats = { ...(species.baseStats || {}), ...(form.statOverrides || {}) }
  const types = form.types?.length
    ? form.types
    : [species.primaryType, species.secondaryType].filter(Boolean)
  const abilities = form.abilities?.length
    ? form.abilities
    : [species.ability1, species.ability2, species.hiddenAbility].filter(Boolean)
  return `new PokemonForm({
          formName: ${quote(form.name || `Form ${index + 1}`)},
          formKey: ${quote(form.key || `form-${index + 1}`)},
          type1: PokemonType.${enumName(types[0] || species.primaryType || 'NORMAL')},
          type2: ${types[1] ? `PokemonType.${enumName(types[1])}` : 'null'},
          height: ${numberValue(form.height, numberValue(species.height, 1))},
          weight: ${numberValue(form.weight, numberValue(species.weight, 1))},
          ability1: ${enumRef('AbilityId', abilities[0])},
          ability2: ${enumRef('AbilityId', abilities[1])},
          abilityHidden: ${enumRef('AbilityId', abilities[2])},
          baseTotal: ${baseTotal(stats)},
          baseHp: ${statValue(stats, 'hp')},
          baseAtk: ${statValue(stats, 'attack')},
          baseDef: ${statValue(stats, 'defense')},
          baseSpatk: ${statValue(stats, 'specialAttack')},
          baseSpdef: ${statValue(stats, 'specialDefense')},
          baseSpd: ${statValue(stats, 'speed')},
          catchRate: ${numberValue(species.captureRate, 45)},
          baseFriendship: ${numberValue(species.baseFriendship, 50)},
          baseExp: ${numberValue(species.baseExp, 64)},
          genderDiffs: false,
          formSpriteKey: ${form.assetVariant ? quote(form.assetVariant) : 'null'},
          isStarterSelectable: ${form.isStarterSelectable !== false},
        })`
}

function baseModernForm(species) {
  return {
    name: 'Normal',
    key: '',
    types: [species.primaryType, species.secondaryType].filter(Boolean),
    abilities: [
      species.ability1,
      species.ability2,
      species.hiddenAbility,
    ].filter(Boolean),
    passive: species.passiveAbility,
    statOverrides: {},
    assetVariant: '',
    isStarterSelectable: true,
  }
}

function evolutionBody(evolution) {
  const target = `SpeciesId.${enumName(evolution.speciesId)}`
  const trigger = evolution.trigger || {}
  const type = trigger.type || (evolution.item ? 'item' : 'level')
  if (type === 'item') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, item: EvolutionItem.${enumName(trigger.item || evolution.item)} })`
  }
  if (type === 'friendship') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.FRIENDSHIP, value: ${numberValue(trigger.friendship, 220)} } })`
  }
  if (type === 'time') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.TIME, time: [TimeOfDay.${enumName(trigger.time)}] } })`
  }
  if (type === 'move') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.MOVE, move: MoveId.${enumName(trigger.move)} } })`
  }
  return `new SpeciesEvolution({ speciesId: ${target}, level: ${numberValue(trigger.level || evolution.level, 1)} })`
}

function modernSpeciesRegistryBody(custom, layout) {
  return custom.map(species => {
    const E = species.enumName || enumName(species.speciesId)
    const stats = species.baseStats || {}
    const evolutions = (species.evolutions || []).map(evolutionBody)
    const levelMoves = (species.levelUpMoves || []).map(move => (
      `[${numberValue(move[0], 1)}, MoveId.${enumName(move[1])}]`
    ))
    const authoredForms = species.forms || []
    const allForms = authoredForms.length
      ? [baseModernForm(species), ...authoredForms]
      : []
    const formsSection = allForms.length
      ? `
      canChangeForm: true,
      forms: [
        ${allForms.map((form, index) => modernFormBody(species, form, index)).join(',\n        ')},
      ],`
      : ''
    const passives = allForms.length
      ? `{ ${allForms.map((form, index) => `${index}: ${enumRef('AbilityId', form.passive || species.passiveAbility)}`).join(', ')} }`
      : enumRef('AbilityId', species.passiveAbility)
    const formChanges = authoredForms
      .filter(form => form.changeItem)
      .map(form => `new SpeciesFormChange({
        speciesId: SpeciesId.${E},
        preFormKey: "",
        evoFormKey: ${quote(form.key)},
        trigger: new SpeciesFormChangeItemTrigger(FormChangeItem.${enumName(form.changeItem)}),
        conditions: [],
      })`)
    const starterFields = species.availability?.starters
      ? `
    starter: SpeciesId.${E},
    starterCost: ${numberValue(species.starterCost, 1)},`
      : ''
    const eggTierField = layout.eggTier && species.availability?.eggs
      ? '\n    eggTier: EggTier.COMMON,'
      : ''
    return `generationOneSpeciesData[SpeciesId.${E}] = {
    species: new PokemonSpecies({
      id: SpeciesId.${E},
      generation: ${numberValue(species.generation, 1)},
      legendary: ${Boolean(species.flags?.legendary)},
      mythical: ${Boolean(species.flags?.mythical)},
      category: ${quote(species.category || `${species.name} Pokémon`)},
      type1: PokemonType.${enumName(species.primaryType || 'NORMAL')},
      type2: ${species.secondaryType ? `PokemonType.${enumName(species.secondaryType)}` : 'null'},
      height: ${numberValue(species.height, 1)},
      weight: ${numberValue(species.weight, 1)},
      ability1: ${enumRef('AbilityId', species.ability1)},
      ability2: ${enumRef('AbilityId', species.ability2)},
      abilityHidden: ${enumRef('AbilityId', species.hiddenAbility)},
      baseTotal: ${baseTotal(stats)},
      baseHp: ${statValue(stats, 'hp')},
      baseAtk: ${statValue(stats, 'attack')},
      baseDef: ${statValue(stats, 'defense')},
      baseSpatk: ${statValue(stats, 'specialAttack')},
      baseSpdef: ${statValue(stats, 'specialDefense')},
      baseSpd: ${statValue(stats, 'speed')},
      catchRate: ${numberValue(species.captureRate, 45)},
      baseFriendship: ${numberValue(species.baseFriendship, 50)},
      baseExp: ${numberValue(species.baseExp, 64)},
      growthRate: GrowthRate.${enumName(species.growthRate || 'MEDIUM_FAST')},
      malePercent: ${malePercent(species)},
      genderDiffs: false,${formsSection}
    }),${starterFields}
    evolutions: [${evolutions.join(', ')}],${formChanges.length ? `
    formChanges: [${formChanges.join(', ')}],` : ''}${eggTierField}
    passives: ${passives},
    levelMoves: [${levelMoves.join(', ')}],
    tms: [${(species.tmMoves || []).map(move => `MoveId.${enumName(move)}`).join(', ')}],
  };`
  }).join('\n\n')
}

function eggMoveBody(custom) {
  return custom.map(species => {
    const moves = (species.eggMoves || []).map(move => `MoveId.${enumName(move)}`)
    while (moves.length < MAX_EGG_MOVES) moves.push('MoveId.NONE')
    return `  [SpeciesId.${species.enumName || enumName(species.speciesId)}]: [ ${moves.join(', ')} ],`
  }).join('\n')
}

function declarativeSpeciesLine(line, enumValue) {
  const trimmed = line.trim()
  return line.includes(`SpeciesId.${enumValue}`) && (
    /^[\[({]?\s*(SpeciesId\.|\[SpeciesId\.)/.test(trimmed)
    || trimmed.includes(`: SpeciesId.${enumValue}`)
  )
}

function applyAvailabilityOverrides(
  layout,
  manifest,
  owner,
  changes,
  sourceFor,
) {
  const overrides = manifest.availabilityOverrides || []
  if (!overrides.length) return
  const customById = new Map((manifest.customSpecies || []).map(species => [
    Number(species.speciesNumber),
    species.enumName || enumName(species.speciesId),
  ]))
  for (const override of overrides) {
    const official = override.enumName || enumName(override.speciesId)
    const replacement = override.mode === 'replace'
      ? customById.get(Number(override.replacementSpeciesNumber))
      : null
    let matches = 0
    for (const file of layout.encounterFiles) {
      const source = changes.get(file) || sourceFor(file)
      const marker = replacement
        ? `MOD-STUDIO REPLACED ${owner}:wildEncounters:${official}:${replacement}`
        : `MOD-STUDIO DISABLED ${owner}:wildEncounters:${official}`
      const next = source.split('\n').map(line => {
        if (line.includes(marker) || !declarativeSpeciesLine(line, official)) {
          return line
        }
        matches += 1
        if (replacement) {
          return `${line.replaceAll(`SpeciesId.${official}`, `SpeciesId.${replacement}`)} // ${marker}`
        }
        const indent = line.match(/^\s*/)?.[0] || ''
        return `${indent}// ${marker} | ${line.trim()}`
      }).join('\n')
      if (next !== source) changes.set(file, next)
    }
    if (matches === 0) {
      die(`${override.name || official}: no supported wild encounter reference was found; no speculative edit was made.`)
    }
  }
}

function biomeArrayRegex(biome) {
  return new RegExp(
    `(\\[(?:BiomeId|Biome)\\.${escapeRegExp(biome)}\\]\\s*:\\s*\\[)([\\s\\S]*?)(\\])`,
    'g',
  )
}

function simpleSpeciesArrayBody(body) {
  return body
    .replace(/\/\/.*$/gm, '')
    .replace(/SpeciesId\.[A-Z][A-Z0-9_]*/g, '')
    .replace(/[\s,]/g, '') === ''
}

function addCustomWildEncounters(
  layout,
  manifest,
  owner,
  changes,
  sourceFor,
) {
  for (const species of manifest.customSpecies || []) {
    const E = species.enumName || enumName(species.speciesId)
    for (const placement of species.encounterPlacements || []) {
      const B = enumName(placement.biome)
      const candidates = []
      for (const file of layout.encounterFiles) {
        const source = changes.get(file) || sourceFor(file)
        const regex = biomeArrayRegex(B)
        let match
        while ((match = regex.exec(source))) {
          if (simpleSpeciesArrayBody(match[2])) {
            candidates.push({ file, source, match })
          }
        }
      }
      if (candidates.length !== 1) {
        die(`${species.name}: biome ${B} matched ${candidates.length} supported arrays; exactly one is required.`)
      }
      const { file, source, match } = candidates[0]
      const marker = `MOD-STUDIO SPAWN ${owner}:${B}:${E}`
      if (source.includes(marker) || match[2].includes(`SpeciesId.${E}`)) continue
      const replacement = `${match[1]}\n    SpeciesId.${E}, // ${marker}${match[2]}${match[3]}`
      changes.set(
        file,
        `${source.slice(0, match.index)}${replacement}${source.slice(match.index + match[0].length)}`,
      )
    }
  }
}

function assetTarget(layout, speciesId, asset) {
  const extension = path.extname(asset.relativePath || asset.fileName || '').toLowerCase()
  if (asset.kind === 'sprite' && layout.pokemonImages) {
    return path.join(layout.pokemonImages, `${speciesId}${extension || '.png'}`)
  }
  if (asset.kind === 'icon' && layout.pokemonIcons) {
    return path.join(layout.pokemonIcons, `${speciesId}${extension || '.png'}`)
  }
  if (asset.kind === 'cry' && layout.cryDir) {
    return path.join(layout.cryDir, `${speciesId}${extension || '.ogg'}`)
  }
  if (asset.kind === 'variant' && layout.pokemonImages) {
    return path.join(layout.pokemonImages, 'variant', `${speciesId}.json`)
  }
  return null
}

function planAssets(layout, manifest, operations) {
  const assets = (manifest.customSpecies || [])
    .flatMap(species => (species.assets || []).map(asset => ({ species, asset })))
  if (!assets.length) return
  if (!manifest.sourceRoot) {
    die('Manifest contains uploaded assets but has no sourceRoot.')
  }
  const sourceRoot = fs.realpathSync(path.resolve(manifest.sourceRoot))
  const assetsRoot = fs.realpathSync(path.join(sourceRoot, 'assets'))
  const destinations = new Map()
  for (const { species, asset } of assets) {
    const id = Number(species.speciesNumber)
    const requested = path.resolve(sourceRoot, asset.relativePath)
    if (
      !isInside(assetsRoot, requested)
      || requested === assetsRoot
      || !fs.existsSync(requested)
    ) {
      die(`${species.name}: asset is missing or outside sourceRoot/assets: ${asset.relativePath}`)
    }
    const source = fs.realpathSync(requested)
    if (!isInside(assetsRoot, source) || !fs.statSync(source).isFile()) {
      die(`${species.name}: asset resolves outside sourceRoot/assets or is not a regular file.`)
    }
    const data = fs.readFileSync(source)
    if (!asset.sha256 || sha256(data) !== asset.sha256) {
      die(`${species.name}: asset hash mismatch for ${asset.fileName || asset.relativePath}.`)
    }
    const target = assetTarget(layout, id, asset)
    if (!target) {
      die(`${species.name}: target does not expose a ${asset.kind} destination.`)
    }
    const key = path.resolve(target).toLowerCase()
    if (destinations.has(key)) {
      die(`${species.name}: ${asset.kind} asset collides with ${destinations.get(key)} at ${relativeTo(layout.project, target)}.`)
    }
    destinations.set(key, `${species.name}/${asset.kind}`)
    operations.push({ type: 'copy', from: source, to: target })
  }
}

function modRoot(project, owner) {
  return path.join(project, STATE_DIR, 'mods', owner)
}

function journalPath(project, owner) {
  return path.join(modRoot(project, owner), 'journal.json')
}

function readJournal(project, owner) {
  const file = journalPath(project, owner)
  if (!fs.existsSync(file)) die(`No installed mod journal found for ${owner}.`)
  const journal = readJson(file)
  if (
    !journal
    || journal.owner !== owner
    || !Array.isArray(journal.files)
    || !Array.isArray(journal.copies)
  ) {
    die(`Installed journal for ${owner} is invalid.`)
  }
  return journal
}

function verifyJournalPaths(project, journal) {
  for (const item of [...journal.files, ...journal.copies]) {
    resolveInside(project, item.path, 'journal target path')
  }
  for (const item of [...journal.files, ...journal.copies]) {
    if (item.backup) resolveInside(project, item.backup, 'journal backup path')
  }
}

function currentHash(file) {
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null
}

function verifyInstalledState(project, journal) {
  verifyJournalPaths(project, journal)
  if (journal.state && journal.state !== 'committed') {
    die(`Installed journal for ${journal.owner} is not committed.`)
  }
  for (const item of journal.files) {
    const target = resolveInside(project, item.path, 'journal target path')
    if (currentHash(target) !== item.afterHash) {
      die(`Cannot modify ${item.path}: it changed after this mod was installed.`)
    }
  }
  for (const item of journal.copies) {
    const target = resolveInside(project, item.path, 'journal target path')
    if (currentHash(target) !== item.afterHash) {
      die(`Cannot modify ${item.path}: it changed after this mod was installed.`)
    }
  }
}

function operationNeedsRollback(target, item, checkConflicts) {
  const hash = currentHash(target)
  if (item.status === 'prepared' || item.applied === false) return false
  if (hash === item.afterHash) return true
  const beforeHash = item.existed === false ? null : item.beforeHash
  if (item.status === 'applying' && hash === beforeHash) return false
  if (!checkConflicts) return hash === item.afterHash
  die(`Rollback conflict: ${item.path} changed during or after installation.`)
}

function restoreJournal(
  project,
  journal,
  { removeRoot = true, checkConflicts = true } = {},
) {
  verifyJournalPaths(project, journal)
  for (const item of [...journal.copies].reverse()) {
    const target = resolveInside(project, item.path, 'journal target path')
    if (!operationNeedsRollback(target, item, checkConflicts)) continue
    if (item.existed) {
      const backup = resolveInside(project, item.backup, 'journal backup path')
      if (!fs.existsSync(backup)) die(`Rollback backup is missing: ${item.backup}`)
      ensureDir(path.dirname(target))
      fs.copyFileSync(backup, target)
    } else {
      fs.rmSync(target, { force: true })
    }
  }
  for (const item of [...journal.files].reverse()) {
    const target = resolveInside(project, item.path, 'journal target path')
    if (!operationNeedsRollback(target, item, checkConflicts)) continue
    const backup = resolveInside(project, item.backup, 'journal backup path')
    if (!fs.existsSync(backup)) die(`Rollback backup is missing: ${item.backup}`)
    ensureDir(path.dirname(target))
    fs.copyFileSync(backup, target)
  }
  if (removeRoot) {
    fs.rmSync(modRoot(project, journal.owner), { recursive: true, force: true })
  }
}

function prepareTransaction(project, owner, changes, copies) {
  const root = modRoot(project, owner)
  if (fs.existsSync(root)) die(`Mod ${owner} already has a transaction directory.`)
  const backupRoot = path.join(root, 'backups')
  ensureDir(backupRoot)
  const journal = {
    schemaVersion: JOURNAL_VERSION,
    owner,
    state: 'preparing',
    installedAt: new Date().toISOString(),
    files: [],
    copies: [],
  }
  writeJsonAtomic(journalPath(project, owner), journal)
  try {
    for (const [file, content] of changes) {
      const relative = relativeTo(project, file)
      const backup = path.join(backupRoot, relative)
      const record = {
        path: relative,
        backup: relativeTo(project, backup),
        afterHash: sha256(content),
        status: 'prepared',
      }
      journal.files.push(record)
      writeJsonAtomic(journalPath(project, owner), journal)
      ensureDir(path.dirname(backup))
      fs.copyFileSync(file, backup)
      record.beforeHash = sha256(fs.readFileSync(backup))
      writeJsonAtomic(journalPath(project, owner), journal)
    }
    for (const operation of copies) {
      const relative = relativeTo(project, operation.to)
      const record = {
        path: relative,
        existed: fs.existsSync(operation.to),
        afterHash: sha256(fs.readFileSync(operation.from)),
        status: 'prepared',
      }
      if (record.existed) {
        const backup = path.join(backupRoot, relative)
        record.backup = relativeTo(project, backup)
      }
      journal.copies.push(record)
      writeJsonAtomic(journalPath(project, owner), journal)
      if (record.existed) {
        const backup = resolveInside(project, record.backup, 'journal backup path')
        ensureDir(path.dirname(backup))
        fs.copyFileSync(operation.to, backup)
        record.beforeHash = sha256(fs.readFileSync(backup))
        writeJsonAtomic(journalPath(project, owner), journal)
      }
    }
    journal.state = 'prepared'
    writeJsonAtomic(journalPath(project, owner), journal)
    return journal
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    throw error
  }
}

function applyPreparedTransaction(project, owner, journal, changes, copies) {
  journal.state = 'applying'
  writeJsonAtomic(journalPath(project, owner), journal)
  try {
    let index = 0
    for (const [file, content] of changes) {
      const record = journal.files[index]
      record.status = 'applying'
      writeJsonAtomic(journalPath(project, owner), journal)
      const temporary = `${file}.modstudio.${process.pid}.tmp`
      fs.writeFileSync(temporary, content, 'utf8')
      fs.renameSync(temporary, file)
      record.status = 'applied'
      writeJsonAtomic(journalPath(project, owner), journal)
      index += 1
    }
    for (let copyIndex = 0; copyIndex < copies.length; copyIndex += 1) {
      const operation = copies[copyIndex]
      const record = journal.copies[copyIndex]
      record.status = 'applying'
      writeJsonAtomic(journalPath(project, owner), journal)
      ensureDir(path.dirname(operation.to))
      fs.copyFileSync(operation.from, operation.to)
      record.status = 'applied'
      writeJsonAtomic(journalPath(project, owner), journal)
    }
    journal.state = 'committed'
    writeJsonAtomic(journalPath(project, owner), journal)
  } catch (error) {
    try {
      restoreJournal(project, journal, {
        removeRoot: true,
        checkConflicts: true,
      })
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Installation failed and automatic rollback also failed: ${rollbackError.message}`,
      )
    }
    throw error
  }
}

function writeTransaction(project, owner, changes, copies, dryRun) {
  console.log(`Planned text changes: ${changes.size}; asset copies: ${copies.length}`)
  for (const [file, content] of changes) {
    console.log(`  edit ${relativeTo(project, file)} (${sha256(content).slice(0, 10)})`)
  }
  for (const operation of copies) {
    console.log(`  copy ${operation.from} -> ${relativeTo(project, operation.to)}`)
  }
  if (dryRun) return
  const journal = prepareTransaction(project, owner, changes, copies)
  applyPreparedTransaction(project, owner, journal, changes, copies)
}

function updateRoot(project, owner) {
  return path.join(project, STATE_DIR, 'updates', owner)
}

function snapshotPreviousInstallation(project, owner, journal) {
  verifyInstalledState(project, journal)
  const root = updateRoot(project, owner)
  fs.rmSync(root, { recursive: true, force: true })
  ensureDir(root)
  fs.cpSync(modRoot(project, owner), path.join(root, 'previous-mod'), {
    recursive: true,
  })
  const installedRoot = path.join(root, 'installed')
  const records = []
  for (const item of [...journal.files, ...journal.copies]) {
    const target = resolveInside(project, item.path, 'journal target path')
    if (!fs.existsSync(target)) die(`Installed target is missing: ${item.path}`)
    const snapshot = path.join(installedRoot, safeRelative(item.path))
    ensureDir(path.dirname(snapshot))
    fs.copyFileSync(target, snapshot)
    records.push({
      path: item.path,
      snapshot: relativeTo(project, snapshot),
      hash: sha256(fs.readFileSync(snapshot)),
    })
  }
  const state = { owner, state: 'snapshot', records }
  writeJsonAtomic(path.join(root, 'state.json'), state)
  return state
}

function restorePreviousInstallation(project, owner) {
  const root = updateRoot(project, owner)
  const stateFile = path.join(root, 'state.json')
  if (!fs.existsSync(stateFile)) return
  const state = readJson(stateFile)
  const newJournalFile = journalPath(project, owner)
  if (fs.existsSync(newJournalFile)) {
    const journal = readJson(newJournalFile)
    restoreJournal(project, journal, {
      removeRoot: true,
      checkConflicts: journal.state === 'committed',
    })
  }
  for (const record of state.records || []) {
    const target = resolveInside(project, record.path, 'update restore target')
    const snapshot = resolveInside(project, record.snapshot, 'update snapshot path')
    if (
      !fs.existsSync(snapshot)
      || sha256(fs.readFileSync(snapshot)) !== record.hash
    ) {
      die(`Update recovery snapshot is invalid: ${record.path}`)
    }
    ensureDir(path.dirname(target))
    fs.copyFileSync(snapshot, target)
  }
  fs.rmSync(modRoot(project, owner), { recursive: true, force: true })
  fs.cpSync(path.join(root, 'previous-mod'), modRoot(project, owner), {
    recursive: true,
  })
  fs.rmSync(root, { recursive: true, force: true })
}

function recoverIncompleteOperations(project) {
  const updates = path.join(project, STATE_DIR, 'updates')
  if (fs.existsSync(updates)) {
    for (const ownerName of fs.readdirSync(updates)) {
      const owner = normalizeOwner(ownerName)
      const stateFile = path.join(updates, ownerName, 'state.json')
      if (!fs.existsSync(stateFile)) {
        fs.rmSync(path.dirname(stateFile), { recursive: true, force: true })
        continue
      }
      const state = readJson(stateFile)
      if (state.state === 'new-committed') {
        fs.rmSync(path.dirname(stateFile), { recursive: true, force: true })
      } else {
        restorePreviousInstallation(project, owner)
      }
    }
  }

  const mods = path.join(project, STATE_DIR, 'mods')
  if (!fs.existsSync(mods)) return
  for (const ownerName of fs.readdirSync(mods)) {
    const ownerRoot = path.join(mods, ownerName)
    const file = path.join(ownerRoot, 'journal.json')
    if (!fs.existsSync(file)) {
      fs.rmSync(ownerRoot, { recursive: true, force: true })
      continue
    }
    const journal = readJson(file)
    if (journal.state && journal.state !== 'committed') {
      restoreJournal(project, journal, {
        removeRoot: true,
        checkConflicts: true,
      })
    }
  }
}

function performUpdate(project, owner, journal, changes, copies, dryRun) {
  verifyInstalledState(project, journal)
  if (dryRun) {
    console.log(
      `Existing transaction verified: ${journal.files.length} edited files and ${journal.copies.length} copied assets.`,
    )
    writeTransaction(project, owner, changes, copies, true)
    return
  }

  const state = snapshotPreviousInstallation(project, owner, journal)
  try {
    restoreJournal(project, journal, {
      removeRoot: true,
      checkConflicts: true,
    })
    state.state = 'previous-restored'
    writeJsonAtomic(path.join(updateRoot(project, owner), 'state.json'), state)
    writeTransaction(project, owner, changes, copies, false)
    state.state = 'new-committed'
    writeJsonAtomic(path.join(updateRoot(project, owner), 'state.json'), state)
    fs.rmSync(updateRoot(project, owner), { recursive: true, force: true })
  } catch (error) {
    try {
      restorePreviousInstallation(project, owner)
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `Update failed and the previous installation could not be restored: ${restoreError.message}`,
      )
    }
    throw error
  }
}

function uninstall(project, owner, dryRun) {
  const journal = readJournal(project, owner)
  verifyInstalledState(project, journal)
  console.log(
    `Restoring ${journal.files.length} edited files and ${journal.copies.length} copied assets.`,
  )
  if (!dryRun) {
    restoreJournal(project, journal, {
      removeRoot: true,
      checkConflicts: true,
    })
  }
}

function baselineSourceReader(project, journal) {
  if (!journal) return file => readText(file)
  verifyJournalPaths(project, journal)
  const backups = new Map()
  for (const item of journal.files) {
    if (!item.backup) die(`Installed journal has no backup for ${item.path}.`)
    const backup = resolveInside(project, item.backup, 'journal backup path')
    if (!fs.existsSync(backup)) die(`Installed backup is missing: ${item.backup}`)
    const data = fs.readFileSync(backup)
    if (item.beforeHash && sha256(data) !== item.beforeHash) {
      die(`Installed backup hash changed: ${item.backup}`)
    }
    backups.set(path.normalize(item.path), data.toString('utf8'))
  }
  return file => (
    backups.get(path.normalize(relativeTo(project, file))) ?? readText(file)
  )
}

function buildPlan(project, manifest, owner, { baselineJournal = null } = {}) {
  const layout = detectLayout(project)
  const sourceFor = baselineSourceReader(project, baselineJournal)
  const originalEnum = sourceFor(layout.speciesId)
  const registry = parseSpeciesEnum(originalEnum)
  validateManifest(manifest, registry, layout)

  const changes = new Map()
  const custom = manifest.customSpecies || []
  changes.set(
    layout.speciesId,
    replaceOwnedBlock(
      originalEnum,
      owner,
      'species-enum',
      speciesEnumBody(custom),
      source => source.lastIndexOf('}'),
    ),
  )
  const generation = sourceFor(layout.generation)
  changes.set(
    layout.generation,
    replaceOwnedBlock(
      generation,
      owner,
      'species-registry',
      modernSpeciesRegistryBody(custom, layout),
      source => {
        const match = source.match(/\n\s*return\s+generationOneSpeciesData\s*;/)
        return match ? match.index + 1 : -1
      },
    ),
  )
  if (layout.eggMoves) {
    const egg = sourceFor(layout.eggMoves)
    changes.set(
      layout.eggMoves,
      replaceOwnedBlock(
        egg,
        owner,
        'egg-moves',
        eggMoveBody(custom),
        source => {
          const index = source.indexOf('} satisfies Partial<Record<SpeciesId')
          return index >= 0 ? index : source.lastIndexOf('}')
        },
      ),
    )
  } else if (custom.some(species => species.eggMoves?.length)) {
    die('The target has no supported egg move registry.')
  }

  applyAvailabilityOverrides(
    layout,
    manifest,
    owner,
    changes,
    sourceFor,
  )
  addCustomWildEncounters(
    layout,
    manifest,
    owner,
    changes,
    sourceFor,
  )
  const copies = []
  planAssets(layout, manifest, copies)
  return { layout, changes, copies }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function withLock(project, operation) {
  const stateRoot = path.join(project, STATE_DIR)
  ensureDir(stateRoot)
  const lockFile = path.join(stateRoot, 'operation.lock')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(lockFile, 'wx')
      fs.writeFileSync(
        handle,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      )
      try {
        return operation()
      } finally {
        fs.closeSync(handle)
        fs.rmSync(lockFile, { force: true })
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let stale = true
      try {
        stale = !pidAlive(Number(readJson(lockFile).pid))
      } catch {
        stale = true
      }
      if (!stale) {
        die('Another Mod Studio delivery operation is already running for this checkout.')
      }
      fs.rmSync(lockFile, { force: true })
    }
  }
  die('Could not acquire the checkout delivery lock.')
}

function run(options) {
  if (!options.project || (!options.manifest && !options.uninstall)) {
    die('Both --project and either --manifest or --uninstall are required.')
  }
  const project = canonicalRoot(options.project)
  return withLock(project, () => {
    recoverIncompleteOperations(project)
    if (options.uninstall) {
      const owner = normalizeOwner(options.uninstall)
      uninstall(project, owner, options.dryRun)
      console.log(
        options.dryRun
          ? 'Dry-run uninstall passed.'
          : 'Mod uninstalled and original files restored.',
      )
      return
    }

    const manifest = readJson(path.resolve(options.manifest))
    const owner = normalizeOwner(manifest.mod?.id || 'local-custom-species')
    const existing = fs.existsSync(journalPath(project, owner))
    if (existing && !options.force) {
      die(`Mod ${owner} is already installed. Use Update or uninstall it first.`)
    }
    const previousJournal = existing ? readJournal(project, owner) : null
    if (previousJournal) verifyInstalledState(project, previousJournal)
    const plan = buildPlan(project, manifest, owner, {
      baselineJournal: previousJournal,
    })
    if (previousJournal && options.force) {
      performUpdate(
        project,
        owner,
        previousJournal,
        plan.changes,
        plan.copies,
        options.dryRun,
      )
    } else {
      writeTransaction(
        project,
        owner,
        plan.changes,
        plan.copies,
        options.dryRun,
      )
    }
    console.log(
      options.dryRun
        ? 'Preflight passed. Nothing was changed.'
        : `Installed ${manifest.mod?.name || owner}. Rebuild PokéRogue, then launch it.`,
    )
  })
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(
      'Usage:\n'
      + '  node pokerogue-mod-installer.cjs --manifest <manifest.json> --project <game-root> [--dry-run] [--force]\n'
      + '  node pokerogue-mod-installer.cjs --project <game-root> --uninstall <mod-id> [--dry-run]',
    )
    return 0
  }
  run(options)
  return 0
}

module.exports = {
  buildPlan,
  detectLayout,
  main,
  normalizeOwner,
  parseArgs,
  readJournal,
  restoreJournal,
  run,
  validateManifest,
}
