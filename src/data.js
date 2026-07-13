// Pokerogue Pokemon Creator - core schema & seed data
//
// This file previously broke: an interrupted auto-generation pass left it
// only exporting ITEM_OPTIONS, silently dropping every other export
// App.jsx needs (TYPES, GROWTH_RATES, VARIANT_OPTIONS, INITIAL_POKEMON_DATA,
// createDefaultPokemon, createDefaultForm, resolvedSpriteKey, variantLabel).
// Restored here, and re-exporting the real enumerated lists from
// options.generated.js (which had good data but nothing importing it).

export {
  ABILITY_OPTIONS,
  MOVE_OPTIONS,
  BIOME_OPTIONS,
  FORM_KEY_OPTIONS,
  EVOLUTION_ITEM_OPTIONS,
} from './options.generated.js'

export const TYPES = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK',
  'STEEL', 'FAIRY', 'STELLAR',
]

export const GROWTH_RATES = [
  'ERRATIC', 'FLUCTUATING', 'MEDIUM_SLOW', 'MEDIUM_FAST', 'FAST', 'SLOW',
]

// --- Shiny variant tiers ---------------------------------------------------
// "16n"/"32n"/"64n" are not sprite-filename suffixes — they're the real
// game's DexAttr BigInt flags (src/enums/dex-attr.ts): DEFAULT_VARIANT=16n,
// VARIANT_2=32n, VARIANT_3=64n, which map to Pokemon.variant = 0 | 1 | 2.
// Mega/Gigantamax are a *separate* system (SpeciesFormKey, see
// FORM_KEY_OPTIONS above) — not part of this list, and set independently
// via the formKey field already wired up on the Evolution tab.
export const VARIANT_OPTIONS = [
  { value: '', label: 'Not Shiny' },
  { value: 'VARIANT_1', label: 'Shiny \u2014 Variant 1 (16n)' },
  { value: 'VARIANT_2', label: 'Shiny \u2014 Variant 2 (32n)' },
  { value: 'VARIANT_3', label: 'Shiny \u2014 Variant 3 (64n)' },
]

export function variantLabel(variant) {
  const found = VARIANT_OPTIONS.find(v => v.value === variant)
  return found ? found.label : 'Not Shiny'
}

// The real game resolves the actual sprite asset internally from
// shiny/variant/formIndex (Pokemon.getSpriteId / getSpriteAtlasPath) — this
// Tool only needs to produce correct data, not a real file path. Kept as a
// function (rather than inlining pokemon.spriteKey everywhere) so that
// contract stays explicit and centralized in one place.
export function resolvedSpriteKey(spriteKey) {
  return spriteKey || ''
}

