#!/usr/bin/env python3
"""Fetch Pokemon data from PokeAPI and generate JSON for the Tool."""

import json
import urllib.request
import urllib.error
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Generate Pokemon data for all 1025 species (Gen 1-9)
POKEMON_COUNT = 1025

def fetch_pokemon(pokemon_id):
    """Fetch basic Pokemon data from PokeAPI."""
    url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'PokemonCreatorTool/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return pokemon_id, json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching {pokemon_id}: {e}")
        return pokemon_id, None

def to_species_id(name):
    """Convert Pokemon name to speciesId format (lowercase with underscores)."""
    name = name.lower().replace("♀", "-f").replace("♂", "-m").replace(" ", "-").replace(".", "").replace("'", "").replace("é", "e").replace(":", "").replace("'", "")
    # Handle special cases
    name = name.replace("mr-mime", "mr_mime").replace("mime-jr", "mime_jr").replace("flabebe", "flabebe").replace("type-null", "type_null").replace("jangmo-o", "jangmo_o").replace("hakamo-o", "hakamo_o").replace("kommo-o", "kommo_o").replace("tapu-koko", "tapu_koko").replace("tapu-lele", "tapu_lele").replace("tapu-bulu", "tapu_bulu").replace("tapu-fini", "tapu_fini").replace("sinistea-ph", "sinistea").replace("sinistea-ph", "sinistea").replace("polteageist-ph", "polteageist").replace("mr-rime", "mr_rime").replace("mlle-norm", "mademoiselle_norm").replace("pkmn-norm", "pokemon_norm").replace("kyurem-black", "kyurem_black").replace("kyurem-white", "kyurem_white").replace("keldeo-resolute", "keldeo_resolute").replace("meloetta-pirouette", "meloetta_pirouette").replace("meowstic-female", "meowstic_female").replace("aegislash-blade", "aegislash_blade").replace("aegislash-shield", "aegislash_shield").replace("pumpkaboo-small", "pumpkaboo_small").replace("pumpkaboo-large", "pumpkaboo_large").replace("pumpkaboo-super", "pumpkaboo_super").replace("gourgeist-small", "gourgeist_small").replace("gourgeist-large", "gourgeist_large").replace("gourgeist-super", "gourgeist_super").replace("wishiwashi-school", "wishiwashi_school").replace("minior-red-meteor", "minior_red_meteor").replace("minior-orange", "minior_orange").replace("minior-yellow", "minior_yellow").replace("minior-green", "minior_green").replace("minior-blue", "minior_blue").replace("minior-indigo", "minior_indigo").replace("minior-violet", "minior_violet").replace("magearna-original", "magearna_original").replace("toxtricity-low-key", "toxtricity_low_key").replace("eiscue-ice", "eiscue_ice").replace("eiscue-noice", "eiscue_noice").replace("indeedee-female", "indeedee_female").replace("morpeko-belly-drum", "morpeko_belly_drum").replace("zacian-crowned-sword", "zacian_crowned_sword").replace("zacian-crowned-shield", "zacian_crowned_shield").replace("zamazenta-crowned-sword", "zamazenta_crowned_sword").replace("zamazenta-crowned-shield", "zamazenta_crowned_shield").replace("eternatus-eternamax", "eternatus_eternamax").replace("urshifu-rapid-strike", "urshifu_rapid_strike").replace("wo-chien", "wo_chien").replace("chien-pao", "chien_pao").replace("ting-lu", "ting_lu").replace("chi-yu", "chi_yu").replace("wo-chien", "wo_chien")
    return name

