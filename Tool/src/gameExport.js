// Game-shaped export: turns a Tool custom evolution line into a paste-ready
// patch matching the REAL pokerogue-beta registry shape (not the Tool's own
// internal JSON shape). Field mappings below were verified directly against
// the user's actual uploaded source files (species-id.ts, generation-01.ts,
// pokemon-species.ts, egg-moves.ts, species-data-registry.ts) — not guessed.
//
// Confirmed real facts this file depends on:
// - SpeciesId is a flat numeric enum. Real dex entries run 1..1025
//   (BULBASAUR..PECHARUNT). The user's own custom lines (Tetradim/Tetrajin)
//   occupy 1985-1999. 1026-1984 is a confirmed-unused gap.
// - Ability/Move/Type/GrowthRate/EvolutionItem string values used elsewhere
//   in this Tool (ABILITY_OPTIONS, MOVE_OPTIONS, etc, from options.generated.js)
//   are already identical to the real enum member names — no translation table
//   needed, just prefix with the enum namespace.
// - Real field names differ from the Tool's own JSON shape:
//     baseStats.attack/defense/specialAttack/specialDefense/speed
//       -> baseAtk/baseDef/baseSpatk/baseSpdef/baseSpd (+ baseTotal, computed)
//     captureRate -> catchRate
//     hiddenAbility -> abilityHidden
//     genderRatio (Tool: % female, -1 = genderless) -> malePercent (100-x, or null)
//     isStarter -> presence of starterCost/eggTier (isStarter() = !!starterCost)
//     preEvolution -> NOT set by hand; the real registry auto-computes it
//       from evolutions[] at startup (initPreEvolutions()).
// - Real egg moves are always exactly 4 per species (confirmed from the
//   user's actual egg-moves.ts), not 5 — the Tool's own cap should match.
// - The real working pattern for a custom line is: one factory function
//   producing N nearly-identical stage species objects (same stats/moves/
//   ability, differing only in id + evolution target), assigned into
//   generationOneSpeciesData[SpeciesId.X] per stage. Confirmed directly from
//   the user's own generation-01.ts (createTetradimSpecies/createTetradimData).
//
// Known, explicitly-flagged gaps (not guessed, left as TODOs in the output):
// - eggTier is genuinely optional in the real type (confirmed: `eggTier?: EggTier`
//   in @types/pokemon-species.ts) — real values are COMMON/RARE/EPIC/LEGENDARY
//   (confirmed from enums/egg-type.ts). Omitted by default; pass eggTier to
//   include it.
// - Nature and starting held items are NOT registry fields at all — confirmed
//   by reading src/phases/select-starter-phase.ts and src/modifier/modifier.ts
//   directly. `starter.nature` is per-save player-selection state (from
//   @types/save-data.ts's Starter interface), and held items are normally
//   granted via a *global* STARTING_HELD_ITEMS_OVERRIDE in overrides.ts (which
//   applies to whichever starter sits in party slot 0, not species-specific).
//   To make these fixed per-species, the only real mechanism is a direct,
//   species-keyed conditional patch inside select-starter-phase.ts's
//   initBattle() loop — generated below as real code, not a TODO.

export const REAL_ID_RANGE_START = 1026
export const REAL_ID_RANGE_END = 1984
export const REAL_DEX_MAX = 1025
export const EGG_TIERS = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']

const STAT_FIELD_MAP = {
  hp: 'baseHp',
  attack: 'baseAtk',
  defense: 'baseDef',
  specialAttack: 'baseSpatk',
  specialDefense: 'baseSpdef',
  speed: 'baseSpd',
}

