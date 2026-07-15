# Build report — PokéRogue Mod Studio hardened release

This report covers the complete authoring, target-binding, package, and transactional-delivery product plus the post-release hardening review.

## Implemented product scope

- Portable evolution-line project folders with atomic canonical writes and bounded autosaves.
- Complete Build, Evolution, Assets, Encounters, and Review workflows.
- Deep validation for nested moves, forms, assets, evolution edges, encounter records, and target bindings.
- Read-only official Pokédex references.
- Validated project-owned sprite, icon, cry, and variant assets.
- Verified modern PokéRogue source adapter with enum catalogs and collision-free custom IDs.
- Saved-revision-pinned delivery.
- Exact simple biome species-array placement, suppression, and replacement.
- Source dry-run plus isolated target worktree type-check/build preflight.
- Transactional install, update, recovery, conflict-aware uninstall, and portable packages.

## Hardening changes

The release review identified and corrected the following classes of defects:

- failed updates losing the previous installed mod;
- hostile or tampered journal paths;
- uninstall overwriting later user edits;
- delivery using an older autosaved revision;
- free-text enum IDs passing preflight;
- unsupported encounter weight and level claims;
- duplicate asset destinations corrupting backups;
- process interruption and concurrent operations;
- source, asset, journal, and package containment gaps;
- occupied ID/name collisions;
- male-ratio inversion and zero-value loss;
- shallow imported-project validation;
- the former 1 MB request limit preventing documented 8 MB uploads;
- asset files and project metadata diverging on save failure;
- machine-local paths leaking into packages;
- silent egg-move truncation;
- unreachable donor-asset behavior; and
- unverified legacy adapter claims.

## Transaction guarantees

The hardened installer now provides:

- an exclusive checkout operation lock;
- canonical path validation and junction rejection;
- a durable write-ahead journal;
- persisted `prepared`, `applying`, `applied`, and `committed` operation states;
- flushed temporary replacement of edited and restored files;
- startup recovery of incomplete installs and updates;
- exact hash checks before update or uninstall;
- rollback conflict refusal instead of overwriting later edits;
- restoration of the previous installed transaction after a failed update;
- planning updates from the original backups rather than already patched source;
- one backup per unique destination; and
- stable target identity and species allocations across a valid owned installation.

## Package guarantees

- 8 MB maximum per asset.
- 64 MB maximum embedded assets per package.
- Exact manifest/package asset membership.
- Duplicate, missing, extra, escaping, and hash-mismatched assets are rejected.
- Exported project snapshots remove machine-local target bindings.
- Manual manifest/package installation performs isolated target compilation before the real installer runs.

## Automated coverage

The Windows workflow runs:

```powershell
npm ci
npm test -- --reporter=json --outputFile=vitest-results.json
npm run build
npm run check:service
npm run check-installer
git diff --check <base>...HEAD -- Tool .github/workflows/mod-studio-verify.yml
```

It then starts the production companion, reads its reported loopback URL, requests the root page, and requires HTTP 200 with the React root.

The regression suite includes:

- project schema and authoring invariants;
- malformed nested import rejection;
- autosave and revision races;
- atomic asset upload, replacement, removal, and stage cleanup;
- target enum catalogs, clean/dirty Git state, and stable owned-install identity;
- package membership, hashes, and manual isolated preflight ordering;
- modern registry generation, forms, evolution conditions, and exact encounters;
- hostile uninstall IDs and journal paths;
- occupied custom ID/name rejection;
- duplicate asset destinations;
- zero values, male percentage, and genderless data;
- install and byte-for-byte uninstall;
- successful A-to-B update and final original restoration;
- failed update restoration of A and its journal;
- rollback conflict refusal after later edits;
- interrupted-write recovery and live operation locking;
- junction and transaction-state link rejection;
- UI saved-revision gates; and
- production build and localhost serving.

## Release gate

A release commit is accepted only when the Windows workflow succeeds on that exact commit. The final published commit and workflow run are recorded after the hardening pull request passes all checks and is fast-forwarded to `main`.