function titleCase(id) {
  return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function stubSpecies(speciesId, speciesNumber) {
  return {
    speciesId, name: titleCase(speciesId), speciesNumber, category: 'Unknown',
    height: 1, weight: 10, genderRatio: 50, isLegendary: false, isMythical: false, isStarter: false,
    generation: 1, primaryType: 'NORMAL', secondaryType: null,
    ability1: '', ability2: null, hiddenAbility: null, passiveAbility: null,
    baseStats: { hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 },
    variant: '', formKey: '',
    preEvolution: null,
    evolutions: [],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: [], forms: [],
    heldItems: [],
    spriteKey: speciesId, iconKey: speciesId, passives: [],
    biomes: [], spawnLevels: { min: 1, max: 10 }, flags: [],
    growthRate: 'MEDIUM_FAST', baseFriendship: 70, captureRate: 45, baseExp: 64,
    availability: { wildEncounters: true, starters: true, eggs: true, trainers: true, bosses: true, specialRewards: true },
  }
}

// Small fallback seed — only used if the runtime fetch of pokemon_data.json
// fails (see loadPokemonData() in App.jsx). The real, full roster lives in
// pokemon_data.json.
export const INITIAL_POKEMON_DATA = [
  {
    ...stubSpecies('bulbasaur', 1), category: 'Seed', height: 0.7, weight: 6.9, genderRatio: 12.5,
    primaryType: 'GRASS', secondaryType: 'POISON', ability1: 'OVERGROW', hiddenAbility: 'CHLOROPHYLL',
    baseStats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
    evolutions: [{ speciesId: 'ivysaur', level: 16, variant: '', formKey: '' }],
    biomes: ['GRASS', 'FOREST'], spawnLevels: { min: 3, max: 5 }, growthRate: 'MEDIUM_SLOW', baseExp: 64,
  },
  {
    ...stubSpecies('charmander', 4), category: 'Lizard', height: 0.6, weight: 8.5, genderRatio: 12.5,
    primaryType: 'FIRE', ability1: 'BLAZE', hiddenAbility: 'SOLAR_POWER',
    baseStats: { hp: 39, attack: 52, defense: 43, specialAttack: 60, specialDefense: 50, speed: 65 },
    evolutions: [{ speciesId: 'charmeleon', level: 16, variant: '', formKey: '' }],
    biomes: ['MOUNTAIN'], spawnLevels: { min: 3, max: 5 }, growthRate: 'MEDIUM_SLOW', baseExp: 62,
  },
  {
    ...stubSpecies('squirtle', 7), category: 'Tiny Turtle', height: 0.5, weight: 9, genderRatio: 12.5,
    primaryType: 'WATER', ability1: 'TORRENT', hiddenAbility: 'RAIN_DISH',
    baseStats: { hp: 44, attack: 48, defense: 65, specialAttack: 50, specialDefense: 64, speed: 43 },
    evolutions: [{ speciesId: 'wartortle', level: 16, variant: '', formKey: '' }],
    biomes: ['OCEAN'], spawnLevels: { min: 3, max: 5 }, growthRate: 'MEDIUM_SLOW', baseExp: 63,
  },
  {
    ...stubSpecies('pikachu', 25), category: 'Mouse', height: 0.4, weight: 6, genderRatio: 50,
    primaryType: 'ELECTRIC', ability1: 'STATIC', hiddenAbility: 'LIGHTNING_ROD', preEvolution: 'pichu',
    baseStats: { hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90 },
    evolutions: [{ speciesId: 'raichu', item: 'THUNDER_STONE', variant: '', formKey: '' }],
    biomes: ['GRASS'], spawnLevels: { min: 2, max: 4 }, growthRate: 'MEDIUM_FAST', captureRate: 190, baseExp: 82,
  },
  {
    ...stubSpecies('mewtwo', 150), category: 'Genetic', height: 2, weight: 122, genderRatio: -1, isLegendary: true,
    primaryType: 'PSYCHIC', ability1: 'PRESSURE', hiddenAbility: 'UNNERVE', passiveAbility: 'PSYCHIC_INTIMIDATE',
    preEvolution: 'mew',
    baseStats: { hp: 106, attack: 110, defense: 90, specialAttack: 154, specialDefense: 90, speed: 130 },
    biomes: ['CAVE'], spawnLevels: { min: 70, max: 100 }, growthRate: 'SLOW', baseFriendship: 0, captureRate: 3, baseExp: 220,
    passives: ['PSYCHIC_SHOCK'],
  },
  {
    ...stubSpecies('mew', 151), category: 'New Species', height: 0.4, weight: 4, genderRatio: -1, isMythical: true,
    primaryType: 'PSYCHIC', ability1: 'SYNCHRONIZE',
    baseStats: { hp: 100, attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 },
    biomes: ['FOREST'], spawnLevels: { min: 50, max: 70 }, growthRate: 'MEDIUM_FAST', baseExp: 64,
  },
]

export function createDefaultPokemon(speciesNumber, name) {
  return stubSpecies((name || `pokemon-${speciesNumber}`).toLowerCase().replace(/\s+/g, '_'), speciesNumber)
}

export function createDefaultForm() {
  return {
    formKey: '',
    formName: '',
    spriteKey: '',
    iconKey: '',
    primaryType: '',
    secondaryType: '',
    isMegaForm: false,
    isBattleForm: false,
  }
}
