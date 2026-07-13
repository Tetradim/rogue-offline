#!/usr/bin/env node
'use strict'

/**
 * PokéRogue Mod Studio transactional installer.
 *
 * Usage:
 *   node pokerogue-mod-installer.cjs --manifest pokerogue-mod-project.json --project C:\path\to\rogue-offline --dry-run
 *   node pokerogue-mod-installer.cjs --manifest pokerogue-mod-project.json --project C:\path\to\rogue-offline
 *   node pokerogue-mod-installer.cjs --project C:\path\to\rogue-offline --uninstall local-custom-species
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const OFFICIAL_DEX_MAX = 1025
const STATE_DIR = '.pokerogue-mod-studio'

function parseArgs(argv) {
  const out = { dryRun: false, force: false }
  for (let i = 0; i < argv.length; i++) {
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

function die(message) { console.error(`\n✖ ${message}\n`); process.exit(1) }
function readText(file) { if (!fs.existsSync(file)) die(`Required file not found: ${file}`); return fs.readFileSync(file, 'utf8') }
function readJson(file) { try { return JSON.parse(readText(file)) } catch (e) { die(`Invalid JSON in ${file}: ${e.message}`) } }
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex') }
function enumName(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') }
function pascal(value) { return String(value || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).map(x => x[0]?.toUpperCase() + x.slice(1).toLowerCase()).join('') }
function rel(project, file) { return path.relative(project, file).replaceAll('\\', '/') }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === STATE_DIR) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, predicate, out)
    else if (!predicate || predicate(full)) out.push(full)
  }
  return out
}

function findFirst(project, candidates) {
  for (const candidate of candidates) {
    const full = path.join(project, candidate)
    if (fs.existsSync(full)) return full
  }
  return null
}

function detectLayout(project) {
  const speciesId = findFirst(project, ['src/enums/species-id.ts', 'src/enums/species-id.tsx'])
  const eggMoves = findFirst(project, ['src/data/balance/moves/egg-moves.ts'])
  const generationFiles = walk(path.join(project, 'src/data/balance/species'), f => /generation-\d+\.ts$/.test(f))
  const generation = generationFiles.find(f => /generation-01\.ts$/.test(f)) || generationFiles[0]
  if (!speciesId || !generation) die('This does not look like the supported PokéRogue source tree (species enum or generation registry missing).')
  return {
    speciesId, eggMoves, generation,
    pokemonImages: findFirst(project, ['assets/images/pokemon', 'public/images/pokemon']),
    cryDir: findFirst(project, ['assets/audio/cry', 'public/audio/cry']),
    srcDir: path.join(project, 'src'),
  }
}

function parseSpeciesEnum(source) {
  const byId = new Map(), byName = new Map()
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?/gm
  for (const m of source.matchAll(re)) {
    const id = Number(m[2]); byId.set(id, m[1]); byName.set(m[1], id)
  }
  return { byId, byName }
}

function validateManifest(manifest, enumRegistry) {
  if (manifest.format !== 'pokerogue-mod-studio' || Number(manifest.schemaVersion) < 2) die('Unsupported manifest. Export a current Mod Project from the editor.')
  const seenIds = new Map(), seenNames = new Map()
  for (const species of manifest.customSpecies || []) {
    const id = Number(species.speciesNumber)
    const name = species.enumName || enumName(species.speciesId)
    if (!Number.isInteger(id) || id <= OFFICIAL_DEX_MAX) die(`${species.name}: custom ID must be greater than ${OFFICIAL_DEX_MAX}.`)
    if (seenIds.has(id)) die(`Manifest collision: #${id} belongs to both ${seenIds.get(id)} and ${species.name}.`)
    if (seenNames.has(name)) die(`Manifest enum collision: ${name} is duplicated.`)
    seenIds.set(id, species.name); seenNames.set(name, id)
    if (enumRegistry.byId.has(id) && enumRegistry.byId.get(id) !== name) die(`#${id} already belongs to ${enumRegistry.byId.get(id)} in the installed game.`)
    if (enumRegistry.byName.has(name) && enumRegistry.byName.get(name) !== id) die(`${name} already exists at #${enumRegistry.byName.get(name)} in the installed game.`)
  }
}

function replaceOwnedBlock(source, owner, section, body, anchor) {
  const begin = `// MOD-STUDIO BEGIN ${owner}:${section}`
  const end = `// MOD-STUDIO END ${owner}:${section}`
  const re = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, 'g')
  source = source.replace(re, '')
  const block = `${begin}\n${body.trimEnd()}\n${end}\n`
  const index = anchor(source)
  if (index < 0) throw new Error(`Could not find insertion anchor for ${section}`)
  return source.slice(0, index) + block + source.slice(index)
}
function escapeRegExp(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function speciesEnumBody(custom) {
  return custom.map(s => `  ${s.enumName || enumName(s.speciesId)} = ${Number(s.speciesNumber)},`).join('\n')
}

function enumRef(type, value, fallback = 'NONE') { return `${type}.${value ? enumName(value) : fallback}` }
function baseTotal(stats = {}) { return ['hp','attack','defense','specialAttack','specialDefense','speed'].reduce((n,k) => n + (Number(stats[k]) || 0), 0) }

function speciesRegistryBody(custom) {
  const lines = []
  for (const s of custom) {
    const E = s.enumName || enumName(s.speciesId)
    const fn = `createModStudio${pascal(s.speciesId)}Data`
    const st = s.baseStats || {}
    const malePercent = Number(s.genderRatio) === -1 ? 'null' : Math.max(0, Math.min(100, 100 - (Number(s.genderRatio) || 0)))
    const evolutions = (s.evolutions || []).map(e => {
      const target = enumName(e.speciesId)
      const args = [`speciesId: SpeciesId.${target}`]
      if (e.level != null) args.push(`level: ${Number(e.level) || 1}`)
      if (e.item) args.push(`item: EvolutionItem.${enumName(e.item)}`)
      return `new SpeciesEvolution({ ${args.join(', ')} })`
    })
    const levelMoves = (s.levelUpMoves || s.moves || []).map(m => Array.isArray(m) ? `[${Number(m[0]) || 1}, MoveId.${enumName(m[1])}]` : null).filter(Boolean)
    lines.push(`function ${fn}(): PokemonSpeciesData {
  return {
    species: {
      speciesId: SpeciesId.${E},
      generation: ${Number(s.generation) || 1},
      type1: PokemonType.${enumName(s.primaryType || 'NORMAL')},
      type2: ${s.secondaryType ? `PokemonType.${enumName(s.secondaryType)}` : 'null'},
      height: ${Number(s.height) || 1},
      weight: ${Number(s.weight) || 1},
      ability1: ${enumRef('AbilityId', s.ability1)},
      ability2: ${enumRef('AbilityId', s.ability2)},
      abilityHidden: ${enumRef('AbilityId', s.hiddenAbility)},
      baseTotal: ${baseTotal(st)},
      baseHp: ${Number(st.hp) || 1}, baseAtk: ${Number(st.attack) || 1}, baseDef: ${Number(st.defense) || 1},
      baseSpatk: ${Number(st.specialAttack) || 1}, baseSpdef: ${Number(st.specialDefense) || 1}, baseSpd: ${Number(st.speed) || 1},
      catchRate: ${Number(s.captureRate) || 45}, baseFriendship: ${Number(s.baseFriendship) || 50},
      baseExp: ${Number(s.baseExp) || 64}, growthRate: GrowthRate.${enumName(s.growthRate || 'MEDIUM_FAST')},
      malePercent: ${malePercent}, genderDiffs: false,
    },
    evolutions: [${evolutions.join(', ')}],
    passives: ${enumRef('AbilityId', s.passiveAbility)},
    levelMoves: [${levelMoves.join(', ')}],
    tms: [${(s.tmMoves || []).map(m => `MoveId.${enumName(m)}`).join(', ')}],
    ${s.availability?.starters === false ? '' : `starterCost: ${Number(s.starterCost) || 1},`}
  };
}
generationOneSpeciesData[SpeciesId.${E}] = ${fn}();`)
  }
  return lines.join('\n\n')
}

function eggMoveBody(custom) {
  return custom.map(s => {
    const E = s.enumName || enumName(s.speciesId)
    const moves = (s.eggMoves || []).slice(0, 4).map(m => `MoveId.${enumName(m)}`)
    while (moves.length < 4) moves.push('MoveId.NONE')
    return `  [SpeciesId.${E}]: [ ${moves.join(', ')} ],`
  }).join('\n')
}

function categoryForFile(file) {
  const p = file.replaceAll('\\', '/').toLowerCase()
  if (/biome|wild|encounter/.test(p)) return 'wildEncounters'
  if (/starter/.test(p)) return 'starters'
  if (/egg/.test(p)) return 'eggs'
  if (/trainer/.test(p)) return 'trainers'
  if (/boss/.test(p)) return 'bosses'
  if (/reward|mystery|voucher/.test(p)) return 'specialRewards'
  return null
}

function applyAvailabilityOverrides(project, layout, manifest, owner, changes) {
  const overrides = manifest.availabilityOverrides || []
  if (!overrides.length) return
  const tsFiles = walk(layout.srcDir, f => /\.(ts|tsx)$/.test(f))
  for (const file of tsFiles) {
    const category = categoryForFile(file)
    if (!category) continue
    let source = fs.readFileSync(file, 'utf8'), next = source
    for (const o of overrides) {
      if (o.availability?.[category] !== false) continue
      const E = o.enumName || enumName(o.speciesId)
      const marker = `MOD-STUDIO DISABLED ${owner}:${category}:${E}`
      const lines = next.split('\n')
      next = lines.map(line => {
        if (line.includes(marker)) return line
        if (!line.includes(`SpeciesId.${E}`)) return line
        const trimmed = line.trim()
        // Only disable declarative table entries. Never alter imports, conditions, or executable statements.
        if (!/^[\[({]?\s*(SpeciesId\.|\[SpeciesId\.)/.test(trimmed) && !trimmed.includes(`: SpeciesId.${E}`)) return line
        const indent = line.match(/^\s*/)?.[0] || ''
        return `${indent}// ${marker} | ${trimmed}`
      }).join('\n')
    }
    if (next !== source) changes.set(file, next)
  }
}


