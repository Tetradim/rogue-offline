# PokéRogue Mod Studio — Foundation Refactor

## Implemented in this build

- Immutable `projectId` identity for every species.
- Persistent browser project storage (`pokerogue-mod-studio.project.v1`).
- Central numeric-ID allocation registry.
- Automatic next-free custom ID starting at 1026.
- Official IDs 1–1025 locked against custom creation or renumbering.
- Duplicate numeric IDs rejected permanently; the old "create anyway" path was removed.
- Duplicate species slugs rejected.
- Saves update by immutable `projectId`, not mutable `speciesNumber`.
- Legacy roster changes are limited to safe override data during project restoration.
- Availability controls for wild encounters, starters, eggs, trainers, bosses, and special rewards.
- One-click enable/disable-all acquisition controls.
- Revision counter on saved species.

## Next injector milestone

- Export project manifest containing species allocations and availability overrides.
- Scan installed PokéRogue source to discover occupied IDs and supported patch anchors.
- Transactional backup/patch/rollback journal.
- Apply custom species definitions and assets.
- Apply reversible legacy encounter/acquisition filters without deleting legacy species.
