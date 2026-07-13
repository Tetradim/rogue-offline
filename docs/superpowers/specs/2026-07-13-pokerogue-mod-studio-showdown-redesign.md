# PokéRogue Mod Studio: Showdown-Inspired Redesign

Status: Approved design awaiting written-spec review  
Date: 2026-07-13  
Platform: Windows  
Baseline: PokéRogue Mod Studio 1.0.0

## 1. Summary

PokéRogue Mod Studio will become a polished local Windows tool for creating and injecting a complete custom Pokémon evolutionary family into a local single-player PokéRogue source checkout.

The interface will use the speed, density, and single-sheet flow associated with Pokémon Showdown's teambuilder without copying its source code or branding. The finished product will retain the current tool's deep PokéRogue customization features, reorganize them into a cohesive evolution-line workflow, add portable project folders and uploaded-asset validation, and unify export and direct installation behind one version-tolerant patch engine.

One project represents one complete evolutionary family. A project may contain one stage, a linear line, branches, alternate forms, and variants. Official Pokémon remain searchable and viewable as read-only reference data. Their species definitions cannot be edited, but selected acquisition references may be suppressed or explicitly replaced by custom stages.

## 2. Approved Product Decisions

- The tool creates Pokémon for injection into a local single-player PokéRogue game; it is not a competitive team builder.
- New projects start blank. Official Pokémon are never cloned automatically.
- The left-side Pokédex displays every official Pokémon as searchable, read-only reference data.
- One project contains one complete evolutionary family and is installed, updated, exported, or uninstalled atomically.
- Official species definitions stay locked. Acquisition references may be kept, suppressed, or replaced per channel.
- Suppress is the default when the user enables an official-line override. Replace is an explicit opt-in.
- Custom placement is independent of suppress and replace rules.
- The tool supports both integrated installation and portable package export.
- The first release is Windows-only.
- Projects are portable folders with automatic saving and reopen support.
- Custom sprites, icons, and cries can be imported, previewed, and validated. The tool does not edit or convert media.
- The target may be any local PokéRogue source checkout or fork. The tool performs semantic capability discovery and never guesses at ambiguous patch locations.
- The chosen application architecture is a React browser UI backed by a local Windows companion service.
- The approved editor is a dense Showdown-inspired sheet with a persistent evolution-stage strip.
- Base stats use synchronized sliders and exact numeric inputs, with live BST calculation.
- The approved visual system is a dark navy/near-black theme with blue, red, and purple accents.
- There are no accounts, cloud services, encryption layer, telemetry, or personal-data features.

## 3. Goals

### 3.1 Primary goals

1. Make blank Pokémon creation fast enough for repeated expert use while remaining understandable to a first-time modder.
2. Treat an entire evolutionary family as one consistent domain object so links, assets, IDs, encounter rules, and installation cannot drift apart.
3. Support arbitrary local PokéRogue source layouts through read-only capability discovery and adapter fixtures rather than hard-coded repository names.
4. Make installation recoverable through complete planning, journaling, verification, update, rollback, and uninstall behavior.
5. Preserve the user's work in portable project folders rather than browser-only storage.
6. Give uploaded assets the same validation quality as authored species data.
7. Ensure integrated install and exported-package install behave identically by using the same engine.

### 3.2 Non-goals

- Competitive teams, battle simulation, or Pokémon Showdown import/export formats.
- Editing official species definitions beyond acquisition availability references.
- A built-in pixel-art, sprite-animation, icon, or audio editor.
- macOS or Linux support in the first release.
- Remote access, multi-user collaboration, user accounts, cloud sync, or telemetry.
- Blind support for an unknown source layout. Unknown or ambiguous structures produce a no-write compatibility report.
- Automatic media conversion. Invalid media is rejected with an actionable explanation.

## 4. System Architecture

### 4.1 Runtime shape

The Windows launcher starts a Node-based companion service on `127.0.0.1` using an available local port, then opens the React application in the user's default browser.

The React application owns presentation and interaction. It does not write directly to arbitrary filesystem paths. The companion service owns:

