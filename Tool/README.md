# PokéRogue Mod Studio

A Windows-first, local/offline authoring and delivery tool for portable custom PokéRogue evolution-line mods.

The studio creates blank custom species. Official Pokémon remain read-only references and can be left unchanged, suppressed from supported wild pools, or replaced by a selected custom stage without deleting their official IDs.

## Requirements

- Windows 10 or newer.
- Node.js 20 or newer.
- For installation: a recognized modern PokéRogue Git checkout with dependencies already installed and a working `typecheck` or `build` npm script.

The target checkout must either be clean or contain only a valid, unchanged Mod Studio installation owned by the project being updated. Unrelated tracked edits block delivery.

## Launch the studio

Double-click `Launch.bat` from this `Tool` folder. It:

1. verifies Node.js 20 or newer;
2. installs this tool's npm dependencies when needed;
3. builds the React application;
4. starts the loopback-only Node companion; and
5. opens the studio in the default browser.

The companion binds only to `127.0.0.1`. There are no accounts, cloud services, telemetry, or remote-access features.

For development:

```powershell
npm ci
npm run dev
```

## Portable projects

Choose **New Evolution Line**, enter a name, and select a parent folder:

```text
My Evolution Line/
├── project.json
├── assets/
└── .studio/
    ├── autosaves/
    ├── asset-transactions/
    └── delivery/
```

`project.json` is authoritative. The companion validates the complete nested project shape, serializes saves per canonical project path, writes autosave history first, and atomically replaces the canonical project file.

Project and stage IDs remain stable when display names change. Deleting a stage also removes its evolution edges, encounter placements, replacement policies, target ID allocations, and stage asset directory through a compensated server-side transaction.

## Authoring workflows

### Build

Each stage supports:

- name, normalized slug, category, generation, and growth rate;
- one or two types;
- up to three abilities and a passive;
- dimensions, friendship, capture rate, male percentage, and explicit genderless state;
- legendary, mythical, and starter flags;
- six base stats from 1 through 255 with a live BST;
- level-up and TM moves;
- up to four egg moves; and
- alternate forms with type, ability, passive, item-change, starter-visibility, asset-variant, and stat overrides.

Enum-style values are checked against the selected checkout before delivery. Unknown abilities, moves, types, growth rates, items, times of day, and biomes are blocking Review errors.

### Evolution

Create branching edges between custom stages. Supported automatic delivery requirements are:

- level;
- evolution item;
- friendship;
- time of day; and
- known move.

Custom prose requirements remain portable notes and cannot be installed automatically. Review rejects missing stages, duplicate edges, incomplete requirements, and cycles.

### Assets

A stage may assign one file per asset role:

- sprite or icon: PNG or WebP;
- cry: OGG, WAV, MP3, or M4A; and
- variant metadata: a JSON object.

Each imported asset is limited to 8 MB. The companion validates its actual signature, PNG dimensions, size, canonical containment, and SHA-256 hash. Replacing, removing, or deleting assets commits the file operation and project revision together or compensates both on failure.

Portable packages are limited to 64 MB of embedded assets in total. Package export removes target bindings and other machine-local paths.

### Encounters

The supported encounter adapter edits only recognized, simple biome arrays whose entries are `SpeciesId` values.

You can:

- add a custom species to one exact biome pool;
- suppress supported official wild-pool references; or
- replace those references with one custom stage.

Weights, level ranges, trainer tables, bosses, starters, eggs, and special rewards are not guessed or claimed by this adapter. A requested biome or official reference must match exactly; zero or ambiguous matches block delivery.

### Review and target binding

Choose **Bind PokéRogue checkout** and select a local checkout. The companion detects only the verified modern `SpeciesDataMapConfig` / `PokemonSpecies` layout. Legacy or unfamiliar registries are refused.

Analysis records:

- Git revision and dirty state;
- package version and package manager;
- a target fingerprint;
- recognized source paths;
- enum catalogs;
- exact simple encounter adapters;
- asset destinations;
- form and evolution-condition capabilities;
- collision-free custom species IDs; and
- the target build or type-check script.

Target identity and allocated IDs remain stable across a valid Mod Studio-owned installation because analysis verifies its committed journal and fingerprints the original backups.

## Transactional delivery

Delivery buttons are enabled only when the displayed project revision has been saved successfully.

### Preflight

Preflight performs all of the following without writing to the selected checkout:

1. rereads the exact saved project revision;
2. reanalyzes the checkout and validates enum symbols;
3. generates a target-specific manifest;
4. runs the source patch planner in dry-run mode;
5. creates a detached temporary Git worktree at the target revision;
6. applies the manifest inside that isolated worktree; and
7. runs the target's `typecheck` or `build` script using the installed dependency tree.

Immediately before a real apply, the companion reanalyzes the selected checkout and rejects any fingerprint or validation change.

### Install and update

The installer:

- acquires an exclusive checkout operation lock;
- rejects symbolic links and junctions in edited source/public/asset paths;
- validates all journal and update paths canonically;
- writes a durable write-ahead journal before modifying files;
- records `prepared`, `applying`, `applied`, and `committed` states;
- writes and restores files through flushed temporary replacements;
- backs up each destination once;
- rejects duplicate destination paths; and
- automatically recovers incomplete transactions on the next operation.

Update validates the existing installed hashes, snapshots the previous installed state and journal, plans the replacement from the original backups, then installs the new revision. Any failed replacement restores the previous installed mod and journal.

### Uninstall and conflicts

Uninstall restores original source and assets only when every current file still matches the journal's recorded installed hash. Later user edits or another mod's changes produce a rollback conflict instead of being overwritten.

Mod IDs, journal paths, backups, update snapshots, source paths, and asset paths are validated against traversal and canonical escape.

## Portable package installation

Drag a current manifest or `.pokerogue-mod-package.json` onto `Install-Mod.bat`.

The wrapper first materializes and verifies the exact embedded asset set, then runs the same isolated Git-worktree build preflight used by the Studio. The real installer is not invoked when isolated verification fails.

Command-line form:

```powershell
node pokerogue-mod-package-installer.cjs `
  --input C:\Mods\emberline.pokerogue-mod-package.json `
  --project C:\Games\rogue-offline `
  --dry-run

node pokerogue-mod-package-installer.cjs `
  --input C:\Mods\emberline.pokerogue-mod-package.json `
  --project C:\Games\rogue-offline
```

For an installed mod:

```powershell
node pokerogue-mod-installer.cjs `
  --project C:\Games\rogue-offline `
  --uninstall emberline
```

## Verification

Run from this folder:

```powershell
npm ci
npm test
npm run build
npm run check:service
npm run check-installer
git diff --check
```

The repository workflow `.github/workflows/mod-studio-verify.yml` performs those checks on Windows and smoke-tests the built production companion on `127.0.0.1`.

See `BUILD_REPORT.md` for verification scope and release evidence.
