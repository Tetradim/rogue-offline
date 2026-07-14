# Pokerogue Pokemon Creator — Tool

## Fixes applied in this pass

**1. `src/data.js` was missing almost every export `App.jsx` needs.**
An interrupted auto-generation left it only exporting `ITEM_OPTIONS` —
`TYPES`, `GROWTH_RATES`, `VARIANT_OPTIONS`, `INITIAL_POKEMON_DATA`,
`createDefaultPokemon`, `createDefaultForm`, `resolvedSpriteKey`,
`variantLabel` were all gone, which would crash the app on load. Restored,
and now re-exports the real `ABILITY_OPTIONS` / `MOVE_OPTIONS` /
`BIOME_OPTIONS` / `FORM_KEY_OPTIONS` / `ITEM_OPTIONS` /
`EVOLUTION_ITEM_OPTIONS` lists from `options.generated.js` (which had good
data but nothing was importing it before).

`VARIANT_OPTIONS` now correctly represents shiny variant *tiers* only
(`Not Shiny` / `Variant 1 (16n)` / `Variant 2 (32n)` / `Variant 3 (64n)` —
the real game's `DexAttr` flags), separate from `FORM_KEY_OPTIONS` (Mega /
Gigantamax / etc, the real `SpeciesFormKey` values) — matching how the
Evolution tab UI already treats them as two separate fields.

**2. `App.jsx` was missing an import.** `EVOLUTION_ITEM_OPTIONS` was used
on the Evolution tab but never imported — a guaranteed crash the moment
that tab rendered. Added to the import list.

**3. The Vite build entry and the launcher entry were the same file,
and kept getting swapped.** This is the third time this exact confusion
has caused a broken launch, so it's fixed structurally now, not just
patched:
- **`dev.html`** (project root) is the real Vite entry — loads
  `/src/main.jsx`, used by `npm run dev` and as the build input.
- **`index.html`** (project root) is now **pure generated output**. A
  `postbuild` script (`postbuild.js`) regenerates it from the build every
  time you run `npm run build`, rewriting asset paths to be correct for
  the launcher (`./dist/assets/...`). **Don't hand-edit `index.html`
  going forward — it gets overwritten on every build.**
- `npm run dev` now auto-opens `/dev.html` so there's no ambiguity there either.

**4. `pokemon_data.json` (all 1025 species) moved into `public/`.**
This is the idiomatic Vite location for a file that needs a runtime
`fetch()` — it now gets copied into `dist/` automatically, and works
correctly in `npm run dev` too. Since the launcher serves the whole
`Tool/` folder and opens `Tool/index.html` (not `dist/index.html`), the
`postbuild` script also copies a matching copy back up to `Tool/pokemon_data.json`
so the existing `fetch('./pokemon_data.json')` call in `App.jsx` keeps
working unchanged. The source of truth is `public/pokemon_data.json`;
the root copy is regenerated on every build (and gitignored).

**5. Fixed an invalid `calc(100%+4px)` in `index.css`** (missing
whitespace around `+`, which is required inside `calc()`) — this was
producing a build warning and silently not applying.

**6. `App.jsx` had a missing state declaration — this was the actual
cause of the blank blue screen.** `pokemonList`/`setPokemonList` was used
throughout the component (loading data into it, filtering it, rendering
from it) but never declared with `useState`. That's a `ReferenceError` on
the very first render, before the component even gets a chance to run its
data-loading effect — which is exactly why your server log showed no
request for `pokemon_data.json` at all; the app crashed before it could
even ask for it. Added `const [pokemonList, setPokemonList] = useState(INITIAL_POKEMON_DATA)`.

**7. A second latent bug in the same area:** the Pokémon Number Picker
modal's row-click handler called `setNewPokemonNumber(...)`, a setter
that doesn't exist in that component's scope (its actual local state is
`selectedNumber`/`setSelectedNumber`). This wouldn't crash on page load,
but would crash the whole app the moment someone clicked a row in that
picker. Fixed to call `setSelectedNumber`.

I verified this pass properly this time — not just that `npm run build`
succeeds, but that the built app actually **renders** correctly: served it
exactly like the launcher does (`python -m http.server` over the raw `Tool/`
folder) and loaded it in a real headless Chrome instance. Confirmed: the
full 1025-species list renders, `pokemon_data.json` loads successfully, and
there are no console/page errors (aside from a harmless missing
`favicon.ico`, which browsers request automatically and doesn't affect
anything).

