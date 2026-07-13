# Build report — PokéRogue Mod Studio 1.0.0

Validated on 2026-07-12:

- `npm ci`: passed
- `npm run build`: passed
- `node --check pokerogue-mod-installer.cjs`: passed
- Transactional installer dry-run fixture: passed
- Custom species enum/registry/egg-move insertion fixture: passed
- Legacy wild encounter disabling fixture: passed
- Custom biome encounter insertion fixture: passed
- Sprite, variant metadata, and cry donor copies fixture: passed
- Journal-based uninstall and exact restoration fixture: passed

The live target checkout was not available inside the execution container, so the final installer must still be run with `--dry-run` against the user's local `Tetradim/rogue-offline` `pokerogue-fork` checkout. The adapter intentionally rejects missing anchors and reports biome pools it cannot locate rather than editing them speculatively.
