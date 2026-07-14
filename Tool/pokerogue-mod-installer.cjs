#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const OFFICIAL_DEX_MAX = 1025
const STATE_DIR = '.pokerogue-mod-studio'

function parseArgs(argv) {
  const out = { dryRun: false, force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--manifest') out.manifest = argv[++i]
    else if (arg === '--project') out.project = argv[++i]
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--force') out.force = true
    else if (arg === '--uninstall') out.uninstall = argv[++i]
    else if (arg === '--help' || arg === '-h') out.help = true
  }
  return out
}

function die(message) {
  throw new Error(message)
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

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function enumName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function quote(value) {
  return JSON.stringify(String(value ?? ''))
}

function rel(project, file) {
  return path.relative(project, file).replaceAll('\\', '/')
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true })
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

function walk(directory, predicate, output = []) {
  if (!fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules'
      || entry.name === '.git'
      || entry.name === STATE_DIR
      || entry.name === 'dist'
    ) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full, predicate, output)
    else if (!predicate || predicate(full)) output.push(full)
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

function detectLayout(project) {
  const speciesId = findFirst(project, [
    'src/enums/species-id.ts',
    'src/enums/species-id.tsx',
  ]) || findByName(project, /species[-_]id\.tsx?$/i)
  const eggMoves = findFirst(project, [
    'src/data/balance/moves/egg-moves.ts',
  ]) || findByName(project, /egg[-_]moves\.ts$/i)
  const generationFiles = walk(
    path.join(project, 'src'),
    file => /generation-\d+\.ts$/i.test(file),
  )
  const generation = generationFiles.find(file => /generation-0?1\.ts$/i.test(file))
    || generationFiles[0]
    || findByName(project, /species.*data.*\.ts$/i)
  if (!speciesId || !generation) {
    die('This does not look like a supported PokéRogue source tree (species enum or generation registry missing).')
  }

  const speciesSource = readText(speciesId)
  const generationSource = readText(generation)
  if (!/\benum\s+SpeciesId\b/.test(speciesSource)) {
    die('The species ID file has no recognized SpeciesId enum.')
  }
  if (!/\bgenerationOneSpeciesData\b/.test(generationSource)) {
    die('The species registry has no generationOneSpeciesData anchor.')
  }
  const modern = (
    /\bSpeciesDataMapConfig\b/.test(generationSource)
    && /\bnew\s+PokemonSpecies\s*\(/.test(generationSource)
  )
  const legacy = /\bPokemonSpeciesData\b/.test(generationSource) && !modern
  if (!modern && !legacy) {
    die('The species registry does not match a supported conservative adapter.')
  }
  const requiredModernNames = [
    'PokemonSpecies',
    'PokemonType',
    'AbilityId',
    'GrowthRate',
    'SpeciesEvolution',
    'MoveId',
  ]
  if (modern) {
    for (const name of requiredModernNames) {
      if (!new RegExp(`\\b${name}\\b`).test(generationSource)) {
        die(`The modern species registry is missing required ${name} anchors.`)
      }
    }
  }

  const pokemonImages = findFirst(project, [
    'assets/images/pokemon',
    'public/images/pokemon',
  ])
  return {
    kind: modern ? 'modern' : 'legacy',
    speciesId,
    eggMoves,
    generation,
    generationSource,
    forms: modern && /\bPokemonForm\b/.test(generationSource),
    formChanges: modern
      && /\bSpeciesFormChange\b/.test(generationSource)
      && /\bSpeciesFormChangeItemTrigger\b/.test(generationSource)
      && /\bFormChangeItem\b/.test(generationSource),
    advancedEvolutionTriggers: modern
      && /\bEvoCondKey\b/.test(generationSource)
      && /\bTimeOfDay\b/.test(generationSource),
    eggTier: modern && /\bEggTier\b/.test(generationSource),
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
    srcDir: path.join(project, 'src'),
  }
}

function parseSpeciesEnum(source) {
  const byId = new Map()
  const byName = new Map()
  for (const match of source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?/gm)) {
    const id = Number(match[2])
    byId.set(id, match[1])
    byName.set(match[1], id)
  }
  return { byId, byName }
}

