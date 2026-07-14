#!/usr/bin/env node
// apply-game-patch.cjs
//
// Actually applies an Export Game Patch manifest (downloaded from the
// Pokerogue Pokemon Creator Tool) to your real local pokerogue-beta project
// — inserting the real enum entries, registry block, egg moves, copying
// donor sprite/icon/cry assets under the new IDs, and patching
// select-starter-phase.ts if a Nature or Starting Held Items were set.
//
// This exists because generating a text patch you then hand-copy into five
// different files is still doing the work twice. This script does the
// actual file edits.
//
// USAGE:
//   node apply-game-patch.cjs --manifest my_line_manifest.json --project /path/to/pokerogue-beta [--dry-run]
//
// Options:
//   --manifest <path>       Path to the manifest JSON downloaded from the Tool. Required.
//   --project <path>        Path to the root of your local pokerogue-beta checkout. Required.
//   --generation-file <rel> Path (relative to --project) to the generation-XX.ts file
//                           the registry block should be added to. Default:
//                           src/data/balance/species/generation-01.ts
//   --dry-run               Check every anchor point and print what WOULD change,
//                           without writing or copying anything. Always run this
//                           first.
//
// SAFETY: every text file this script edits gets a timestamped .bak copy
// written next to it before any change is made. Nothing is overwritten
// silently. If ANY anchor point can't be found in ANY file, the whole run
// aborts before writing anything — partial patches are treated as a bug.

