# PokéRogue Mod Studio

A Windows-local creation studio for portable custom PokéRogue evolution-line projects. The application uses a React browser interface backed by a loopback-only Node companion service that owns project-folder access and atomic autosaves.

This repository currently contains the completed **Foundation and Blank-Line Editor** phase. It replaces the legacy browser-storage editor with portable projects, a dark Showdown-inspired workflow, an official read-only Pokédex, custom stage management, and a functional Build tab.

## Current capabilities

- Create a self-contained portable project folder from the dashboard.
- Open an existing project folder through the Windows folder picker.
- Persist canonical `project.json` data with atomic writes and bounded autosave history.
- Start every custom evolutionary family with one neutral blank stage.
- Add and remove custom stages while preserving immutable internal stage IDs.
- Search all official species as read-only reference data.
- Edit custom identity, slug, category, generation, growth rate, types, abilities, passive, dimensions, capture data, friendship, gender ratio, and classification flags.
- Edit all six base stats with synchronized sliders and exact numeric inputs.
- View a live base-stat total (BST).
- Autosave changes to the portable project folder with stale-revision protection.
- Use a dark navy interface with blue, red, and purple status accents.
- Run entirely on `127.0.0.1`; there are no accounts, cloud services, telemetry, or remote-access features.

Official species are never cloned into a new project and cannot be edited. They are references only.

## Local Studio Launcher

Requirements:

- Windows 10 or newer
- Node.js 20 or newer

Double-click `Launch.bat` or `SimpleLaunch.bat`. The launcher:

1. verifies Node.js 20 or newer;
2. installs local dependencies when `node_modules` is missing;
3. builds the production UI;
4. starts the companion service on an available loopback port; and
5. opens the studio in the default browser.

Closing the launcher window stops the local service.

## Development

```powershell
npm ci
npm run dev
```

`npm run dev` starts the Node companion watcher on `127.0.0.1:43123` and the Vite UI together. Vite proxies `/api` to the companion while rewriting the local development origin to the companion origin.

Useful commands:

```powershell
npm test
npm run build
npm run check:service
npm run check-installer
```

## Portable Evolution-Line Projects

Choose **New Evolution Line**, enter a project name, and select a parent folder. The studio creates:

```text
Emberline/
├── project.json
├── assets/
└── .studio/
    ├── autosaves/
    ├── operation-logs/
    └── validation-cache.json
```

`project.json` is authoritative. `.studio/` contains rebuildable history and tool state. Projects can be copied or moved as folders and reopened from the dashboard.

Repository guarantees include:

- complete import-shape validation;
- canonical project identity and stale-revision checks;
- atomic flushed JSON writes;
- autosave-before-canonical ordering;
- safe Windows folder containment;
- junction, realpath, and case-alias serialization; and
- independent writes across different projects.

## Editor workflow

The editor contains:

- a header with project and autosave state;
- a searchable official Pokédex on the left;
- a persistent custom evolution-stage strip;
- Build, Evolution, Assets, Encounters, and Review tabs; and
- a dense responsive editing canvas.

The **Build** tab is functional in this phase. Evolution, Assets, Encounters, and Review are visible roadmap surfaces and clearly identify the later subsystem that will activate them.

## Runtime architecture

```text
Windows launcher
      │
      ▼
Node companion on 127.0.0.1
      ├── JSON project API
      ├── Windows folder picker
      ├── atomic project repository
      └── production static-file server
              │
              ▼
        React browser UI
```

The service accepts mutation requests only from its exact serialized loopback origin or from origin-less local desktop clients. Static files are served only after canonical containment and opened-file identity checks.

## Phase roadmap

The approved product is divided into four independently verifiable phases:

1. **Foundation and Blank-Line Editor — implemented here.**
2. **Authoring Depth and Review** — evolution graph, moves, forms, uploaded assets, encounter policies, and complete review.
3. **Target Discovery and Binding** — arbitrary PokéRogue checkout scanning, fingerprints, capability discovery, and target ID allocation.
4. **Transactional Delivery** — install, update, rebuild, rollback, uninstall, and portable package workflows.

The existing legacy installer remains available for compatibility, but it is not yet connected to the new portable-project UI. The new editor deliberately does not claim that placeholder tabs can install a project.

## Data sources and generated files

- `public/pokemon_data.json` is the official read-only roster used by the UI.
- `dev.html` is the Vite entry.
- `dist/` is generated by `npm run build`.
- root `index.html` and `pokemon_data.json` are regenerated by `postbuild.js` for legacy compatibility and should not be hand-edited.

## Safety and scope

- Windows only for this release.
- Local, offline, single-user workflow.
- No edits to official species definitions from the editor.
- No automatic media conversion.
- No guessed writes into an unfamiliar PokéRogue checkout.
- The original downloaded ZIP is not modified by this repository workflow.