- project creation, opening, saving, autosave history, and export;
- imported-asset copying, preview metadata, and validation;
- target-folder selection and compatibility scanning;
- numeric ID allocation and target binding;
- patch planning and human-readable change summaries;
- transactional install, update, verification, rollback, and uninstall;
- rebuild-command execution when the target exposes a recoverable build capability;
- operation logs and compatibility reports.

The service uses a simple JSON API. It listens only on loopback and does not enable cross-origin mutation requests. These are dependency-free HTTP boundaries, not an authentication or security subsystem.

### 4.2 Service modules

The companion service is divided into focused modules:

1. **Project Manager** — portable project folders, schema migrations, autosaves, revisions, and recent projects.
2. **Project Validator** — field, stage, graph, line, target, and install validation.
3. **Asset Validator** — decoding, target-format checks, geometry, frame layout, completeness, preview metadata, and collision detection.
4. **Compatibility Scanner** — read-only semantic discovery of target capabilities.
5. **Target Binder** — target fingerprint, numeric ID allocation, filename resolution, and persisted target mappings.
6. **Patch Planner** — immutable planned operations and rendered review summaries.
7. **Transaction Engine** — journaling, apply, verify, rollback, update, and uninstall.
8. **Package Exporter/Installer** — portable package creation and batch/CLI installation through the same scanner, planner, validators, and transaction engine.
9. **Operation Log** — structured progress and actionable failure output for the UI and exported reports.

Each module exposes a narrow interface and must be independently testable.

## 5. User Experience and Information Architecture

### 5.1 Project dashboard

The launcher opens a project dashboard with:

- New Evolution Line;
- Open Project Folder;
- Import Legacy Project or Manifest;
- recent portable projects with last-opened and validation state;
- selected PokéRogue target and its last compatibility state;
- update/uninstall entries for projects detected in the selected target.

Creating a project asks only for a project name and destination folder. It then creates a blank first stage and opens the editor.

### 5.2 Main editor shell

The approved layout contains:

- a global header with project name, autosave state, target state, Export, and Validate & Install actions;
- a left searchable official Pokédex, always read-only;
- a persistent evolution-family stage strip for adding, reordering, branching, selecting, and removing stages;
- five main tabs: Build, Evolution, Assets, Encounters, and Review;
- a line-level validation/action bar.

The interface is an original implementation inspired by Showdown's compact editing rhythm. It does not reproduce Showdown source code or branding.

### 5.3 Build tab

The Build tab keeps the highest-frequency fields visible together:

- identity: display name, internal slug, category, generation, height, weight, growth, friendship, capture rate, gender rules, legendary/mythical/starter flags;
- battle identity: primary and secondary types, abilities, passive, form metadata;
- base stats: HP, Attack, Defense, Special Attack, Special Defense, and Speed;
- synchronized slider and numeric input for every stat;
- live BST total and configurable balance warnings;
- level-up learnset with duplicate levels supported;
- TM and egg-move pools;
- inline searchable option selectors with descriptions.

Blank projects use neutral schema defaults only. They do not copy official species values.

### 5.4 Evolution tab

The Evolution tab manages the graph for the whole family:

- stages and branches;
- evolution requirements such as level, item, form, variant, and supported target-specific conditions;
- alternate forms and battle forms;
- graph validation for unreachable stages, cycles where unsupported, missing targets, and ambiguous edges;
- automatic link updates when stages are reordered or renamed;
- explicit confirmation before deleting a stage referenced by another stage.

### 5.5 Assets tab

The Assets tab supports drag-and-drop and file-picker imports for target-supported asset roles, including normal and shiny sprites, back sprites, icons, form/variant assets, and cries.

Every import shows:

- original filename and project-relative destination;
- linked stage, form, and variant;
- preview or playback;
- validation checks and blocking failures;
- resolved target filename after a game folder is scanned;
- filename collision state;
- optional existing-game donor fallback when the user has not uploaded a role.

The tool preserves original files and does not edit or convert them.

### 5.6 Encounters tab

The Encounters tab contains two independent systems:

1. **Custom placement** — add custom stages to supported biomes, pools, or acquisition sources.
2. **Official availability overrides** — keep, suppress, or replace official references by channel.

