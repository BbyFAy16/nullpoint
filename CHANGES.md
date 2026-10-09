# NULLPOINT v0.2 changes

## Bugs fixed
- Text: MSDF shader read only the R channel (should be median of RGB); `g` colour channel was shadowed by the glyph variable (all text turned magenta); glyph Y offsets were mirrored (names landed on bodies); `middle` alignment was ~0.9em too low.
- Non-ASCII glyphs (infinity, middle-dot, em-dash, ...) rendered as blank gaps; now mapped to ASCII.
- HUD overlap: shapes were drawn AFTER text, so panels/bars painted over labels. Now shapes first, text last.
- `inter.json` vs `Inter.json` case mismatch (broke on Linux hosts).
- Round clock kept running while paused.

## Strict-hiding leaks closed
Visibility refreshed every tick (was 150ms stale) and tests the body edge, not just the centre. Hidden enemies' bullets, muzzle flashes, impact sparks, blood, hit flashes, damage numbers, reload sounds and names are all suppressed. Minimap last-known markers fade after 5s.

## New
- Squad scoring (ALPHA / OMEGA): score follows the squad across side swaps.
- Modes: ELIMINATION (best of 7) and BUNKERS (single round).
- 3v3 / 5v5, squad builder, difficulty, settings (persisted), pause, results screen.
- Objective-aware AI: BREACH and GUARD actions.

## v0.2.1
- Bot difficulty and Strict vision moved from Settings to Match Setup (per-match, remembered between sessions).

## v0.2.2
- New setting: Controls > Movement. CLASSIC keeps WASD; POINTER is cursor-relative: W moves toward the mouse, S backpedals, A/D strafe. Persisted with other settings.
- Fix: portrait renderer crashed (`character is not defined`) when drawing a PALADIN ring; team is now passed into `_applyRing`.
