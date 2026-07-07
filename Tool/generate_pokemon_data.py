#!/usr/bin/env python3
"""Fetch Pokemon data from PokeAPI and generate JSON for the Tool."""

import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_pokemon(pokemon_id):
    """Fetch a single Pokemon's basic data from PokeAPI."""
    url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}/"
    req = urllib.request.Request(url, headers={"User-Agent": "PokemonTool/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read())
            
            # Extract types
            types = data.get("types", [])
            primary_type = types[0]["type"]["name"].upper() if len(types) > 0 else "NORMAL"
            secondary_type = types[1]["type"]["name"].upper() if len(types) > 1 else None
            
            return {
                "speciesId": data["name"].lower(),
                "name": data["name"].title().replace("-", " "),
                "speciesNumber": data["id"],
                "category": f"{data['name'].title().replace('-', ' ')} Pokemon",
                "height": data["height"] / 10.0,
                "weight": data["weight"] / 10.0,
                "genderRatio": 50,
                "isLegendary": False,
                "isMythical": False,
                "generation": (data["id"] - 1) // 151 + 1 if data["id"] <= 1025 else 10,
                "primaryType": primary_type,
                "secondaryType": secondary_type,
                "ability1": "NONE",
                "ability2": None,
                "hiddenAbility": None,
                "passiveAbility": None,
                "baseStats": {
                    "hp": data["stats"][0]["base_stat"],
                    "attack": data["stats"][1]["base_stat"],
                    "defense": data["stats"][2]["base_stat"],
                    "specialAttack": data["stats"][3]["base_stat"],
                    "specialDefense": data["stats"][4]["base_stat"],
                    "speed": data["stats"][5]["base_stat"],
                },
                "preEvolution": None,
                "evolutions": [],
                "learnset": [],
                "tmPool": [],
                "eggMoves": [],
                "levelUpMoves": {},
                "forms": [],
                "spriteKey": data["name"].lower(),
                "iconKey": data["name"].lower(),
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
    except Exception as e:
        print(f"Error fetching Pokemon {pokemon_id}: {e}")
        return None

def main():
    print("Fetching 1025 Pokemon from PokeAPI...")
    
    pokemon_data = []
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_pokemon, i): i for i in range(1, 1026)}
        completed = 0
        for future in as_completed(futures):
            result = future.result()
            if result:
                pokemon_data.append(result)
            completed += 1
            if completed % 100 == 0:
                print(f"Progress: {completed}/1025")
    
    # Sort by species number
    pokemon_data.sort(key=lambda x: x["speciesNumber"])
    
    # Save JSON
    with open("dist/assets/pokemon-data.json", "w") as f:
        json.dump(pokemon_data, f)
    
    # Save JS module
    js_content = f"const POKEMON_DATA = {json.dumps(pokemon_data, separators=(',', ':'))};"
    with open("dist/assets/pokemon-data.js", "w") as f:
        f.write(js_content)
    
    print(f"Fetched {len(pokemon_data)} Pokemon")
    print("Saved to dist/assets/pokemon-data.json")
    print("Saved JS to dist/assets/pokemon-data.js")
    print(f"Total Pokemon: {len(pokemon_data)}")

if __name__ == "__main__":
    main()