function addCustomWildEncounters(layout, manifest, owner, changes) {
  const candidates = walk(layout.srcDir, f => /\.(ts|tsx)$/.test(f) && categoryForFile(f) === 'wildEncounters')
  for (const species of manifest.customSpecies || []) {
    if (species.availability?.wildEncounters === false) continue
    const E = species.enumName || enumName(species.speciesId)
    for (const biome of species.biomes || []) {
      const B = enumName(biome)
      let installed = false
      for (const file of candidates) {
        const original = changes.get(file) || fs.readFileSync(file, 'utf8')
        if (original.includes(`MOD-STUDIO SPAWN ${owner}:${B}:${E}`)) { installed = true; break }
        const biomePatterns = [`BiomeId.${B}`, `Biome.${B}`, `[BiomeId.${B}]`, `[Biome.${B}]`]
        let hit = -1
        for (const pattern of biomePatterns) { hit = original.indexOf(pattern); if (hit >= 0) break }
        if (hit < 0) continue
        // Insert into the first declarative array following the biome key. This is intentionally
        // conservative: if no nearby array is found, no source is changed.
        const arrayStart = original.indexOf('[', hit + 1)
        if (arrayStart < 0 || arrayStart - hit > 500) continue
        const marker = `// MOD-STUDIO SPAWN ${owner}:${B}:${E}`
        const insertion = `\n    SpeciesId.${E}, ${marker}`
        changes.set(file, original.slice(0, arrayStart + 1) + insertion + original.slice(arrayStart + 1))
        installed = true
        break
      }
      if (!installed) console.warn(`⚠ Could not automatically locate biome ${B} for ${E}; species remains registered but was not added to that wild pool.`)
    }
  }
}