**8. Wired the Number Picker into the "New Pokemon" flow.** The picker
was only ever reachable from the "🔍 Browse all Pokemon" button while
editing an existing selected Pokemon (to reassign its number) — it was
never reachable when creating a new one, even though that's what the
`setNewPokemonNumber` call (bug #7) was actually trying to do. Added a
matching 🔍 button next to the Species Number field in the "New Pokemon"
modal that opens the same picker; picking a row there now sets the new
Pokemon's starting number instead of reassigning the currently-selected
one. Verified end-to-end with headless Chrome: opened the modal, opened
the picker, clicked a row, confirmed the field updated correctly.

## Structure
```
Tool/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── data.js                 (fixed — see above)
│   ├── options.generated.js    (now actually used, via data.js)
│   └── index.css
├── public/
│   └── pokemon_data.json       (source of truth — all 1025 species)
├── dev.html                    (Vite dev/build entry — don't confuse with index.html)
├── index.html                  (GENERATED — launcher entry, regenerated every build)
├── pokemon_data.json           (GENERATED — copy for the launcher, gitignored)
├── postbuild.js                (regenerates index.html + pokemon_data.json copy)
├── package.json
├── vite.config.js
└── dist/                       (build output)
```

## Building
```
npm install
npm run dev      # opens dev.html automatically, live-reloading
npm run build    # builds dist/, then automatically regenerates index.html
                  # and the root pokemon_data.json copy — nothing manual needed
```
After `npm run build`, `Launch.bat` / `SimpleLaunch.bat` / `LauncherWithUpdater.bat`
all work immediately — no copying files around by hand.

## About the multiple bots touching this repo
There's an `openclaw-test.txt` at the repo root from something called
"OpenClaw," which has git push access to this repo. Between that,
MiniMax, and me, at least three different AI tools have independently
edited this codebase without coordinating — that's very likely why things
have kept drifting and breaking between rounds. Worth being aware of if
things break again after this.

## Fixes (round 15): Windows Script Host error, and a dead Python script

**1. "Windows Script Host... Syntax error" on postbuild.js.** This
happens when `.js` files are double-clicked (or otherwise run directly)
in Windows Explorer — Windows runs them through its old built-in Windows
Script Host engine by default, not Node.js, even with Node installed.
WSH's JScript doesn't understand modern JavaScript at all, so it fails
immediately at the first `import` statement (confirmed: line 6, matching
exactly what the error showed).

You should almost never need to run `postbuild.js` manually — `npm run
build` already calls it automatically as its `postbuild` step, correctly,
through Node. Added **`run-postbuild.bat`** for the rare case you do want
to run it standalone; double-click that instead, and it'll always go
through Node correctly.

**2. `generate_pokemon_data.py` was genuinely dead code — running it did
nothing, and that's the real cause of "Pokemon 514 not found."** Checked
where the Tool actually loads its data (`src/App.jsx`'s
`fetch('./pokemon_data.json')`) against where this script wrote its
output: `dist/assets/pokemon-data.json` — different folder, and a
different filename entirely (hyphen vs. underscore). Nothing in the Tool
or build pipeline ever reads that path. The script wasn't broken so much
as pointed at nothing; it fetched all 1025 Pokémon from PokeAPI for no
reason and the result was silently discarded.

Fixed properly:
- Now writes to `public/pokemon_data.json` — the file the Tool actually
  uses, gets copied automatically into `dist/` and `Tool/` on your next
  `npm run build`.
- Added a retry pass for any Pokémon that fails on the first attempt.
  Fetching all 1025 with 20 concurrent requests against the free PokeAPI
  can hit transient rate-limiting — almost certainly what happened to
  #514. It's now retried (up to twice, with backoff) instead of silently
  dropped from the output.
- Backs up your existing `pokemon_data.json` before overwriting it (this
  script replaces the whole roster with fresh, uncurated PokeAPI
  defaults — if you'd hand-edited anything through the Tool and re-saved
  it to this file, the backup protects that).

You only need to run this script at all if you want to regenerate the
base 1025-species roster from scratch — normal use of the Tool never
requires it.

---

## PokéRogue Mod Studio 1.0 injector

The editor now exports a complete `pokerogue-mod-project.json` using **Export Mod Project** in the top toolbar. The project manifest contains all custom species, immutable project IDs, numeric ID ownership, forms/evolutions, battle data, spawn biomes, and availability overrides for both official and custom species.

### Install a mod on Windows

1. Save every custom species in the editor.
2. Select **Export Mod Project**.
3. Drag the downloaded JSON file onto `Install-Mod.bat`.
4. Enter the root folder of the `rogue-offline` `pokerogue-fork` checkout.
5. The installer runs a no-write preflight first. Confirm only after it passes.
6. Rebuild the game using the fork's normal build command.

Command-line equivalent:

```bat
node pokerogue-mod-installer.cjs --manifest pokerogue-mod-project.json --project C:\Games\rogue-offline --dry-run
node pokerogue-mod-installer.cjs --manifest pokerogue-mod-project.json --project C:\Games\rogue-offline
```

### Uninstall and restore

```bat
node pokerogue-mod-installer.cjs --project C:\Games\rogue-offline --uninstall local_custom_species
```

The exact mod ID is the `mod.id` value in the exported manifest, normalized to lowercase underscores. `Uninstall-Mod.bat` provides an interactive wrapper.

### Safety behavior

- IDs `1-1025` cannot be assigned to custom species.
- The installed game's species enum is scanned before any write.
- Numeric and enum-name collisions stop installation.
- All source edits are planned before writing.
- Every changed file and replaced asset is journaled under `.pokerogue-mod-studio/mods/<mod-id>/`.
- A failed transaction rolls back automatically.
- Uninstall restores original files and assets.
- Reinstalling an installed mod is blocked unless `--force` is supplied; forced reinstall restores the old transaction first.
- Source blocks added by the installer are clearly marked `MOD-STUDIO BEGIN/END`.

### Availability controls

The Availability tab can independently disable:

- Wild encounters
- Starter selection
- Egg pools
- Trainer teams
- Boss encounters
- Special rewards and mystery encounters

Official species are never deleted. The installer disables declarative references in the matching game data tables, preserving species IDs and save compatibility. Custom species with Wild Encounters enabled are inserted into their selected Spawn Biomes when the adapter can safely locate the biome's declarative array. Any biome that cannot be located is reported and left unchanged rather than guessed.

### Supported target

The adapter targets the source layout used by `Tetradim/rogue-offline` on the `pokerogue-fork` branch. Because PokéRogue changes over time, always run `--dry-run` after updating the game. An unfamiliar source layout is rejected instead of patched blindly.