Supported channel categories include wild encounters, starter selection, egg pools, trainer teams, boss encounters, special encounters, and rewards/mystery encounters when the target scanner discovers them.

Selecting an official line creates an override with Suppress as the default mode for any channel the user enables. Replace requires an explicit official-stage-to-custom-stage mapping. Channels left on Keep remain unchanged.

### 5.7 Review tab

The approved Review tab is the final creation and installation checkpoint. It displays:

- complete evolution-family cards with sprite previews, target IDs, types, abilities, evolution requirements, BST, and asset state;
- project, battle-data, asset, graph, and target-compatibility check totals;
- official-line suppressions and replacements by channel;
- custom placements;
- target fingerprint and discovered capabilities;
- exact planned source files, assets, registry entries, references, and commands;
- install/update status and journal availability;
- Export Project Package, Apply Only, and Install & Rebuild actions.

Install actions are disabled when blocking project, asset, graph, target, or collision errors remain. Export remains available when the project schema and assets are internally valid even if no game folder is selected.

## 6. Visual Design System

The application uses a dark navy/near-black foundation:

- near-black application background;
- navy navigation and editor surfaces;
- elevated dark-blue panels with restrained borders;
- blue for primary actions, valid target state, selected official references, and validation progress;
- red for suppression, destructive actions, collisions, and blocking failures;
- purple for custom species, imported assets, forms, variants, and project identity;
- high-contrast cool-white text with blue-gray secondary text;
- Pokémon type colors only where type recognition benefits from their familiar palette.

The UI prioritizes information density, fast scanning, keyboard usability, visible focus states, and responsive behavior for common desktop window sizes. It does not rely on color alone for status; icons and text labels accompany every state.

## 7. Portable Project Model

### 7.1 Folder layout

Each project is a self-contained folder:

```text
Emberline/
├── project.json
├── assets/
│   ├── <stage-id>/
│   ├── <stage-id>/forms/<form-id>/
│   └── shared/
└── .studio/
    ├── autosaves/
    ├── operation-logs/
    └── validation-cache.json
```

`project.json` is authoritative. `.studio` contains rebuildable tool state and history. Export packages exclude transient validation caches unless a diagnostic package is requested.

### 7.2 Project identity

The project stores:

- schema version;
- immutable project ID;
- mod slug and display name;
- revision counter and timestamps;
- stage records;
- evolution graph edges;
- forms and variants;
- asset records;
- custom placement rules;
- official availability policies;
- target bindings;
- legacy import provenance when applicable.

### 7.3 Stage identity

Every stage has an immutable internal stage ID and a user-editable species slug. Internal evolution links use stage IDs rather than numeric PokéRogue IDs.

A stage contains the complete authoring model for basic data, types, abilities, passives, stats, moves, forms, variants, assets, and target-supported metadata. Branches and forms remain subordinate to the same project.

### 7.4 Target bindings and numeric IDs

Numeric PokéRogue species IDs are target-specific rather than project identity.

After scanning a target, the binder:

1. finds occupied IDs from discovered registries;
2. allocates the lowest safe free IDs by default;
3. honors optional preferred IDs only when free and compatible;
4. resolves asset filenames and source anchors;
5. persists the mapping under a target fingerprint;
6. reuses the same mapping on later installs when it remains collision-free.

If a collision appears after the target changes, installation stops and the Review tab previews a replacement mapping. No project-authored evolution links change.

## 8. Encounter and Availability Semantics

Each official-line channel policy is one of:

- **Keep** — make no change to official references in that channel.
- **Suppress** — remove selected official references from that channel; do not add a custom reference automatically.
- **Replace** — swap discovered official references with an explicitly mapped custom stage in that channel.

Custom placement remains separate and may add a custom stage regardless of official policy.

Rules:

1. Official species definition files remain read-only from the editor's perspective.
2. Suppress and Replace modify only discovered acquisition references, not official numeric identities or save-compatible species definitions.
3. Replace requires a complete explicit stage mapping for every official reference the user selects.
4. A selected channel that cannot be uniquely mapped blocks the entire installation before writing.
5. Uninstall restores every suppressed or replaced reference exactly and removes every custom placement recorded by the project journal.