const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const args = { dryRun: false, generationFile: 'src/data/balance/species/generation-01.ts' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--manifest') args.manifest = argv[++i]
    else if (a === '--project') args.project = argv[++i]
    else if (a === '--generation-file') args.generationFile = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

function fail(msg) {
  console.error(`\n\u2716 ${msg}\n`)
  process.exit(1)
}

function readFile(p) {
  if (!fs.existsSync(p)) fail(`File not found: ${p}`)
  return fs.readFileSync(p, 'utf-8')
}

function backupAndWrite(filePath, newContent, dryRun) {
  if (dryRun) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bakPath = `${filePath}.${stamp}.bak`
  fs.copyFileSync(filePath, bakPath)
  fs.writeFileSync(filePath, newContent, 'utf-8')
  console.log(`  \u2713 wrote ${filePath}  (backup: ${path.basename(bakPath)})`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.manifest || !args.project) {
    console.log(`
apply-game-patch.cjs — applies an Export Game Patch manifest to your real pokerogue-beta project.

Usage:
  node apply-game-patch.cjs --manifest <manifest.json> --project <path-to-pokerogue-beta> [--dry-run]

Options:
  --manifest <path>        Manifest JSON downloaded from the Tool. Required.
  --project <path>         Root of your local pokerogue-beta checkout. Required.
  --generation-file <rel>  Relative path to the generation-XX.ts file to add to.
                           Default: src/data/balance/species/generation-01.ts
  --dry-run                Check everything, change nothing. Run this first.
`)
    process.exit(args.help ? 0 : 1)
  }

  const manifest = JSON.parse(readFile(args.manifest))
  const project = args.project

  const speciesIdPath = path.join(project, 'src/enums/species-id.ts')
  const generationPath = path.join(project, args.generationFile)
  const eggMovesPath = path.join(project, 'src/data/balance/moves/egg-moves.ts')
  const starterPhasePath = path.join(project, 'src/phases/select-starter-phase.ts')
  const pokemonImagesDir = path.join(project, 'assets/images/pokemon')
  const cryDir = path.join(project, 'assets/audio/cry')

  console.log(`\nApplying "${manifest.lineName}" (${manifest.enumEntries.length} stage(s)) to ${project}`)
  if (args.dryRun) console.log('DRY RUN — nothing will be written.\n')

  // ---- 1. species-id.ts: insert new enum entries before the final `}` ----
  let speciesIdSrc = readFile(speciesIdPath)
  const lastBrace = speciesIdSrc.lastIndexOf('}')
  if (lastBrace === -1) fail(`Couldn't find the closing brace of the SpeciesId enum in ${speciesIdPath}`)
  for (const entry of manifest.enumEntries) {
    if (new RegExp(`\\b${entry.name}\\s*=`).test(speciesIdSrc)) {
      fail(`${entry.name} already exists in species-id.ts — refusing to add a duplicate. ` +
        `Pick a different Start ID / line name in the Tool and re-export.`)
    }
  }
  // Same trailing-comma risk as egg-moves.ts below: the original last enum
  // member might not have a trailing comma. Enums require a comma BETWEEN
  // members even though the last one doesn't strictly need one.
  let speciesIdInsertAt = lastBrace
  const beforeSpeciesIdInsert = speciesIdSrc.slice(0, speciesIdInsertAt).replace(/\s+$/, '')
  if (beforeSpeciesIdInsert.length && !beforeSpeciesIdInsert.endsWith(',') && !beforeSpeciesIdInsert.endsWith('{')) {
    speciesIdSrc = beforeSpeciesIdInsert + ',\n' + speciesIdSrc.slice(speciesIdInsertAt)
    speciesIdInsertAt = beforeSpeciesIdInsert.length + 2
  }
  const enumInsertion = manifest.enumEntries.map(e => `  ${e.name} = ${e.id},\n`).join('')
  const newSpeciesIdSrc = speciesIdSrc.slice(0, speciesIdInsertAt) + enumInsertion + speciesIdSrc.slice(speciesIdInsertAt)
  console.log(`\u2713 species-id.ts: will insert ${manifest.enumEntries.length} enum entr${manifest.enumEntries.length === 1 ? 'y' : 'ies'}`)

  // ---- 2. generation-XX.ts: insert factory block before the return -------
  let generationSrc = readFile(generationPath)
  const returnMarker = /return\s+generationOneSpeciesData;/
  const returnMatches = generationSrc.match(new RegExp(returnMarker, 'g'))
  if (!returnMatches || returnMatches.length !== 1) {
    fail(`Expected exactly one "return generationOneSpeciesData;" in ${generationPath}, found ${returnMatches ? returnMatches.length : 0}. ` +
      `This script only knows how to insert before a single, unambiguous return statement — if your file's structure differs, add the block by hand using generationBlock from the downloaded text patch instead.`)
  }
  const newGenerationSrc = generationSrc.replace(returnMarker, `${manifest.generationBlockRaw}\n  return generationOneSpeciesData;`)
  console.log(`\u2713 ${args.generationFile}: will insert the registry block before the return statement`)

  // ---- 3. egg-moves.ts: insert entries before the closing `}` -------------
  let eggMovesSrc = readFile(eggMovesPath)
  const eggMovesAnchor = '} satisfies Partial<Record<SpeciesId'
  const eggMovesIdx = eggMovesSrc.indexOf(eggMovesAnchor)
  if (eggMovesIdx === -1) {
    fail(`Couldn't find "${eggMovesAnchor}" in ${eggMovesPath} — the real file's structure may have changed since this script was written.`)
  }
  // The entry immediately before our insertion point may be the file's
  // original LAST entry, which (per this file's own style) has no trailing
  // comma. Insert one if needed, or every entry after it becomes a syntax
  // error — caught by testing this against the real file, not assumed away.
  let insertionPoint = eggMovesIdx
  const beforeInsertion = eggMovesSrc.slice(0, insertionPoint)
  const trimmedBefore = beforeInsertion.replace(/\s+$/, '')
  if (trimmedBefore.length && !trimmedBefore.endsWith(',')) {
    eggMovesSrc = trimmedBefore + ',\n' + eggMovesSrc.slice(insertionPoint).replace(/^\s*/, '')
    insertionPoint = trimmedBefore.length + 2 // account for ',\n'
  }
  const eggMoveLines = manifest.eggMoveEntries.map(entry => {
    const moves = entry.moves.map(m => `MoveId.${m}`).join(', ')
    return `  [SpeciesId.${entry.enumName}]: [ ${moves} ],\n`
  }).join('')
  const newEggMovesSrc = eggMovesSrc.slice(0, insertionPoint) + eggMoveLines + eggMovesSrc.slice(insertionPoint)
  console.log(`\u2713 egg-moves.ts: will insert ${manifest.eggMoveEntries.length} entr${manifest.eggMoveEntries.length === 1 ? 'y' : 'ies'}`)

  // ---- 4. select-starter-phase.ts (only if nature/held items set) --------
  let newStarterPhaseSrc = null
  if (manifest.starterPatch) {
    let src = readFile(starterPhasePath)
    const sp = manifest.starterPatch

    if (!src.includes('#modifiers/modifier-type')) {
      const firstImportEnd = src.indexOf('\n', src.indexOf('import'))
      src = src.slice(0, firstImportEnd + 1) + 'import { modifierTypes } from "#modifiers/modifier-type";\n' + src.slice(firstImportEnd + 1)
    }

    if (!src.includes('function grantHeldItem(')) {
      const helper =
        `\nfunction grantHeldItem(pokemon: Pokemon, name: ModifierTypeKeys, count = 1): void {\n` +
        `  const modifierFunc = modifierTypes[name];\n` +
        `  const modifierType = modifierFunc();\n` +
        `  const heldItemModifier = modifierType.withIdFromFunc(modifierFunc).newModifier(pokemon) as PokemonHeldItemModifier;\n` +
        `  if (heldItemModifier) {\n` +
        `    heldItemModifier.pokemonId = pokemon.id;\n` +
        `    heldItemModifier.stackCount = count;\n` +
        `    globalScene.addModifier(heldItemModifier, true, false, false, true);\n` +
        `  }\n}\n`
      const classStart = src.indexOf('export class SelectStarterPhase')
      if (classStart === -1) fail(`Couldn't find "export class SelectStarterPhase" in ${starterPhasePath}`)
      src = src.slice(0, classStart) + helper + '\n' + src.slice(classStart)
    }

    if (sp.nature) {
      const addPlayerAnchor = 'const starterPokemon = globalScene.addPlayerPokemon('
      const idx = src.indexOf(addPlayerAnchor)
      if (idx === -1) fail(`Couldn't find "${addPlayerAnchor}" in ${starterPhasePath}`)
      const natureBlock = `if (starter.speciesId === SpeciesId.${sp.rootEnumName}) {\n        starter.nature = Nature.${sp.nature};\n      }\n      `
      src = src.slice(0, idx) + natureBlock + src.slice(idx)
    }

    if (sp.heldItems.length) {
      const anchor = 'starterPokemon.setVisible(false);'
      const idx = src.indexOf(anchor)
      if (idx === -1) fail(`Couldn't find "${anchor}" in ${starterPhasePath}`)
      const afterAnchor = idx + anchor.length
      const itemLines = sp.heldItems.map(item => `        grantHeldItem(starterPokemon, ${JSON.stringify(item.name)}, ${item.count});`).join('\n')
      const itemBlock = `\n      if (starter.speciesId === SpeciesId.${sp.rootEnumName}) {\n${itemLines}\n      }`
      src = src.slice(0, afterAnchor) + itemBlock + src.slice(afterAnchor)
    }

    newStarterPhaseSrc = src
    console.log(`\u2713 select-starter-phase.ts: will patch nature/held items for ${sp.rootEnumName}`)
  }

  // ---- 5. asset copies ------------------------------------------------
  const assetOps = []
  for (const asset of manifest.assetCopies) {
    if (asset.unresolved) {
      console.log(`\u26a0 ${asset.enumName} (#${asset.id}): sprite donor unresolved, skipping asset copy — set a Sprite Key in the Tool first`)
      continue
    }
    assetOps.push({ from: path.join(pokemonImagesDir, `${asset.spriteDonorDex}.png`), to: path.join(pokemonImagesDir, `${asset.id}.png`) })
    assetOps.push({ from: path.join(pokemonImagesDir, 'variant', `${asset.spriteDonorDex}.json`), to: path.join(pokemonImagesDir, 'variant', `${asset.id}.json`) })
    if (asset.cryDonorDex) {
      assetOps.push({ from: path.join(cryDir, `${asset.cryDonorDex}.m4a`), to: path.join(cryDir, `${asset.id}.m4a`) })
    }
  }
  for (const op of assetOps) {
    if (!fs.existsSync(op.from)) {
      console.log(`\u26a0 asset not found, skipping: ${op.from}`)
    } else {
      console.log(`\u2713 asset: ${path.relative(project, op.from)} -> ${path.relative(project, op.to)}`)
    }
  }

  if (args.dryRun) {
    console.log('\nDry run complete — all anchors found, nothing written. Re-run without --dry-run to apply.\n')
    return
  }

  // ---- actually write everything now that every anchor has been verified --
  console.log('\nWriting changes:')
  backupAndWrite(speciesIdPath, newSpeciesIdSrc, false)
  backupAndWrite(generationPath, newGenerationSrc, false)
  backupAndWrite(eggMovesPath, newEggMovesSrc, false)
  if (newStarterPhaseSrc !== null) backupAndWrite(starterPhasePath, newStarterPhaseSrc, false)

  for (const op of assetOps) {
    if (!fs.existsSync(op.from)) continue
    fs.mkdirSync(path.dirname(op.to), { recursive: true })
    fs.copyFileSync(op.from, op.to)
    console.log(`  \u2713 copied ${path.relative(project, op.to)}`)
  }

  console.log(`\n\u2713 Done. Rebuild your project to see "${manifest.lineName}" in-game.\n`)
}

main()