function validateManifest(manifest, registry, layout) {
  if (
    manifest.format !== 'pokerogue-mod-studio'
    || Number(manifest.schemaVersion) < 2
  ) {
    die('Unsupported manifest. Export a current Mod Project from the editor.')
  }
  const seenIds = new Map()
  const seenNames = new Map()
  for (const species of manifest.customSpecies || []) {
    const id = Number(species.speciesNumber)
    const name = species.enumName || enumName(species.speciesId)
    if (!Number.isInteger(id) || id <= OFFICIAL_DEX_MAX) {
      die(`${species.name}: custom ID must be greater than ${OFFICIAL_DEX_MAX}.`)
    }
    if (seenIds.has(id)) {
      die(`Manifest collision: #${id} belongs to both ${seenIds.get(id)} and ${species.name}.`)
    }
    if (seenNames.has(name)) {
      die(`Manifest enum collision: ${name} is duplicated.`)
    }
    seenIds.set(id, species.name)
    seenNames.set(name, id)
    if (registry.byId.has(id) && registry.byId.get(id) !== name) {
      die(`#${id} already belongs to ${registry.byId.get(id)} in the installed game.`)
    }
    if (registry.byName.has(name) && registry.byName.get(name) !== id) {
      die(`${name} already exists at #${registry.byName.get(name)} in the installed game.`)
    }
    if (species.forms?.length && !layout.forms) {
      die(`${species.name}: the selected checkout has no supported PokemonForm registry anchors.`)
    }
    if (
      species.forms?.some(form => form.changeItem)
      && !layout.formChanges
    ) {
      die(`${species.name}: form-change items are not supported by the selected checkout.`)
    }
    for (const evolution of species.evolutions || []) {
      const type = evolution.trigger?.type
        || (evolution.item ? 'item' : 'level')
      if (type === 'custom') {
        die(`${species.name}: custom prose evolution requirements cannot be installed automatically.`)
      }
      if (
        ['friendship', 'time', 'move'].includes(type)
        && !layout.advancedEvolutionTriggers
      ) {
        die(`${species.name}: evolution trigger "${type}" is not supported by this checkout adapter.`)
      }
      if (!['level', 'item', 'friendship', 'time', 'move'].includes(type)) {
        die(`${species.name}: unsupported evolution trigger "${type}".`)
      }
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

function baseTotal(stats = {}) {
  return [
    'hp',
    'attack',
    'defense',
    'specialAttack',
    'specialDefense',
    'speed',
  ].reduce((total, key) => total + (Number(stats[key]) || 0), 0)
}

function malePercent(species) {
  return Number(species.genderRatio) === -1
    ? 'null'
    : String(Math.max(0, Math.min(100, 100 - (Number(species.genderRatio) || 0))))
}

function statValue(stats, key, fallback) {
  return Number(stats?.[key]) || Number(fallback) || 1
}

function modernFormBody(species, form, index) {
  const baseStats = species.baseStats || {}
  const stats = { ...baseStats, ...(form.statOverrides || {}) }
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
          height: ${Number(form.height) || Number(species.height) || 1},
          weight: ${Number(form.weight) || Number(species.weight) || 1},
          ability1: ${enumRef('AbilityId', abilities[0])},
          ability2: ${enumRef('AbilityId', abilities[1])},
          abilityHidden: ${enumRef('AbilityId', abilities[2])},
          baseTotal: ${baseTotal(stats)},
          baseHp: ${statValue(stats, 'hp', 1)},
          baseAtk: ${statValue(stats, 'attack', 1)},
          baseDef: ${statValue(stats, 'defense', 1)},
          baseSpatk: ${statValue(stats, 'specialAttack', 1)},
          baseSpdef: ${statValue(stats, 'specialDefense', 1)},
          baseSpd: ${statValue(stats, 'speed', 1)},
          catchRate: ${Number(species.captureRate) || 45},
          baseFriendship: ${Number(species.baseFriendship) || 50},
          baseExp: ${Number(species.baseExp) || 64},
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
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.FRIENDSHIP, value: ${Number(trigger.friendship) || 220} } })`
  }
  if (type === 'time') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.TIME, time: [TimeOfDay.${enumName(trigger.time || 'DAY')}] } })`
  }
  if (type === 'move') {
    return `new SpeciesEvolution({ speciesId: ${target}, level: 1, condition: { key: EvoCondKey.MOVE, move: MoveId.${enumName(trigger.move)} } })`
  }
  return `new SpeciesEvolution({ speciesId: ${target}, level: ${Number(trigger.level || evolution.level) || 1} })`
}