## 9. Asset Import and Validation

Imported assets are copied into the portable project and represented by manifest records containing role, stage/form/variant link, original filename, project-relative path, hash, validation result, and target resolution.

Validation is capability-aware and includes:

- successful image or audio decoding;
- supported extension and codec;
- image dimensions, transparency, color mode, frame count, and sheet layout;
- consistency across normal, shiny, back, form, and variant assets when required;
- cry playback and target-compatible audio properties;
- required-role completeness based on the discovered target;
- resolved target-filename ownership and collisions;
- preview generation without modifying the source file.

Corrupt, unsupported, incomplete, or colliding assets block installation. Non-blocking quality warnings do not block export.

## 10. Compatibility Scanning

The scanner accepts any user-selected local PokéRogue source folder. It does not assume a repository name or branch.

Scanning is read-only and produces a capability map for:

- project/package manager and rebuild command;
- species ID and species-data registries;
- evolution definitions;
- level-up, TM, and egg-move structures;
- ability and passive references;
- forms and variants;
- sprite, icon, and cry asset locations;
- each acquisition and encounter channel;
- safe insertion/removal anchors;
- rebuild-output recovery behavior.

Discovery uses adapter profiles and semantic checks. A capability is valid only when its target is unique and its expected surrounding structure validates. File paths alone are insufficient proof.

The scanner returns Supported, Unsupported, or Ambiguous for every required capability. Any required Unsupported or Ambiguous result produces a no-write compatibility report and blocks installation.

## 11. Installation, Update, and Uninstall

### 11.1 Install flow

1. Validate the portable project and assets.
2. Scan and fingerprint the selected target without writing.
3. Resolve numeric IDs, filenames, target capabilities, and encounter mappings.
4. Build an immutable patch plan containing every write, edit, command, expected precondition, and verification check.
5. Present the complete plan in the Review tab.
6. On confirmation, journal original content and hashes before the first write.
7. Apply planned source and asset changes.
8. Verify every result against the plan.
9. Optionally run the discovered rebuild command when recoverable rebuild behavior is available.
10. Mark the journal installed only after the selected install mode succeeds.

### 11.2 Install modes

- **Install & Rebuild** is the primary action when the scanner discovers a rebuild command and an adapter declares its output behavior recoverable. A rebuild failure rolls back the patch and reports captured command output.
- **Apply Only** patches and verifies source/assets, then leaves rebuilding to the user. It is available whenever compatibility passes.
- **Export Project Package** creates a portable installer package without modifying a target.

### 11.3 Update

Updating an installed project is one transaction:

1. validate the new project revision;
2. verify the existing journal and detect target drift;
3. plan restoration of the previous installed revision;
4. plan the new installation;
5. apply both as one transaction;
6. restore the previous installed revision if the update fails.

### 11.4 Uninstall

Uninstall uses the journal to remove project-owned files and restore exact original content and acquisition references.

If a target file has changed outside the project since installation, uninstall stops before overwriting it and reports a file-level conflict. It does not discard unrelated user work.

## 12. Export and Import

### 12.1 Primary portable package

The primary export is a Windows-installable project package containing:

- the canonical project manifest;
- all imported assets;
- hashes and schema version;
- optional target binding information;
- a package-readable summary;
- the installer entry point or instructions needed to invoke the shared engine.

Dragging the package onto the Windows installer or selecting it from the launcher invokes the same scanner, binder, planner, validators, and transaction engine as integrated install.

### 12.2 Secondary exports

The UI also supports:

- plain JSON manifest export for inspection and diagnostics;
- compatibility report export;
- patch-plan report export;
- operation-log export.

Legacy per-species `.ts` export is retained under an Advanced menu during migration but is not the primary workflow.

### 12.3 Imports and migration

The new tool imports:

- portable project folders;
- exported project packages;
- current-format JSON manifests;
- legacy PokéRogue Mod Studio browser/project manifests when their schema can be migrated losslessly.

Imports run through schema migration and validation before being saved. A migration report lists normalized fields and any unsupported legacy data.

## 13. Error Handling and User Feedback

Validation is layered:

