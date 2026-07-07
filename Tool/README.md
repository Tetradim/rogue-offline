# Pokerogue Pokemon Creator — Tool source (rebuilt)

## Why this exists
The GitHub repo only ever committed the **built** `Tool/dist` bundle — the
actual React source was never checked in on any branch (`main`,
`pokerogue-fork`, `move-audio-to-tetradim` all confirmed). That's why
MiniMax kept failing: it had nothing but a minified bundle to edit.

This folder is a full, clean re-creation of that app's source, recovered
from the bundle's (thankfully still-readable) logic, plus the fixes/
features you asked for.

## What changed vs. the original
1. **Forms tab actually exists now.** In the shipped build, "forms" only
   appeared in a stray keyboard-shortcut array — it was never added to the
   tab bar or to the render switch, so it silently did nothing. There's now
   a real Forms tab (`src/App.jsx` → `FormsTab`) for alternate/regional/
   battle forms, backed by the existing `forms[]` field on each Pokemon.
2. **Variant selection (16n/32n/64n shiny, Gmax/Mega/Dynamax), per
   evolution stage:**
   - Each Pokemon now has its own `variant` field (its own display variant).
   - Each entry in `evolutions[]` now has a `variant` field (what that
     evolution stage displays as).
   - Set these on the **Evolution tab**.
   - The **Sprites tab** shows a live, read-only preview of the resolved
     sprite key for the whole line (pre-evolution → this Pokemon →
     each evolution stage), based on those variant choices.

   Example from your Charmander line:
   - Charmander itself: variant = `SHINY_16N` → sprite key `charmander_16n`
   - Evolves to Charmeleon at level 10: variant = `SHINY_64N` → `charmeleon_64n`
   - (On Charmeleon's own entry) evolves to Charizard at level 20:
     variant = `GMAX` → `charizard_gmax`
   - (On Charizard's own entry) evolves to Ultra Necrozma at level 35

   Note: since each Pokemon is its own data object with its own
   `preEvolution`/`evolutions`, a multi-stage custom chain like this is set
   up one link at a time — edit Charmander to set the Charmeleon link,
   then switch to Charmeleon to set the Charizard link, etc.

3. Sprite-key suffix convention lives in one place: `variantSuffix()` in
   `src/data.js`. If your actual asset naming differs from
   `_16n` / `_32n` / `_64n` / `_gmax` / `_mega` / `_dynamax`, that's the only
   place to change it.

## Structure
```
Tool/
├── src/
│   ├── main.jsx      (entry point)
│   ├── App.jsx        (all tabs + app shell)
│   ├── data.js         (seed data, schema, variant helpers)
│   └── index.css        (full stylesheet, extended with a couple new rules)
├── index.html           (DEV ONLY — used by `npm run dev`, loads /src/main.jsx unbundled)
├── launcher-index.html  (PRODUCTION — copy this OVER your existing Tool/index.html)
├── package.json
├── vite.config.js
└── dist/                (built output — ready to ship, fixed filenames: index.js/index.css)
```

## ⚠️ Important: two different index.html files
This project has two `index.html` files that look similar but are NOT interchangeable:

- **`index.html`** (this folder's root) — the Vite *dev* entry. It loads
  `/src/main.jsx` directly, which only works through Vite's dev server
  (`npm run dev`). A plain static file server (like `Launch.bat.ps1`) can't
  execute raw JSX — opening this file that way gives a blank white screen.
- **`launcher-index.html`** — a plain static HTML file that points at the
  already-built `dist/assets/index.js` / `index.css`. **This is the one
  that goes next to `Launch.bat`** in your actual `Tool/` folder, renamed
  to `index.html` there.

### Installing into your existing Tool folder
1. Copy `src/`, `package.json`, `package-lock.json`, `vite.config.js` in as new files.
2. Copy `dist/` in, **replacing** your existing `Tool/dist/` folder entirely.
3. Copy `launcher-index.html` in, and **rename it to `index.html`**,
   replacing the existing root `Tool/index.html`. Do NOT use this
   project's plain `index.html` for that — that one is dev-only.
4. Leave `Launch.bat`, `Launch.bat.ps1`, `Updater.ps1`, `README.md`,
   `generate_pokemon_data.py`, `update_js.py`, `.gitignore` untouched.

Then launch with `Launch.bat` as usual — no changes to that process.

## Building (only needed if you edit src/ yourself)
```
npm install
npm run dev      # live-reloading dev server, for iterating — open the URL it prints
npm run build    # regenerates dist/ (fixed filenames, so launcher-index.html never goes stale)
```
After `npm run build`, your `launcher-index.html` doesn't need to change —
it always points at `dist/assets/index.js` / `index.css`, and the build
always writes to those exact names now.


## Suggested next step
Since this is now real, readable source under version control, commit it
to the `main` branch (or a new branch) alongside `dist/`, so future changes
don't require reverse-engineering the bundle again.
