# Flann integration QA

## Implementation

- `js/data.js`, `js/runtime.js`, `js/i18n.js`, `js/main.js`, `index.html`:
  Flann is the canonical first racer, including the roster, temperament, fallback,
  default selection, English/French labels, ultimate key and button wiring.
- `js/render.js`: one cached `Image` for the exact `v_flann.PNG`, an on-load
  repaint of shared menu canvases, and a dedicated image model. All six cars
  still pass through `drawCar()` in menus, races and local columns.
- The 1024×1536 PNG has transparent padding. Its visible bounds were measured
  at (173,72)–(851,1409). The full image is uniformly scaled from natural
  dimensions and positioned so those bounds are centred on the logical car.
- Two paired rear exhaust clusters were inspected in the artwork. Anchors at
  (355,1377) and (669,1377), stored as normalized source coordinates, sit just
  underneath the outlets. The exhaust shares the image's translated/rotated
  local space. Shadow, tapered gradient plumes and image are drawn in that order.
  Sine pulses affect plume dimensions only; reduced motion is static. The
  existing boost/ultimate flag controls visibility; previews have no plumes.
- `js/core.js`, `js/data.js`, `js/runtime.js`, `js/mechanics.js`, `js/race.js`,
  `js/render.js`, `js/ai.js`: deleted the dormant non-racer vehicle flag, paints,
  state, counters, resets, spawning, wall correction, movement, overtaking bonus,
  collisions, special race-ending path, draw pass and AI avoidance pass. The
  unused old body renderer and screen helper are also gone.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/TUNING.md`, `upd`: updated the current
  model, asset deployment requirements and road composition. Endless copy and
  the result panel no longer describe the removed subsystem.
- `tools/check.mjs`, `tools/menu-check.mjs`, `tools/ultimate-check.mjs`,
  `tools/game-fixture.mjs`, `tools/sprite-check.mjs`, `tools/hitbox-check.mjs`: updated identity coverage,
  removed the obsolete fallback model exemption, and added controllable image
  loading plus renderer lifecycle/geometry checks.

The six-racer field, temperament values, logical car dimensions, boost/ultimate
performance, hazards, items, Conditions, standings and finish lifecycle remain
unchanged. No game dependency, module system or build step was added. The
original PNG is unchanged.

## Hitbox follow-up

The requested precision pass centralizes body geometry in `carHit(who)`.
Flann has a tapered inset eight-point hull; the other five cars retain their
body rectangle sizes. All hulls rotate with lane-change tilt. Round hazards,
items, seekers, oil, puddles and rear contacts use this shared geometry for
players, bots and local seats. Transparent padding, shadow and flames never
contribute. An independent source-alpha check sampled 808 points along Flann's
hull edges; every sample was inside the opaque artwork (minimum alpha 252/255).

Rear contact now tests actual overlapping bodies, avoiding hits caused solely
by target lane labels. Lane barging retains its deliberate target-lane projection.
Oil uses the renderer's exact polygon instead of an inflated bounding box;
puddles use the same quadratic control points with a maximum 0.15 logical-pixel
flattening error. The precision pass changes contact boundaries, including
rotated/tapered corners, while keeping speed and hit consequences unchanged.

## Automated validation

| Command | Result |
| --- | --- |
| `node tools/check.mjs` | Pass; one informational warning for 71 localization strings built dynamically |
| `node tools/menu-check.mjs` | 80 checks passed |
| `node tools/ultimate-check.mjs` | 170 checks passed, including all six cars with the image marked loaded |
| `node tools/sprite-check.mjs` | 10 checks passed |
| `node tools/hitbox-check.mjs` | 13 checks passed |
| `git diff --check` | Pass |

The sprite suite covers unloaded/failed image guards, late-load preview repaint,
full-image aspect and centring, two plume anchors at three scales and three tilt
angles, deterministic smooth animation, static reduced motion, boost-off, state
purity, player and rival drawing, ultimate activation, invulnerability blinking,
2/3/4-player render columns and a simulated three-minute Endless run with all
five rivals. Existing suites cover racer contact, Conditions, finishes, local
selection/taken cars, random selection and English/French navigation.

Repository-wide searches found no prior racer identity, retired implementation
identifiers or stale non-racer road-vehicle copy in the current text files.

## Visual inspection and limits

A native Canvas 2D rasterization of the real `drawCar()` code and original PNG
was inspected at multiple sizes and tilt angles, beside the five other cars.
The complete vehicle is visible, points upward, retains its aspect ratio, and
has two attached rear plumes behind the body. No plume appears with boost off.
This used an already-installed test runtime; the game has no new dependency.

Interactive browser QA could not run: the browser rejected the local preview
URL with `net::ERR_BLOCKED_BY_CLIENT`. Therefore real browser menu layout,
narrow portrait/desktop presentation, DPR changes, animated lane changes,
Condition/seat-marker composition and physical local-controller play still need
an interactive review. Automated Canvas/DOM doubles do not replace those checks.
