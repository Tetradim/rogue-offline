# PokéRogue Mod Studio

A Windows-first, local/offline authoring and delivery tool for portable PokéRogue evolution-line mods.

The studio creates blank custom species rather than cloning official species. Official Pokémon remain read-only references and can be kept, suppressed from encounter systems, or replaced by a selected custom stage without deleting their IDs.

## Launch the studio

Double-click `Launch.bat` from this `Tool` folder.

The launcher:

1. verifies Node.js 20 or newer;
2. installs local npm dependencies when needed;
3. builds the React application;
4. starts the loopback-only Node companion; and
5. opens the studio in the default browser.

The companion binds only to `127.0.0.1`, serves the production bundle, owns portable project files, opens Windows folder pickers, validates imported assets, analyzes selected game checkouts, and runs delivery transactions.

For development:

```powershell
npm ci
npm run dev
```

## Portable projects

Choose **New Evolution Line**, enter a name, and select a parent folder. Each project is self-contained:

```text
My Evolution Line/
├── project.json
├── assets/
└── .studio/
    ├── autosaves/
    └── delivery/
```

`project.json` contains stable project/stage IDs, complete authoring data, encounter policy, target bindings, and revision metadata. Autosave writes atomically through the local companion.

## Authoring workflows

### Build

Each custom stage supports:

- name, normalized internal slug, category, generation, and growth rate;
- one or two types;
- up to three abilities and a passive;
- dimensions, friendship, capture rate, gender ratio, and classification flags;
- six synchronized base-stat sliders and exact inputs with live BST;
- level-up, TM, and egg moves; and
- alternate forms with independent type, ability, passive, asset variant, starter visibility, change item, and stat overrides.

### Evolution

Create branching evolution edges between custom stages. Supported authoring requirements are level, item, friendship, time of day, known move, and custom package-only notes.

Review rejects cycles, missing stages, duplicate edges, incomplete requirements, and target features the selected checkout cannot install safely.

### Assets

Import project-owned assets:

- sprites and icons: PNG or WebP;
- cries: OGG, WAV, MP3, or M4A; and
- variant metadata: JSON objects.

Imports are limited to 8 MB, stored under the project `assets/` directory, hashed with SHA-256, and validated by file signature. PNG dimensions must be between 1 and 4096 pixels. Delivery rechecks paths and hashes before copying anything.

### Encounters

Custom stages can be placed into named biome pools with weight and level ranges.

Selecting an official Pokémon in the read-only Pokédex enables:

- **Keep** — leave official references unchanged;
- **Suppress** — disable declarative encounter references while preserving the species ID; or
- **Replace** — substitute a selected custom stage in matching declarative tables.

Unrecognized encounter layouts are reported and left unchanged rather than guessed.

### Review and target binding

Choose **Bind PokéRogue checkout** and select any local source checkout. The companion records:

- source-layout adapter;
- package or Git revision;
- species registry and current highest ID;
- collision-free IDs for every custom stage;
- encounter, egg-move, sprite, icon, cry, form, form-change, and evolution-condition capabilities;
- a target fingerprint; and
- warnings for missing or unfamiliar anchors.

Recognized modern and legacy registry shapes are supported. Unknown layouts are rejected. Portable authoring data remains preserved even when a particular checkout cannot install every feature; Review blocks unsafe delivery and identifies the incompatible fields.

## Transactional delivery

The Review tab provides:

- **Preflight plan** — validates the project and checkout, generates a target-specific manifest, and runs the installer with no writes;
- **Install** — requires a passing preflight and journals every edited or copied file;
- **Update** — validates the existing journal, snapshots the installed mod, replaces it, and restores the previous installed transaction if replacement fails;
- **Uninstall / rollback** — restores the exact original source and asset files; and
- **Export package** — creates a portable `.pokerogue-mod-package.json` with the project, manifest, and verified embedded assets.

Transaction journals live inside the selected checkout:

```text
.pokerogue-mod-studio/mods/<mod-id>/
├── journal.json
└── backups/
```

Source blocks inserted by the adapter are bracketed with `MOD-STUDIO BEGIN/END` ownership markers.

## Install a portable package manually

Drag either a current delivery manifest or a `.pokerogue-mod-package.json` onto `Install-Mod.bat`.

The wrapper runs a dry-run first and asks before applying changes. Package assets are decoded into an isolated temporary folder, checked against their SHA-256 hashes, and passed to the same journaled installer.

Command-line equivalent:

```powershell
node pokerogue-mod-package-installer.cjs `
  --input C:\Mods\emberline.pokerogue-mod-package.json `
  --project C:\Games\rogue-offline `
  --dry-run

node pokerogue-mod-package-installer.cjs `
  --input C:\Mods\emberline.pokerogue-mod-package.json `
  --project C:\Games\rogue-offline
```

To uninstall:

```powershell
node pokerogue-mod-installer.cjs `
  --project C:\Games\rogue-offline `
  --uninstall emberline
```

## Safety boundaries

- Official species IDs `1–1025` cannot be assigned to custom stages.
- Existing numeric and enum-name collisions stop delivery.
- Mutation API requests with a supplied foreign Origin are rejected.
- Static files are contained by canonical path and opened-file identity checks.
- Asset uploads cannot escape the portable project.
- Missing target anchors stop the operation.
- Preflight performs no writes.
- Install and uninstall are journaled.
- Failed installs roll back automatically.
- Failed updates restore the previously installed transaction.
- Package assets are hash-verified before installation.
- Unsupported capabilities remain Review errors rather than speculative edits.

## Verification

Run the complete local verification from this folder:

```powershell
npm ci
npm test
npm run build
npm run check:service
npm run check-installer
git diff --check
```

The repository workflow `.github/workflows/mod-studio-verify.yml` performs the same checks on Windows and smoke-tests the production localhost service.

See `BUILD_REPORT.md` for completion evidence and verification scope.
