# Rhosyn QA

## Current sprite measurements

The current 1024 × 1536 `v_rhosyn.PNG` is a solid-nosed car, not the former forked design. Its connected opaque bounds are the half-open rectangle (162,73)–(863,1436), or 701 × 1363 pixels. Low-alpha detached margins are excluded. Two measured outlets are centred at (483,1366) and (544,1366). Race scale is 1.14, giving a visible width near Flann’s lane occupancy without changing aspect ratio.

The polygon follows the nose, front arches, narrow waist and rear haunches, stopping before the decorative diffuser. It rotates through `carHit()` and exists without image loading. `racerDims()` and `spriteFrame()` keep collision, body and plume sizing aligned in menus, races and local columns.

## Aero-Glow

The private world adapts Ponu’s `js/14-rendering.js` track: 3.4m rungs, every fourth stronger, continuous lane lines, 2.2m divider dashes, owner-column highlight, pink motes, speed streaks, edge gradients and top fade. Ponu’s `js/08-vfx.js` informed the world-motion and speed language. No Ponu gameplay is imported.

The black/pink world reads canonical owner travel. Drawing twice cannot advance it. Reduced motion preserves road structure and removes cosmetic streaking/flicker. Only Rhosyn and its exhaust/morph belong in this world; shared racers, hazards, pickups, scenery and projectiles are excluded.

The owner’s distance/place readout and ladder are hidden. The label says Aero-Glow and the ultimate meter remains. Other local seats keep their normal HUD. Return restores the current shared-track label without changing `curTrackKey`.

## Preserved invariant and tests

Canonical metres, steering, biome transitions, race ordering and finish remain shared. Existing departure/return phases and post-return invulnerability remain unchanged. The ultimate suite exercises isolation and exact canonical re-entry; sprite checks exercise model/exhaust measurements, per-view rendering and deterministic track motifs; hitbox checks use the new solid nose and scaled polygon.