- field validation appears beside the field;
- stage validation appears in the stage strip;
- evolution-graph validation appears in the Evolution tab;
- asset validation appears on each imported file;
- project validation appears in Review;
- target compatibility appears after scanning;
- install preconditions and operations appear in the installation log.

Failure behavior is deterministic:

- invalid project or asset: no target write;
- missing or ambiguous target capability: no target write and a compatibility report;
- ID or filename collision: no write and a proposed reallocation where possible;
- write or post-write verification failure: automatic rollback from the journal;
- recoverable rebuild failure: rollback and captured build output;
- uninstall drift: stop before overwriting external changes and report the conflict.

The UI distinguishes blocking errors, warnings, and informational notices with text and icons as well as color.

## 14. Testing Strategy

### 14.1 Unit tests

Unit coverage includes:

- project schema migrations and normalization;
- immutable project/stage identity;
- evolution graph validation;
- numeric ID allocation and collision handling;
- encounter Keep/Suppress/Replace resolution;
- custom placement resolution;
- asset validators;
- target fingerprinting;
- patch-plan determinism;
- journal generation and verification.

### 14.2 Target checkout fixtures

The repository includes representative PokéRogue layout fixtures and fork variations. Each fixture has golden expectations for:

- discovered capabilities;
- unsupported/ambiguous reports;
- ID allocation;
- planned source edits and asset copies;
- suppress/replace behavior;
- rebuild capability;
- exact uninstall restoration.

Supporting a newly encountered source layout requires a fixture that reproduces it and passing golden tests before its adapter behavior is considered reliable.

### 14.3 Transaction fault injection

Tests force failure after every planned write and verification boundary. Each failure must restore the fixture byte for byte and leave a truthful failure journal/log.

### 14.4 End-to-end tests

Browser-driven tests cover:

- create blank project;
- add, branch, reorder, and remove stages;
- edit all core data and synchronized stat sliders;
- import valid and invalid assets;
- configure custom placements;
- suppress official references;
- configure explicit same-slot replacements;
- close and reopen an autosaved project;
- export and import a package;
- scan a compatible and incompatible target;
- install, update, rollback, and uninstall against fixtures;
- verify Review-tab output and button states.

### 14.5 Real-checkout acceptance

Before release, Apply Only and Install & Rebuild must be exercised against at least one real local PokéRogue source checkout after a clean dry-run/plan review. The resulting game build must load the custom line, and uninstall must restore the original checkout content covered by the journal.

## 15. Acceptance Criteria

The redesign is complete when all of the following are true:

1. A user can create a blank one-stage or multi-stage evolutionary family in a portable folder.
2. Autosave survives closing and reopening the application without data loss.
3. Official Pokémon are searchable and viewable but cannot be edited beyond acquisition policies.
4. Every base-stat slider stays synchronized with its numeric input and BST updates immediately.
5. Branches, forms, variants, moves, passives, and evolution rules serialize and validate correctly.
6. Valid custom sprites, icons, and cries preview and install; invalid files produce actionable blocking reasons.
7. Suppress removes selected official references without automatically placing custom species.
8. Replace swaps only explicitly mapped references in explicitly selected channels.
9. Custom placement works independently of official-line policy.
10. A target scan never writes and blocks ambiguous required capabilities.
11. The Review tab accurately lists every resolved ID, file, reference, asset, command, warning, and blocking error.
12. Integrated install and exported-package install produce equivalent plans and results.
13. A write failure restores the target from the journal.
14. An update failure restores the previously installed project revision.
15. Uninstall restores originals without overwriting unrelated external changes.
16. The dark blue/red/purple interface is consistent across dashboard, editor, dialogs, Review, and install progress.
17. All unit, fixture, fault-injection, build, and end-to-end checks pass.

## 16. Delivery Boundaries

The redesign will be implemented in the imported PokéRogue Mod Studio repository while preserving the original ZIP unchanged.

The first stable release will include the Windows launcher, local service, React interface, portable project schema, migration support, shared package installer, fixture suite, and user documentation. Cross-platform packaging, cloud features, media editing, and speculative patching of unknown layouts remain outside this release.