function planAssets(project, layout, manifest, operations) {
  for (const s of manifest.customSpecies || []) {
    const id = Number(s.speciesNumber)
    const donor = Number(s.spriteDonorDex || s.spriteKey)
    if (layout.pokemonImages && Number.isInteger(donor) && donor > 0) {
      for (const suffix of ['.png']) {
        const from = path.join(layout.pokemonImages, `${donor}${suffix}`), to = path.join(layout.pokemonImages, `${id}${suffix}`)
        if (fs.existsSync(from)) operations.push({ type: 'copy', from, to })
      }
      const variantFrom = path.join(layout.pokemonImages, 'variant', `${donor}.json`)
      if (fs.existsSync(variantFrom)) operations.push({ type: 'copy', from: variantFrom, to: path.join(layout.pokemonImages, 'variant', `${id}.json`) })
    }
    const cryDonor = Number(s.cryDonorDex || donor)
    if (layout.cryDir && Number.isInteger(cryDonor) && cryDonor > 0) {
      for (const ext of ['.m4a', '.ogg', '.mp3']) {
        const from = path.join(layout.cryDir, `${cryDonor}${ext}`)
        if (fs.existsSync(from)) { operations.push({ type: 'copy', from, to: path.join(layout.cryDir, `${id}${ext}`) }); break }
      }
    }
  }
}