def process_pokemon(pokemon_id, data):
    """Convert PokeAPI data to Tool format."""
    species_id = to_species_id(data['name'])
    name = data['name'].replace("-", " ").title()
    if data['name'].endswith('-f'):
        name = name.replace(" F", " ♀").replace("-f", "")
    elif data['name'].endswith('-m'):
        name = name.replace(" M", " ♂").replace("-m", "")
    
    types = [t['type']['name'].upper() for t in data['types']]
    primary_type = types[0]
    secondary_type = types[1] if len(types) > 1 else None
    
    stats = {stat['stat']['name']: stat['base_stat'] for stat in data['stats']}
    
    return {
        "speciesId": species_id,
        "name": name,
        "speciesNumber": data['id'],
        "category": f"{name.split()[0]} Pokemon",
        "height": data['height'] / 10,
        "weight": data['weight'] / 10,
        "genderRatio": 50,
        "isLegendary": False,
        "isMythical": False,
        "generation": 1,
        "primaryType": primary_type,
        "secondaryType": secondary_type,
        "ability1": "NONE",
        "ability2": None,
        "hiddenAbility": None,
        "passiveAbility": None,
        "baseStats": {
            "hp": stats.get('hp', 50),
            "attack": stats.get('attack', 50),
            "defense": stats.get('defense', 50),
            "specialAttack": stats.get('special-attack', 50),
            "specialDefense": stats.get('special-defense', 50),
            "speed": stats.get('speed', 50)
        },
        "preEvolution": None,
        "evolutions": [],
        "learnset": [],
        "tmPool": [],
        "eggMoves": [],
        "levelUpMoves": {},
        "forms": [],
        "spriteKey": species_id,
        "iconKey": species_id,
        "passives": [],
        "biomes": [],
        "spawnLevels": {"min": 1, "max": 100},
        "flags": [],
        "growthRate": "MEDIUM_FAST",
        "baseFriendship": 50,
        "captureRate": 45,
        "baseExp": 100,
        "heldItems": []
    }

def main():
    print(f"Fetching {POKEMON_COUNT} Pokemon from PokeAPI...")
    
    # Fetch all Pokemon using thread pool
    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_pokemon, i): i for i in range(1, POKEMON_COUNT + 1)}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 100 == 0:
                print(f"Progress: {completed}/{POKEMON_COUNT}")
            pokemon_id, data = future.result()
            if data:
                results[pokemon_id] = data
    
    # Sort by ID and convert to Tool format
    pokemon_list = []
    for i in range(1, POKEMON_COUNT + 1):
        if i in results:
            pokemon_list.append(process_pokemon(i, results[i]))
        else:
            # Placeholder for failed fetches
            pokemon_list.append({
                "speciesId": f"unknown_{i}",
                "name": f"Unknown #{i}",
                "speciesNumber": i,
                "category": "Unknown",
                "height": 0,
                "weight": 0,
                "genderRatio": 50,
                "isLegendary": False,
                "isMythical": False,
                "generation": 1,
                "primaryType": "NORMAL",
                "secondaryType": None,
                "ability1": "NONE",
                "ability2": None,
                "hiddenAbility": None,
                "passiveAbility": None,
                "baseStats": {"hp": 50, "attack": 50, "defense": 50, "specialAttack": 50, "specialDefense": 50, "speed": 50},
                "preEvolution": None,
                "evolutions": [],
                "learnset": [],
                "tmPool": [],
                "eggMoves": [],
                "levelUpMoves": {},
                "forms": [],
                "spriteKey": f"unknown_{i}",
                "iconKey": f"unknown_{i}",
                "passives": [],
                "biomes": [],
                "spawnLevels": {"min": 1, "max": 100},
                "flags": [],
                "growthRate": "MEDIUM_FAST",
                "baseFriendship": 50,
                "captureRate": 45,
                "baseExp": 100,
                "heldItems": []
            })
    
    print(f"Fetched {len(pokemon_list)} Pokemon")
    
    # Write to JSON file
    output_file = 'dist/assets/pokemon-data.json'
    with open(output_file, 'w') as f:
        json.dump(pokemon_list, f, indent=2)
    
    print(f"Saved to {output_file}")
    
    # Generate JavaScript variable format
    js_output = f"const POKEMON_DATA = {json.dumps(pokemon_list, separators=(',', ':'))};"
    js_file = 'dist/assets/pokemon-data.js'
    with open(js_file, 'w') as f:
        f.write(js_output)
    
    print(f"Saved JS to {js_file}")
    print(f"Total Pokemon: {len(pokemon_list)}")

if __name__ == "__main__":
    main()
