# Build report — complete PokéRogue Mod Studio

Implementation completed on 2026-07-14 for all approved product phases:

1. Foundation and blank-line editor.
2. Authoring depth and review.
3. Target discovery and binding.
4. Transactional delivery and portable packages.

## Completed product scope

- Portable project folders with atomic canonical writes and bounded autosave history.
- Blank custom evolution-line stages with immutable internal IDs.
- Official read-only Pokédex references.
- Complete identity, battle metadata, stats, moves, forms, assets, evolutions, and encounter authoring.
- Keep, Suppress, and Replace policies for official declarative references.
- Validated project-owned sprite, icon, cry, and variant imports.
- Arbitrary local checkout scanning with fingerprints, source-layout adapters, capability discovery, and collision-free custom species IDs.
- Target-aware Review validation and manifest preview.
- Dry-run preflight, journaled install, update, uninstall, and rollback.
- Failed-update restoration of the previously installed transaction.
- Portable package export with embedded SHA-256-verified assets.
- Manifest-or-package Windows installation wrapper.

## Verification coverage

The Windows verification workflow runs the following against the pull-request head:

```powershell
npm ci
npm test -- --reporter=json --outputFile=vitest-results.json
npm run build
npm run check:service
npm run check-installer
git diff --check <base>...HEAD -- Tool .github/workflows/mod-studio-verify.yml
```

It then starts the production companion, reads its reported `127.0.0.1` URL, requests the root page, and requires HTTP 200 with the React root element.

The automated suite covers:

- project schema, revision, and authoring helpers;
- move, form, evolution, encounter, target-binding, and manifest behavior;
- project repository containment and atomic persistence;
- asset signatures, sizes, hashes, dimensions, storage, and removal;
- target layout detection, capabilities, fingerprints, and ID allocation;
- authoring and delivery API routes;
- preflight/install/update/uninstall orchestration;
- modern registry patch generation;
- official replacement and custom biome placement;
- exact uninstall restoration;
- restoration of the previous installed mod after a failed update;
- portable package materialization and hash rejection;
- dashboard, editor, autosave, and complete five-tab workflows;
- Vite postbuild compatibility; and
- production static-entry preference and legacy fallback.

## Safety result

- Official species IDs `1–1025` remain reserved.
- Unknown target layouts are rejected.
- Unsupported target capabilities block delivery instead of producing guessed edits.
- Project and package asset paths are canonically contained.
- Package and project assets are hash-checked before delivery.
- Preflight does not write.
- Install operations journal edited and copied files.
- Failed installs roll back.
- Failed updates restore the previous installed transaction and journal.
- Uninstall restores original source and assets byte-for-byte in the transaction fixtures.

## Release boundary

The completed studio targets recognized PokéRogue source layouts and deliberately refuses unfamiliar source structures. Custom prose evolution requirements remain portable package notes and are not automatically installed. No automatic media conversion or remote/cloud functionality is included.