function writeTransaction(project, owner, changes, copies, dryRun) {
  const stateRoot = path.join(project, STATE_DIR), modRoot = path.join(stateRoot, 'mods', owner), backupRoot = path.join(modRoot, 'backups')
  const journal = { owner, installedAt: new Date().toISOString(), files: [], copies: [] }
  console.log(`\nPlanned text changes: ${changes.size}; asset copies: ${copies.length}`)
  for (const [file, content] of changes) console.log(`  edit ${rel(project, file)} (${sha256(content).slice(0, 10)})`)
  for (const op of copies) console.log(`  copy ${rel(project, op.from)} -> ${rel(project, op.to)}`)
  if (dryRun) return

  ensureDir(backupRoot)
  try {
    for (const [file, content] of changes) {
      const relative = rel(project, file), backup = path.join(backupRoot, relative)
      ensureDir(path.dirname(backup)); fs.copyFileSync(file, backup)
      const temp = `${file}.modstudio.tmp`; fs.writeFileSync(temp, content, 'utf8'); fs.renameSync(temp, file)
      journal.files.push({ path: relative, backup: rel(project, backup), beforeHash: sha256(fs.readFileSync(backup)), afterHash: sha256(content) })
    }
    for (const op of copies) {
      ensureDir(path.dirname(op.to))
      if (fs.existsSync(op.to)) {
        const backup = path.join(backupRoot, rel(project, op.to)); ensureDir(path.dirname(backup)); fs.copyFileSync(op.to, backup)
        journal.copies.push({ path: rel(project, op.to), backup: rel(project, backup), existed: true })
      } else journal.copies.push({ path: rel(project, op.to), existed: false })
      fs.copyFileSync(op.from, op.to)
    }
    ensureDir(modRoot); fs.writeFileSync(path.join(modRoot, 'journal.json'), JSON.stringify(journal, null, 2))
  } catch (error) {
    console.error('Installation failed; rolling back transaction.')
    rollback(project, journal)
    throw error
  }
}