function modernSpeciesRegistryBody(custom, layout) {
  return custom.map(species => {
    const E = species.enumName || enumName(species.speciesId)
    const stats = species.baseStats || {}
    const evolutions = (species.evolutions || []).map(evolutionBody)
    const levelMoves = (species.levelUpMoves || [])
      .map(move => `[${Number(move[0]) || 1}, MoveId.${enumName(move[1])}]`)
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
    starterCost: ${Number(species.starterCost) || 1},`
      : ''
    const eggTierField = layout.eggTier && species.availability?.eggs
      ? '\n    eggTier: EggTier.COMMON,'
      : ''
    return `generationOneSpeciesData[SpeciesId.${E}] = {
    species: new PokemonSpecies({
      id: SpeciesId.${E},
      generation: ${Number(species.generation) || 1},
      legendary: ${Boolean(species.flags?.legendary)},
      mythical: ${Boolean(species.flags?.mythical)},
      category: ${quote(species.category || `${species.name} Pokémon`)},
      type1: PokemonType.${enumName(species.primaryType || 'NORMAL')},
      type2: ${species.secondaryType ? `PokemonType.${enumName(species.secondaryType)}` : 'null'},
      height: ${Number(species.height) || 1},
      weight: ${Number(species.weight) || 1},
      ability1: ${enumRef('AbilityId', species.ability1)},
      ability2: ${enumRef('AbilityId', species.ability2)},
      abilityHidden: ${enumRef('AbilityId', species.hiddenAbility)},
      baseTotal: ${baseTotal(stats)},
      baseHp: ${statValue(stats, 'hp', 1)},
      baseAtk: ${statValue(stats, 'attack', 1)},
      baseDef: ${statValue(stats, 'defense', 1)},
      baseSpatk: ${statValue(stats, 'specialAttack', 1)},
      baseSpdef: ${statValue(stats, 'specialDefense', 1)},
      baseSpd: ${statValue(stats, 'speed', 1)},
      catchRate: ${Number(species.captureRate) || 45},
      baseFriendship: ${Number(species.baseFriendship) || 50},
      baseExp: ${Number(species.baseExp) || 64},
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

function legacySpeciesRegistryBody(custom) {
  return custom.map(species => {
    const E = species.enumName || enumName(species.speciesId)
    const stats = species.baseStats || {}
    const evolutions = (species.evolutions || []).map(evolutionBody)
    const levelMoves = (species.levelUpMoves || [])
      .map(move => `[${Number(move[0]) || 1}, MoveId.${enumName(move[1])}]`)
    return `generationOneSpeciesData[SpeciesId.${E}] = {
    species: {
      speciesId: SpeciesId.${E},
      generation: ${Number(species.generation) || 1},
      type1: PokemonType.${enumName(species.primaryType || 'NORMAL')},
      type2: ${species.secondaryType ? `PokemonType.${enumName(species.secondaryType)}` : 'null'},
      height: ${Number(species.height) || 1},
      weight: ${Number(species.weight) || 1},
      ability1: ${enumRef('AbilityId', species.ability1)},
      ability2: ${enumRef('AbilityId', species.ability2)},
      abilityHidden: ${enumRef('AbilityId', species.hiddenAbility)},
      baseTotal: ${baseTotal(stats)},
      baseHp: ${statValue(stats, 'hp', 1)},
      baseAtk: ${statValue(stats, 'attack', 1)},
      baseDef: ${statValue(stats, 'defense', 1)},
      baseSpatk: ${statValue(stats, 'specialAttack', 1)},
      baseSpdef: ${statValue(stats, 'specialDefense', 1)},
      baseSpd: ${statValue(stats, 'speed', 1)},
      catchRate: ${Number(species.captureRate) || 45},
      baseFriendship: ${Number(species.baseFriendship) || 50},
      baseExp: ${Number(species.baseExp) || 64},
      growthRate: GrowthRate.${enumName(species.growthRate || 'MEDIUM_FAST')},
      malePercent: ${malePercent(species)},
      genderDiffs: false,
    },
    evolutions: [${evolutions.join(', ')}],
    passives: ${enumRef('AbilityId', species.passiveAbility)},
    levelMoves: [${levelMoves.join(', ')}],
    tms: [${(species.tmMoves || []).map(move => `MoveId.${enumName(move)}`).join(', ')}],
  };`
  }).join('\n\n')
}

function speciesRegistryBody(custom, layout) {
  return layout.kind === 'modern'
    ? modernSpeciesRegistryBody(custom, layout)
    : legacySpeciesRegistryBody(custom)
}

function eggMoveBody(custom) {
  return custom.map(species => {
    const moves = (species.eggMoves || [])
      .slice(0, 4)
      .map(move => `MoveId.${enumName(move)}`)
    while (moves.length < 4) moves.push('MoveId.NONE')
    return `  [SpeciesId.${species.enumName || enumName(species.speciesId)}]: [ ${moves.join(', ')} ],`
  }).join('\n')
}

function categoryForFile(file) {
  const value = file.replaceAll('\\', '/').toLowerCase()
  if (/biome|wild|encounter/.test(value)) return 'wildEncounters'
  if (/starter/.test(value)) return 'starters'
  if (/egg/.test(value)) return 'eggs'
  if (/trainer/.test(value)) return 'trainers'
  if (/boss/.test(value)) return 'bosses'
  if (/reward|mystery|voucher/.test(value)) return 'specialRewards'
  return null
}

function declarativeSpeciesLine(line, enumValue) {
  const trimmed = line.trim()
  return line.includes(`SpeciesId.${enumValue}`) && (
    /^[\[({]?\s*(SpeciesId\.|\[SpeciesId\.)/.test(trimmed)
    || trimmed.includes(`: SpeciesId.${enumValue}`)
  )
}

function applyAvailabilityOverrides(layout, manifest, owner, changes) {
  const overrides = manifest.availabilityOverrides || []
  if (!overrides.length) return
  const customById = new Map((manifest.customSpecies || []).map(species => [
    Number(species.speciesNumber),
    species.enumName || enumName(species.speciesId),
  ]))
  for (const file of walk(layout.srcDir, candidate => /\.(ts|tsx)$/.test(candidate))) {
    const category = categoryForFile(file)
    if (!category) continue
    const source = fs.readFileSync(file, 'utf8')
    let next = source
    for (const override of overrides) {
      if (override.availability?.[category] !== false) continue
      const official = override.enumName || enumName(override.speciesId)
      const replacement = override.mode === 'replace'
        ? customById.get(Number(override.replacementSpeciesNumber))
        : null
      const marker = replacement
        ? `MOD-STUDIO REPLACED ${owner}:${category}:${official}:${replacement}`
        : `MOD-STUDIO DISABLED ${owner}:${category}:${official}`
      next = next.split('\n').map(line => {
        if (line.includes(marker) || !declarativeSpeciesLine(line, official)) {
          return line
        }
        if (replacement) {
          return `${line.replaceAll(`SpeciesId.${official}`, `SpeciesId.${replacement}`)} // ${marker}`
        }
        const indent = line.match(/^\s*/)?.[0] || ''
        return `${indent}// ${marker} | ${line.trim()}`
      }).join('\n')
    }
    if (next !== source) changes.set(file, next)
  }
}

function addCustomWildEncounters(layout, manifest, owner, changes) {
  const candidates = walk(
    layout.srcDir,
    file => /\.(ts|tsx)$/.test(file) && categoryForFile(file) === 'wildEncounters',
  )
  for (const species of manifest.customSpecies || []) {
    if (species.availability?.wildEncounters === false) continue
    const E = species.enumName || enumName(species.speciesId)
    const placements = species.encounterPlacements
      || (species.biomes || []).map(biome => ({ biome }))
    for (const placement of placements) {
      const B = enumName(placement.biome)
      let installed = false
      for (const file of candidates) {
        const original = changes.get(file) || fs.readFileSync(file, 'utf8')
        if (original.includes(`MOD-STUDIO SPAWN ${owner}:${B}:${E}`)) {
          installed = true
          break
        }
        const patterns = [
          `BiomeId.${B}`,
          `Biome.${B}`,
          `[BiomeId.${B}]`,
          `[Biome.${B}]`,
        ]
        const hit = patterns
          .map(pattern => original.indexOf(pattern))
          .find(index => index >= 0)
        if (hit === undefined) continue
        const arrayStart = original.indexOf('[', hit + 1)
        if (arrayStart < 0 || arrayStart - hit > 600) continue
        const metadata = `weight=${Number(placement.weight) || 1};levels=${Number(placement.minLevel) || 1}-${Number(placement.maxLevel) || Number(placement.minLevel) || 1}`
        changes.set(
          file,
          `${original.slice(0, arrayStart + 1)}\n    SpeciesId.${E}, // MOD-STUDIO SPAWN ${owner}:${B}:${E} ${metadata}${original.slice(arrayStart + 1)}`,
        )
        installed = true
        break
      }
      if (!installed) {
        console.warn(
          `WARN Could not locate biome ${B} for ${E}; no speculative source edit was made.`,
        )
      }
    }
  }
}

function assetTarget(layout, speciesId, asset) {
  const extension = path.extname(asset.relativePath || asset.fileName || '')
    .toLowerCase()
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
  const sourceRoot = manifest.sourceRoot ? path.resolve(manifest.sourceRoot) : null
  for (const species of manifest.customSpecies || []) {
    const id = Number(species.speciesNumber)
    const uploadedKinds = new Set()
    for (const asset of species.assets || []) {
      if (!sourceRoot) {
        die(`${species.name}: manifest contains uploaded assets but has no sourceRoot.`)
      }
      const source = path.resolve(sourceRoot, asset.relativePath)
      const allowedRoot = path.resolve(sourceRoot, 'assets')
      if (!isInside(allowedRoot, source) || !fs.existsSync(source)) {
        die(`${species.name}: asset file is missing or outside sourceRoot: ${asset.relativePath}`)
      }
      const data = fs.readFileSync(source)
      if (asset.sha256 && sha256(data) !== asset.sha256) {
        die(`${species.name}: asset hash mismatch for ${asset.fileName || asset.relativePath}.`)
      }
      const target = assetTarget(layout, id, asset)
      if (!target) {
        die(`${species.name}: target does not expose a ${asset.kind} destination.`)
      }
      operations.push({ type: 'copy', from: source, to: target })
      uploadedKinds.add(asset.kind)
    }
    const donor = Number(species.spriteDonorDex || species.spriteKey)
    if (
      !uploadedKinds.has('sprite')
      && layout.pokemonImages
      && Number.isInteger(donor)
      && donor > 0
    ) {
      const source = path.join(layout.pokemonImages, `${donor}.png`)
      if (fs.existsSync(source)) {
        operations.push({
          type: 'copy',
          from: source,
          to: path.join(layout.pokemonImages, `${id}.png`),
        })
      }
    }
    const cryDonor = Number(species.cryDonorDex || donor)
    if (
      !uploadedKinds.has('cry')
      && layout.cryDir
      && Number.isInteger(cryDonor)
      && cryDonor > 0
    ) {
      for (const extension of ['.m4a', '.ogg', '.mp3']) {
        const source = path.join(layout.cryDir, `${cryDonor}${extension}`)
        if (fs.existsSync(source)) {
          operations.push({
            type: 'copy',
            from: source,
            to: path.join(layout.cryDir, `${id}${extension}`),
          })
          break
        }
      }
    }
  }
}

function rollback(project, journal) {
  for (const item of [...(journal.files || [])].reverse()) {
    if (item.backup && fs.existsSync(path.join(project, item.backup))) {
      fs.copyFileSync(
        path.join(project, item.backup),
        path.join(project, item.path),
      )
    }
  }
  for (const item of [...(journal.copies || [])].reverse()) {
    const target = path.join(project, item.path)
    if (
      item.existed
      && item.backup
      && fs.existsSync(path.join(project, item.backup))
    ) {
      fs.copyFileSync(path.join(project, item.backup), target)
    } else if (fs.existsSync(target)) {
      fs.rmSync(target)
    }
  }
}

function writeTransaction(project, owner, changes, copies, dryRun) {
  const modRoot = path.join(project, STATE_DIR, 'mods', owner)
  const backupRoot = path.join(modRoot, 'backups')
  const journal = {
    owner,
    installedAt: new Date().toISOString(),
    files: [],
    copies: [],
  }
  console.log(
    `Planned text changes: ${changes.size}; asset copies: ${copies.length}`,
  )
  for (const [file, content] of changes) {
    console.log(`  edit ${rel(project, file)} (${sha256(content).slice(0, 10)})`)
  }
  for (const operation of copies) {
    console.log(
      `  copy ${rel(project, operation.from)} -> ${rel(project, operation.to)}`,
    )
  }
  if (dryRun) return
  ensureDir(backupRoot)
  try {
    for (const [file, content] of changes) {
      const relative = rel(project, file)
      const backup = path.join(backupRoot, relative)
      ensureDir(path.dirname(backup))
      fs.copyFileSync(file, backup)
      const temporary = `${file}.modstudio.tmp`
      fs.writeFileSync(temporary, content, 'utf8')
      fs.renameSync(temporary, file)
      journal.files.push({
        path: relative,
        backup: rel(project, backup),
        beforeHash: sha256(fs.readFileSync(backup)),
        afterHash: sha256(content),
      })
    }
    for (const operation of copies) {
      ensureDir(path.dirname(operation.to))
      if (fs.existsSync(operation.to)) {
        const backup = path.join(backupRoot, rel(project, operation.to))
        ensureDir(path.dirname(backup))
        fs.copyFileSync(operation.to, backup)
        journal.copies.push({
          path: rel(project, operation.to),
          backup: rel(project, backup),
          existed: true,
        })
      } else {
        journal.copies.push({
          path: rel(project, operation.to),
          existed: false,
        })
      }
      fs.copyFileSync(operation.from, operation.to)
    }
    ensureDir(modRoot)
    fs.writeFileSync(
      path.join(modRoot, 'journal.json'),
      JSON.stringify(journal, null, 2),
    )
  } catch (error) {
    console.error('Installation failed; rolling back transaction.')
    rollback(project, journal)
    throw error
  }
}

function uninstall(project, owner, dryRun) {
  const journalFile = path.join(
    project,
    STATE_DIR,
    'mods',
    owner,
    'journal.json',
  )
  if (!fs.existsSync(journalFile)) {
    die(`No installed mod journal found for "${owner}".`)
  }
  const journal = readJson(journalFile)
  console.log(
    `Restoring ${journal.files.length} edited files and ${journal.copies.length} copied assets.`,
  )
  if (!dryRun) {
    rollback(project, journal)
    fs.rmSync(path.dirname(journalFile), { recursive: true, force: true })
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.project || (!args.manifest && !args.uninstall)) {
    console.log(
      'Usage:\n'
      + '  node pokerogue-mod-installer.cjs --manifest <manifest.json> --project <game-root> [--dry-run] [--force]\n'
      + '  node pokerogue-mod-installer.cjs --project <game-root> --uninstall <mod-id> [--dry-run]',
    )
    if (!args.help) process.exitCode = 1
    return
  }

  const project = path.resolve(args.project)
  if (args.uninstall) {
    uninstall(project, args.uninstall, args.dryRun)
    console.log(
      args.dryRun
        ? 'Dry-run uninstall passed.'
        : 'Mod uninstalled and original files restored.',
    )
    return
  }

  const manifest = readJson(path.resolve(args.manifest))
  const owner = enumName(
    manifest.mod?.id || 'local-custom-species',
  ).toLowerCase()
  const existingJournal = path.join(
    project,
    STATE_DIR,
    'mods',
    owner,
    'journal.json',
  )
  if (fs.existsSync(existingJournal)) {
    if (!args.force) {
      die(`Mod "${owner}" is already installed. Use Update or uninstall it first.`)
    }
    if (args.dryRun) {
      die('--force cannot be combined with --dry-run when replacing an installed mod.')
    }
    rollback(project, readJson(existingJournal))
    fs.rmSync(path.dirname(existingJournal), { recursive: true, force: true })
    console.log(`Restored previous ${owner} transaction before reinstalling.`)
  }

  const layout = detectLayout(project)
  const originalEnum = readText(layout.speciesId)
  const registry = parseSpeciesEnum(originalEnum)
  validateManifest(manifest, registry, layout)
  const changes = new Map()
  const custom = manifest.customSpecies || []
  if (custom.length) {
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
    const generation = readText(layout.generation)
    changes.set(
      layout.generation,
      replaceOwnedBlock(
        generation,
        owner,
        'species-registry',
        speciesRegistryBody(custom, layout),
        source => {
          const match = source.match(/\n\s*return\s+generationOneSpeciesData\s*;/)
          return match ? match.index + 1 : -1
        },
      ),
    )
    if (layout.eggMoves) {
      const egg = readText(layout.eggMoves)
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
    }
  }
  applyAvailabilityOverrides(layout, manifest, owner, changes)
  addCustomWildEncounters(layout, manifest, owner, changes)
  const copies = []
  planAssets(layout, manifest, copies)
  writeTransaction(project, owner, changes, copies, args.dryRun)
  console.log(
    args.dryRun
      ? 'Preflight passed. Nothing was changed.'
      : `Installed ${manifest.mod?.name || owner}. Rebuild PokéRogue, then launch it.`,
  )
}

try {
  main()
} catch (error) {
  console.error(`\nERROR ${error.stack || error.message}\n`)
  process.exitCode = 1
}
