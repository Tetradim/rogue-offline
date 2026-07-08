// Pokerogue Pokemon Creator - seed data
// Schema:
//   - `variant`            on the species itself (its own displayed variant)
//   - `variant` per entry  inside `evolutions[]` (what that evolution stage displays as)
//   - `forms[]`           has shape (formKey/formName/spriteKey/iconKey/types/flags)

export const TYPES = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK',
  'STEEL', 'FAIRY', 'STELLAR',
]

export const GROWTH_RATES = [
  'ERRATIC', 'FLUCTUATING', 'MEDIUM_SLOW', 'MEDIUM_FAST', 'FAST', 'SLOW',
]

export {
  ABILITY_OPTIONS,
  MOVE_OPTIONS,
  BIOME_OPTIONS,
  FORM_KEY_OPTIONS,
  EVOLUTION_ITEM_OPTIONS,
} from './options.generated.js'

// Variant options selectable for a species' own display, or for what an
// evolution stage turns into. Mutually exclusive per stage.
export const VARIANT_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'SHINY_16N', label: '16n Shiny (Gold Star)' },
  { value: 'SHINY_32N', label: '32n Shiny (Silver Star)' },
  { value: 'SHINY_64N', label: '64n Shiny (Red Star)' },
  { value: 'GMAX', label: 'Gigantamax' },
  { value: 'MEGA', label: 'Mega Evolution' },
  { value: 'DYNAMAX', label: 'Dynamax' },
]

// Suffix convention applied to a base spriteKey to resolve the sprite asset
// for a given variant. Adjust here if your asset naming differs.
export function variantSuffix(variant) {
  switch (variant) {
    case 'SHINY_16N': return '_16n'
    case 'SHINY_32N': return '_32n'
    case 'SHINY_64N': return '_64n'
    case 'GMAX': return '_gmax'
    case 'MEGA': return '_mega'
    case 'DYNAMAX': return '_dynamax'
    default: return ''
  }
}

export function resolvedSpriteKey(baseSpriteKey, variant) {
  return `${baseSpriteKey || ''}${variantSuffix(variant)}`
}

export function variantLabel(variant) {
  const found = VARIANT_OPTIONS.find(v => v.value === variant)
  return found ? found.label : 'None'
}

