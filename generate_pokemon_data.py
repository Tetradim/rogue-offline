#!/usr/bin/env python3
"""Fetch Pokemon data from PokeAPI and generate the Tool's real data file.

FIXED: this previously wrote to dist/assets/pokemon-data.json (hyphenated) —
a location and filename NOTHING in the Tool actually reads. The Tool loads
from public/pokemon_data.json (underscored) at the project root, which is
what npm run build copies into dist/ and Tool/ for you. Confirmed by
checking src/App.jsx's actual fetch('./pokemon_data.json') call, the only
place this data is read. Running the old version of this script did
nothing useful — it silently produced a file nothing consumed.

Also added a retry pass for any Pokemon ID that fails on the first attempt
(the free PokeAPI can rate-limit under 20 concurrent requests, which is
almost certainly what caused Pokemon #514 to go missing) instead of
silently dropping it.
"""

import urllib.request
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_pokemon(pokemon_id):
    """Fetch a single Pokemon's basic data from PokeAPI."""
    url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}/"
    req = urllib.request.Request(url, headers={"User-Agent": "PokemonTool/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
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
                "variant": "",
                "formKey": "",
                "preEvolution": None,
                "evolutions": [],
                "learnset": [],
                "tmPool": [],
                "eggMoves": [],
                "levelUpMoves": [],
                "forms": [],
                "heldItems": [],
                "spriteKey": data["name"].lower(),
                "iconKey": data["name"].lower(),
                "passives": [],
                "biomes": [],
                "spawnLevels": {"min": 1, "max": 100},
                "flags": [],
                "growthRate": "MEDIUM_FAST",
                "baseFriendship": 70,
                "captureRate": 45,
                "baseExp": 64,
            }
    except Exception as e:
        print(f"Error fetching Pokemon {pokemon_id}: {e}")
        return None

def fetch_all(ids, workers=20):
    """Fetch a list of Pokemon IDs concurrently, returning {id: data_or_None}."""
    results = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_pokemon, i): i for i in ids}
        completed = 0
        for future in as_completed(futures):
            pid = futures[future]
            results[pid] = future.result()
            completed += 1
            if completed % 100 == 0:
                print(f"Progress: {completed}/{len(ids)}")
    return results

def main():
    print("Fetching 1025 Pokemon from PokeAPI...")

    all_ids = list(range(1, 1026))
    results = fetch_all(all_ids, workers=20)

    # Retry pass: anything that failed on the first attempt (rate limiting,
    # transient network errors) gets retried once, sequentially and slower,
    # instead of being silently dropped from the final file.
    missing_ids = [pid for pid, data in results.items() if data is None]
    if missing_ids:
        print(f"Retrying {len(missing_ids)} Pokemon that failed on the first pass: {missing_ids}")
        time.sleep(2)
        for pid in missing_ids:
            data = fetch_pokemon(pid)
            if data:
                results[pid] = data
                print(f"  Recovered #{pid} on retry")
            else:
                time.sleep(1)
                data = fetch_pokemon(pid)
                results[pid] = data
                print(f"  {'Recovered' if data else 'STILL MISSING'} #{pid} on second retry")

    pokemon_data = [data for data in results.values() if data is not None]
    pokemon_data.sort(key=lambda x: x["speciesNumber"])

    still_missing = [pid for pid, data in results.items() if data is None]
    if still_missing:
        print(f"WARNING: could not fetch these Pokemon after retries: {sorted(still_missing)}")
        print("The output file will be missing these entries. Re-run this script to try again.")

    # Back up whatever's already there first — this will fully overwrite
    # public/pokemon_data.json, and if you've hand-edited any entries
    # through the Tool's UI and re-exported them here, this is the only
    # copy of that data.
    import os
    import datetime
    if os.path.exists("public/pokemon_data.json"):
        stamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        backup_path = f"public/pokemon_data.{stamp}.bak.json"
        os.rename("public/pokemon_data.json", backup_path)
        print(f"Backed up existing file to {backup_path}")

    # Save to the location the Tool actually reads from.
    with open("public/pokemon_data.json", "w") as f:
        json.dump(pokemon_data, f, indent=2)

    print(f"Fetched {len(pokemon_data)} of 1025 Pokemon")
    print("Saved to public/pokemon_data.json")
    print("Run `npm run build` next — it copies this into dist/ and Tool/ automatically.")

if __name__ == "__main__":
    main()