function rollback(project, journal) {
  for (const item of [...(journal.files || [])].reverse()) if (item.backup && fs.existsSync(path.join(project, item.backup))) fs.copyFileSync(path.join(project, item.backup), path.join(project, item.path))
  for (const item of [...(journal.copies || [])].reverse()) {
    const target = path.join(project, item.path)
    if (item.existed && item.backup && fs.existsSync(path.join(project, item.backup))) fs.copyFileSync(path.join(project, item.backup), target)
    else if (fs.existsSync(target)) fs.rmSync(target)
  }
}

function uninstall(project, owner, dryRun) {
  const journalFile = path.join(project, STATE_DIR, 'mods', owner, 'journal.json')
  if (!fs.existsSync(journalFile)) die(`No installed mod journal found for "${owner}".`)
  const journal = readJson(journalFile)
  console.log(`Restoring ${journal.files.length} edited files and ${journal.copies.length} copied assets.`)
  if (!dryRun) { rollback(project, journal); fs.rmSync(path.dirname(journalFile), { recursive: true, force: true }) }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.project || (!args.manifest && !args.uninstall)) {
    console.log('Usage:\n  node pokerogue-mod-installer.cjs --manifest <project.json> --project <game-root> [--dry-run]\n  node pokerogue-mod-installer.cjs --project <game-root> --uninstall <mod-id> [--dry-run]')
    process.exit(args.help ? 0 : 1)
  }
  const project = path.resolve(args.project)
  if (args.uninstall) { uninstall(project, args.uninstall, args.dryRun); console.log(args.dryRun ? '\nDry-run uninstall passed.' : '\n✓ Mod uninstalled and original files restored.'); return }

  const manifest = readJson(path.resolve(args.manifest)), owner = enumName(manifest.mod?.id || 'local-custom-species').toLowerCase()
  const existingJournal = path.join(project, STATE_DIR, 'mods', owner, 'journal.json')
  if (fs.existsSync(existingJournal)) {
    if (!args.force) die(`Mod "${owner}" is already installed. Uninstall it first, or pass --force to restore the prior transaction before reinstalling.`)
    if (args.dryRun) die('--force cannot be combined with --dry-run when replacing an installed mod; uninstall first for a clean preflight.')
    const oldJournal = readJson(existingJournal)
    rollback(project, oldJournal)
    fs.rmSync(path.dirname(existingJournal), { recursive: true, force: true })
    console.log(`Restored the previous ${owner} transaction before reinstalling.`)
  }
  const layout = detectLayout(project), originalEnum = readText(layout.speciesId), registry = parseSpeciesEnum(originalEnum)
  validateManifest(manifest, registry)
  const changes = new Map(), custom = manifest.customSpecies || []

  if (custom.length) {
    changes.set(layout.speciesId, replaceOwnedBlock(originalEnum, owner, 'species-enum', speciesEnumBody(custom), src => src.lastIndexOf('}')))
    const generation = readText(layout.generation)
    changes.set(layout.generation, replaceOwnedBlock(generation, owner, 'species-registry', speciesRegistryBody(custom), src => {
      const match = src.match(/\n\s*return\s+generationOneSpeciesData\s*;/)
      return match ? match.index + 1 : -1
    }))
    if (layout.eggMoves) {
      const egg = readText(layout.eggMoves)
      changes.set(layout.eggMoves, replaceOwnedBlock(egg, owner, 'egg-moves', eggMoveBody(custom), src => {
        const i = src.indexOf('} satisfies Partial<Record<SpeciesId')
        return i >= 0 ? i : src.lastIndexOf('}')
      }))
    }
  }

  applyAvailabilityOverrides(project, layout, manifest, owner, changes)
  addCustomWildEncounters(layout, manifest, owner, changes)
  const copies = []; planAssets(project, layout, manifest, copies)
  writeTransaction(project, owner, changes, copies, args.dryRun)
  console.log(args.dryRun ? '\n✓ Preflight passed. Nothing was changed.' : `\n✓ Installed ${manifest.mod?.name || owner}. Rebuild the PokéRogue project, then launch it.`)
}

try { main() } catch (error) { die(error.stack || error.message) }