function toEnumName(speciesIdSlug) {
  return speciesIdSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// PascalCase identifier for function/const names, matching the real
// createTetradimSpecies / createTetradimData naming convention — distinct
// from the SCREAMING_SNAKE_CASE used for the enum member itself.
function toPascalCase(text) {
  return text
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

function abilityRef(name) {
  return name ? `AbilityId.${name}` : 'AbilityId.NONE'
}

function moveRef(name) {
  return `MoveId.${name}`
}

// Walks a custom line starting at `rootSpeciesId`, following evolutions[0]
// repeatedly. Matches the linear (non-branching) structure of every real
// custom line seen in the user's own build. Stops if a link points at a
// speciesId not present in allPokemon, or after a safety cap.
export function getEvolutionChain(rootSpeciesId, allPokemon, maxStages = 20) {
  const bySpeciesId = new Map(allPokemon.map(p => [p.speciesId, p]))
  const chain = []
  let current = bySpeciesId.get(rootSpeciesId)
  const seen = new Set()
  while (current && !seen.has(current.speciesId) && chain.length < maxStages) {
    seen.add(current.speciesId)
    chain.push(current)
    const nextLink = (current.evolutions || [])[0]
    current = nextLink ? bySpeciesId.get(nextLink.speciesId) : undefined
  }
  return chain
}

// Walks BACKWARD via preEvolution from any stage to find the true root of
// its line, so the export feature works no matter which stage you're
// currently viewing \u2014 not just the first one. Previously the Export Game
// Patch panel only rendered on the root stage, which made it disappear the
// moment you navigated to (or set) an evolution target, even though nothing
// about the export itself actually required standing on the root.
export function findRootSpeciesId(speciesId, allPokemon, maxSteps = 20) {
  const bySpeciesId = new Map(allPokemon.map(p => [p.speciesId, p]))
  let current = bySpeciesId.get(speciesId)
  const seen = new Set()
  while (current && current.preEvolution && !seen.has(current.speciesId) && seen.size < maxSteps) {
    seen.add(current.speciesId)
    const prev = bySpeciesId.get(current.preEvolution)
    if (!prev) break
    current = prev
  }
  return current ? current.speciesId : speciesId
}

// Resolves a Tool spriteKey/iconKey (expected to be another Pokemon's own
// speciesId slug, per how the Sprites tab already works) to that Pokemon's
// real dex number, using the already-loaded roster. Returns null if it
// doesn't resolve to a known entry (e.g. a made-up key with no matching
// species), so the checklist can flag it instead of emitting a wrong number.
function resolveDexNumber(key, allPokemon) {
  if (!key) {
    return null
  }
  const match = allPokemon.find(p => p.speciesId === key)
  return match ? match.speciesNumber : null
}

export function buildGameExport({
  chain, allPokemon, startId, lineName,
  starterCost = 1, eggTier = null, nature = null, heldItems = [],
}) {
  if (!chain.length) {
    return { error: 'Empty chain — nothing to export.' }
  }
  if (!Number.isInteger(startId) || startId < REAL_ID_RANGE_START || startId + chain.length - 1 > REAL_ID_RANGE_END) {
    return {
      error: `Start ID must place all ${chain.length} stage(s) within the safe ` +
        `${REAL_ID_RANGE_START}-${REAL_ID_RANGE_END} gap. Requested start: ${startId}.`,
    }
  }

  // Cross-check the proposed ID range against every OTHER Pokemon already in
  // the roster (including your own other custom lines) — not just the global
  // range boundary above. A collision here is exactly the silent
  // last-write-wins identity merge described when this feature was added:
  // whichever species builds last simply overwrites the other under that ID,
  // with no error at build time or in-game.
  const chainSpeciesIds = new Set(chain.map(s => s.speciesId))
  const proposedIds = chain.map((_, i) => startId + i)
  const collisions = []
  for (const other of allPokemon) {
    if (chainSpeciesIds.has(other.speciesId)) {
      continue // a stage colliding with its own previous export is fine
    }
    const idx = proposedIds.indexOf(other.speciesNumber)
    if (idx !== -1) {
      collisions.push({ id: proposedIds[idx], with: other.name, speciesId: other.speciesId })
    }
  }
  if (collisions.length) {
    const details = collisions.map(c => `#${c.id} is already used by "${c.with}" (${c.speciesId})`).join('; ')
    return {
      error: `Can't use this Start ID \u2014 it would collide with Pokemon already in your roster: ${details}. ` +
        `Pick a different Start ID, or rename/renumber the colliding Pokemon first.`,
    }
  }

  const lineSlug = toEnumName(lineName || chain[0].name || chain[0].speciesId)
  const stageEnumNames = chain.map((stage, i) => {
    // First stage keeps the bare line name; later stages get suffixed with
    // their own borrowed-sprite identity, mirroring TETRADIM / TETRADIM_MIMIKYU.
    if (i === 0) {
      return lineSlug
    }
    const donorSlug = stage.spriteKey ? toEnumName(stage.spriteKey) : `STAGE_${i}`
    return `${lineSlug}_${donorSlug}`
  })
  const stageIds = chain.map((_, i) => startId + i)

  const idCollisions = []
  // caller is expected to pass a pre-checked set of already-used real ids;
  // left for the UI layer since this module has no access to species-id.ts.

  // --- 1. enum entries -------------------------------------------------
  const enumLines = chain.map((_, i) => `  ${stageEnumNames[i]} = ${stageIds[i]},`)
  const enumBlock =
    `// Add inside \`export enum SpeciesId { ... }\` in src/enums/species-id.ts\n` +
    `// Placed in the confirmed-unused ${REAL_ID_RANGE_START}-${REAL_ID_RANGE_END} gap.\n` +
    enumLines.join('\n') + '\n'

  // --- 2. generation-XX.ts factory block --------------------------------
  const base = chain[0]
  const type1 = base.primaryType
  const type2 = base.secondaryType || null
  const malePercent = base.genderRatio === -1 || base.genderRatio == null ? null : 100 - base.genderRatio
  const baseStatFields = Object.entries(STAT_FIELD_MAP)
    .map(([toolKey, realKey]) => `    ${realKey}: ${base.baseStats?.[toolKey] ?? 0},`)
    .join('\n')
  const baseTotal = Object.values(base.baseStats || {}).reduce((a, b) => a + (b || 0), 0)

  const levelMovesEntries = (Array.isArray(base.levelUpMoves) ? base.levelUpMoves : [])
    .map(row => `[${row.level}, ${moveRef(row.move)}]`)
    .join(', ')
  const tmEntries = (base.tmPool || []).map(moveRef).join(', ')

  const speciesFactoryFnName = `create${toPascalCase(lineName || lineSlug)}Species`
  const dataFactoryFnName = `create${toPascalCase(lineName || lineSlug)}Data`
  const levelMovesConstName = `${toPascalCase(lineName || lineSlug).charAt(0).toLowerCase()}${toPascalCase(lineName || lineSlug).slice(1)}LevelMoves`

  const speciesFactory =
    `function ${speciesFactoryFnName}(id: SpeciesId): PokemonSpecies {\n` +
    `  return new PokemonSpecies({\n` +
    `    id,\n` +
    `    generation: ${base.generation || 1},\n` +
    `${base.isLegendary ? '    legendary: true,\n' : ''}` +
    `${base.isMythical ? '    mythical: true,\n' : ''}` +
    `    category: ${JSON.stringify(base.category || 'Custom')},\n` +
    `    type1: PokemonType.${type1},\n` +
    `    type2: ${type2 ? `PokemonType.${type2}` : 'null'},\n` +
    `    height: ${base.height ?? 1},\n` +
    `    weight: ${base.weight ?? 1},\n` +
    `    ability1: ${abilityRef(base.ability1)},\n` +
    `    ability2: ${abilityRef(base.ability2)},\n` +
    `    abilityHidden: ${abilityRef(base.hiddenAbility)},\n` +
    `    baseTotal: ${baseTotal},\n` +
    `${baseStatFields}\n` +
    `    catchRate: ${base.captureRate ?? 45},\n` +
    `    baseFriendship: ${base.baseFriendship ?? 70},\n` +
    `    baseExp: ${base.baseExp ?? 64},\n` +
    `    growthRate: GrowthRate.${base.growthRate || 'MEDIUM_FAST'},\n` +
    `    malePercent: ${malePercent === null ? 'null' : malePercent},\n` +
    `    genderDiffs: false,\n` +
    `  });\n` +
    `}\n`

  const levelMovesConst =
    `const ${levelMovesConstName}: [number, MoveId][] = [${levelMovesEntries}];\n`

  const dataFactory =
    `function ${dataFactoryFnName}(\n` +
    `  id: SpeciesId,\n` +
    `  evolution?: SpeciesEvolution,\n` +
    `  isStarterStage = false,\n` +
    `): PokemonSpeciesData {\n` +
    `  return {\n` +
    `    species: ${speciesFactoryFnName}(id),\n` +
    `    evolutions: evolution ? [evolution] : [],\n` +
    `    passives: ${abilityRef(base.passiveAbility)},\n` +
    `    levelMoves: ${levelMovesConstName},\n` +
    `    tms: [${tmEntries}],\n` +
    `    ...(isStarterStage ? { starterCost: ${starterCost}${eggTier ? `, eggTier: EggTier.${eggTier}` : ''} } : {}),\n` +
    `  };\n` +
    `}\n`

  const assignments = chain.map((stage, i) => {
    const nextStage = chain[i + 1]
    const evoLink = nextStage
      ? `new SpeciesEvolution({ speciesId: SpeciesId.${stageEnumNames[i + 1]}, level: ${nextStage && stage.evolutions?.[0]?.level != null ? stage.evolutions[0].level : 1} })`
      : 'undefined'
    return `generationOneSpeciesData[SpeciesId.${stageEnumNames[i]}] = ` +
      `${dataFactoryFnName}(SpeciesId.${stageEnumNames[i]}, ${evoLink}, ${i === 0 ? 'true' : 'false'});`
  }).join('\n')

  const generationBlock =
    `// Add to the appropriate generation-XX.ts (matches your Tetradim/Tetrajin ` +
    `pattern in generation-01.ts)\n\n` +
    speciesFactory + '\n' + levelMovesConst + '\n' + dataFactory + '\n' +
    assignments + '\n'

  // --- 3. egg-moves.ts block --------------------------------------------
  const eggMoves = (base.eggMoves || []).slice(0, 4)
  const eggMoveEntries = []
  for (let i = 0; i < 4; i++) {
    eggMoveEntries.push(eggMoves[i] ? moveRef(eggMoves[i]) : 'MoveId.NONE /* TODO: pick a 4th egg move, real file always has exactly 4 */')
  }
  const eggMovesLine = eggMoveEntries.join(', ')
  const eggMovesBlock =
    `// Add to src/data/balance/moves/egg-moves.ts\n` +
    chain.map((_, i) => `  [SpeciesId.${stageEnumNames[i]}]: [ ${eggMovesLine} ],`).join('\n') + '\n'

  // --- 4. asset checklist -------------------------------------------------
  const assetLines = chain.map((stage, i) => {
    const spriteDexNum = resolveDexNumber(stage.spriteKey, allPokemon)
    const iconDexNum = resolveDexNumber(stage.iconKey, allPokemon)
    const id = stageIds[i]
    const lines = []
    if (spriteDexNum) {
      lines.push(`${id}.png / variant/${id}.json  <-  copy from ${spriteDexNum}.png / variant/${spriteDexNum}.json (${stage.spriteKey})`)
    } else {
      lines.push(`${id}.png  <-  UNRESOLVED sprite key "${stage.spriteKey || '(none set)'}" — set it on the Sprites tab to a real existing species first`)
    }
    if (iconDexNum && iconDexNum !== spriteDexNum) {
      lines.push(`  icon: reuses ${iconDexNum}'s icon frame (${stage.iconKey})`)
    }
    lines.push(`${id}.m4a (cry)  <-  pick a donor cry, no auto-resolution for cries yet`)
    return `Stage ${i + 1} (${stageEnumNames[i]} = ${id}):\n  ` + lines.join('\n  ')
  }).join('\n\n')

  const assetChecklist =
    `// Asset files to copy under assets/images/pokemon/ and assets/audio/cry/\n` +
    `// (paths relative to your pokerogue-beta assets root)\n\n` +
    assetLines + '\n'

  // --- 5. select-starter-phase.ts patch (nature + held items) ------------
  // Confirmed by reading the real file directly: `starter.nature` is
  // per-save player-selection state (not a registry field), and held items
  // are normally granted via a *global* override (STARTING_HELD_ITEMS_OVERRIDE
  // in overrides.ts) that applies to whichever starter is in party slot 0 —
  // not species-specific. The only real mechanism for a fixed per-species
  // nature/held-item set is a direct conditional patch inside initBattle()'s
  // loop, using the same modifierTypes[]/newModifier() calls overrideHeldItems()
  // itself uses (src/modifier/modifier.ts).
  const rootStageName = stageEnumNames[0]
  let starterPatchBlock = null
  if (nature || heldItems.length) {
    const heldItemLines = heldItems.map(item =>
      `      grantHeldItem(starterPokemon, ${JSON.stringify(item.name)}${item.count ? `, ${item.count}` : ''});`
    ).join('\n')
    starterPatchBlock =
      `// Add to src/phases/select-starter-phase.ts\n\n` +
      `// Step 1 — add near the top of the file, alongside the other imports:\n` +
      `import { modifierTypes } from "#modifiers/modifier-type";\n\n` +
      `// Step 2 — add this helper once, anywhere at module scope (grants ONE\n` +
      `//    held item directly to a specific Pokemon; same underlying calls as\n` +
      `//    the real overrideHeldItems, just scoped to one species instead of\n` +
      `//    a global override list):\n` +
      `function grantHeldItem(pokemon: Pokemon, name: ModifierTypeKeys, count = 1): void {\n` +
      `  const modifierFunc = modifierTypes[name];\n` +
      `  const modifierType = modifierFunc();\n` +
      `  const heldItemModifier = modifierType.withIdFromFunc(modifierFunc).newModifier(pokemon) as PokemonHeldItemModifier;\n` +
      `  if (heldItemModifier) {\n` +
      `    heldItemModifier.pokemonId = pokemon.id;\n` +
      `    heldItemModifier.stackCount = count;\n` +
      `    globalScene.addModifier(heldItemModifier, true, false, false, true);\n` +
      `  }\n` +
      `}\n\n` +
      `// Step 3 — inside initBattle, in the starters.forEach loop:\n\n` +
      `// Step 3a — right BEFORE the addPlayerPokemon call, add (only needed\n` +
      `//    if a nature is set below):\n` +
      (nature
        ? `if (starter.speciesId === SpeciesId.${rootStageName}) {\n  starter.nature = Nature.${nature};\n}\n\n`
        : '// (no fixed nature requested for this line)\n\n') +
      `// Step 3b — right AFTER starterPokemon.setVisible(false), add (only\n` +
      `//    needed if held items are set below):\n` +
      (heldItems.length
        ? `if (starter.speciesId === SpeciesId.${rootStageName}) {\n${heldItemLines}\n}\n`
        : '// (no fixed held items requested for this line)\n')
  }

  // --- structured manifest, for the companion apply-game-patch.cjs script --
  // Everything above is human-readable text for review/paste-by-hand. This is
  // the same data in a form a script can consume programmatically to
  // actually perform the file edits, instead of you copying text by hand.
  const manifest = {
    lineName,
    enumEntries: chain.map((_, i) => ({ name: stageEnumNames[i], id: stageIds[i] })),
    functionNames: { speciesFactoryFnName, dataFactoryFnName, levelMovesConstName },
    generationBlockRaw: speciesFactory + '\n' + levelMovesConst + '\n' + dataFactory + '\n' + assignments + '\n',
    eggMoveEntries: chain.map((_, i) => ({
      enumName: stageEnumNames[i],
      moves: (base.eggMoves || []).slice(0, 4).concat(Array(4).fill('NONE')).slice(0, 4),
    })),
    assetCopies: chain.map((stage, i) => {
      const spriteDonorDex = resolveDexNumber(stage.spriteKey, allPokemon)
      const iconDonorDex = resolveDexNumber(stage.iconKey, allPokemon)
      return {
        id: stageIds[i],
        enumName: stageEnumNames[i],
        spriteDonorDex,
        iconDonorDex: iconDonorDex || spriteDonorDex,
        // No separate cry-donor field exists in the Tool yet — defaults to
        // the same donor as the sprite, which is a reasonable default (same
        // species' cry) and can be hand-edited in the downloaded manifest
        // JSON before running the apply script if a different cry is wanted.
        cryDonorDex: spriteDonorDex,
        unresolved: !spriteDonorDex,
      }
    }),
    starterPatch: (nature || heldItems.length) ? {
      rootEnumName: rootStageName,
      nature: nature || null,
      heldItems: heldItems.map(h => ({ name: h.name, count: h.count || 1 })),
    } : null,
  }

  return {
    error: null,
    stageIds,
    stageEnumNames,
    enumBlock,
    generationBlock,
    eggMovesBlock,
    assetChecklist,
    starterPatchBlock,
    manifest,
    manualSteps: [
      'Cry donor defaults to the same donor as the sprite (see the manifest JSON) — hand-edit ' +
        'the downloaded manifest file first if a different cry is wanted before running the apply script.',
      ...(starterPatchBlock ? [] : [
        'No nature or held items were requested for this line, so no ' +
          'select-starter-phase.ts patch was generated.',
      ]),
    ],
  }
}