export const INITIAL_POKEMON_DATA = [
  {
    speciesId: 'bulbasaur', name: 'Bulbasaur', speciesNumber: 1, category: 'Seed',
    height: 0.7, weight: 6.9, genderRatio: 12.5, isLegendary: false, isMythical: false,
    generation: 1, primaryType: 'GRASS', secondaryType: 'POISON',
    ability1: 'OVERGROW', ability2: null, hiddenAbility: 'CHLOROPHYLL', passiveAbility: null,
    baseStats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
    variant: '',
    preEvolution: null,
    evolutions: [{ speciesId: 'ivysaur', level: 16, variant: '' }],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'bulbasaur', iconKey: 'bulbasaur', passives: [],
    biomes: ['GRASS', 'FOREST'], spawnLevels: { min: 3, max: 5 }, flags: [],
    growthRate: 'MEDIUM_SLOW', baseFriendship: 70, captureRate: 45, baseExp: 64,
  },
  {
    speciesId: 'charmander', name: 'Charmander', speciesNumber: 4, category: 'Lizard',
    height: 0.6, weight: 8.5, genderRatio: 12.5, isLegendary: false, isMythical: false,
    generation: 1, primaryType: 'FIRE', secondaryType: null,
    ability1: 'BLAZE', ability2: null, hiddenAbility: 'SOLAR_POWER', passiveAbility: null,
    baseStats: { hp: 39, attack: 52, defense: 43, specialAttack: 60, specialDefense: 50, speed: 65 },
    variant: '',
    preEvolution: null,
    evolutions: [{ speciesId: 'charmeleon', level: 16, variant: '' }],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'charmander', iconKey: 'charmander', passives: [],
    biomes: ['MOUNTAIN'], spawnLevels: { min: 3, max: 5 }, flags: [],
    growthRate: 'MEDIUM_SLOW', baseFriendship: 70, captureRate: 45, baseExp: 62,
  },
  {
    speciesId: 'squirtle', name: 'Squirtle', speciesNumber: 7, category: 'Tiny Turtle',
    height: 0.5, weight: 9, genderRatio: 12.5, isLegendary: false, isMythical: false,
    generation: 1, primaryType: 'WATER', secondaryType: null,
    ability1: 'TORRENT', ability2: null, hiddenAbility: 'RAIN_DISH', passiveAbility: null,
    baseStats: { hp: 44, attack: 48, defense: 65, specialAttack: 50, specialDefense: 64, speed: 43 },
    variant: '',
    preEvolution: null,
    evolutions: [{ speciesId: 'wartortle', level: 16, variant: '' }],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'squirtle', iconKey: 'squirtle', passives: [],
    biomes: ['OCEAN'], spawnLevels: { min: 3, max: 5 }, flags: [],
    growthRate: 'MEDIUM_SLOW', baseFriendship: 70, captureRate: 45, baseExp: 63,
  },
  {
    speciesId: 'pikachu', name: 'Pikachu', speciesNumber: 25, category: 'Mouse',
    height: 0.4, weight: 6, genderRatio: 50, isLegendary: false, isMythical: false,
    generation: 1, primaryType: 'ELECTRIC', secondaryType: null,
    ability1: 'STATIC', ability2: null, hiddenAbility: 'LIGHTNING_ROD', passiveAbility: null,
    baseStats: { hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90 },
    variant: '',
    preEvolution: 'pichu',
    evolutions: [{ speciesId: 'raichu', item: 'THUNDER_STONE', variant: '' }],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'pikachu', iconKey: 'pikachu', passives: [],
    biomes: ['GRASS'], spawnLevels: { min: 2, max: 4 }, flags: [],
    growthRate: 'MEDIUM_FAST', baseFriendship: 70, captureRate: 190, baseExp: 82,
  },
  {
    speciesId: 'mewtwo', name: 'Mewtwo', speciesNumber: 150, category: 'Genetic',
    height: 2, weight: 122, genderRatio: -1, isLegendary: true, isMythical: false,
    generation: 1, primaryType: 'PSYCHIC', secondaryType: null,
    ability1: 'PRESSURE', ability2: null, hiddenAbility: 'UNNERVE', passiveAbility: 'PSYCHIC_INTIMIDATE',
    baseStats: { hp: 106, attack: 110, defense: 90, specialAttack: 154, specialDefense: 90, speed: 130 },
    variant: '',
    preEvolution: 'mew',
    evolutions: [],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'mewtwo', iconKey: 'mewtwo', passives: ['PSYCHIC_SHOCK'],
    biomes: ['CAVE'], spawnLevels: { min: 70, max: 100 }, flags: [],
    growthRate: 'SLOW', baseFriendship: 0, captureRate: 3, baseExp: 220,
  },
  {
    speciesId: 'mew', name: 'Mew', speciesNumber: 151, category: 'New Species',
    height: 0.4, weight: 4, genderRatio: -1, isLegendary: false, isMythical: true,
    generation: 1, primaryType: 'PSYCHIC', secondaryType: null,
    ability1: 'SYNCHRONIZE', ability2: null, hiddenAbility: null, passiveAbility: null,
    baseStats: { hp: 100, attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 },
    variant: '',
    preEvolution: null,
    evolutions: [],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: 'mew', iconKey: 'mew', passives: [],
    biomes: ['FOREST'], spawnLevels: { min: 50, max: 70 }, flags: [],
    growthRate: 'MEDIUM_FAST', baseFriendship: 100, captureRate: 45, baseExp: 64,
  },
]

export function createDefaultPokemon(speciesNumber, name) {
  return {
    speciesId: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    speciesNumber,
    category: 'Unknown',
    height: 1, weight: 10, genderRatio: 50, isLegendary: false, isMythical: false,
    generation: 1, primaryType: 'NORMAL', secondaryType: null,
    ability1: '', ability2: null, hiddenAbility: null, passiveAbility: null,
    baseStats: { hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 },
    variant: '',
    preEvolution: null,
    evolutions: [],
    learnset: [], tmPool: [], eggMoves: [], levelUpMoves: {}, forms: [],
    spriteKey: '', iconKey: '', passives: [],
    biomes: [], spawnLevels: { min: 1, max: 10 }, flags: [],
    growthRate: 'MEDIUM_FAST', baseFriendship: 70, captureRate: 45, baseExp: 64,
  }
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
