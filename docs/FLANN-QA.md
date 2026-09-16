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
- `js/data.js`, `js/runtime.js`, `js/render.js`, `js/mechanics.js`: Flann is
  drawn and collided at `CARS.flann.raceScale` (1.12) on the road. `raceScale()`,
  `carDims()` and `racerDims()` are the only readers, and the sprite, the hull,
  the rear-end clearance and the meteor roof test all ask them. The shared
  `carW`/`carH` are unchanged, so the other five racers, the lane, the road and
  the grid are all untouched, as are the garage and select-screen previews.
- `js/mechanics.js`, `js/race.js`, `js/render.js`: Flann's ultimate is an
  offensive ram while `flannUltActive(who)` is true. See `docs/ULTIMATE-QA.md`
  for the behaviour and `docs/ARCHITECTURE.md` for where it is applied.
  `drawCar` takes `ulting` as its own flag so `drawFlannUltFire()` runs for the
  ultimate alone and never for an ordinary boost or a boost can.
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

The six-racer field, temperament values, the shared `carW`/`carH`, the
boost/ultimate charge clock, duration and pace, Conditions, standings and the
finish lifecycle remain unchanged. Flann alone carries a race scale, and Flann
alone gains a collision and hazard power while its ultimate runs; the other five
cars are untouched in both respects. Mystery Bubble rewards are temporarily off
behind `MYSTERY_ITEMS_ENABLED` without any of the item system being removed. No
game dependency, module system or build step was added. The original PNG is
unchanged.

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
| `node tools/check.mjs` | Pass; one informational warning for localization strings built dynamically |
| `node tools/menu-check.mjs` | 80 checks passed |
| `node tools/ultimate-check.mjs` | 216 checks passed, including all six cars with the image marked loaded |
| `node tools/sprite-check.mjs` | 17 checks passed |
| `node tools/hitbox-check.mjs` | 15 checks passed |
| `git diff --check` | Pass |

The sprite suite covers unloaded/failed image guards, late-load preview repaint,
full-image aspect and centring, two plume anchors at three scales and three tilt
angles, deterministic smooth animation, static reduced motion, boost-off, state
purity, player and rival drawing, ultimate activation, invulnerability blinking,
2/3/4-player render columns and a simulated three-minute Endless run with all
five rivals. It also covers the race size and the ultimate fire: Flann is drawn
larger than the shared car box while the other five are drawn at it, the aspect
ratio is preserved, menu previews keep their own size and never light either
effect, the fire appears for `ultOn` and never for an ordinary boost, no other
car gets it, it sits on the body and leans with the tilt, it flickers on full
motion and holds still under reduced motion, it is drawn once per local column
for every ulting seat, it goes out on the frame the ultimate ends, and drawing
it changes no race state.

The hitbox suite additionally covers Flann's race scale, its hull scaling by the
same factor while staying tapered and inset, the other five cars' geometry being
untouched, and the clearance at which two Flanns stop overlapping moving with
the render. Existing suites cover racer contact, Conditions, finishes, local
selection/taken cars, random selection and English/French navigation.

Repository-wide searches found no prior racer identity, retired implementation
identifiers or stale non-racer road-vehicle copy in the current text files.
`tools/check.mjs` now also enforces that `flannUltActive()` is the only place a
racer's car is compared to Flann, that exactly one car carries a race scale and
that it stays within the intended 10-15%, that the shared `carW` is unchanged,
that `carHit()` reads `carDims()`, and that the Mystery reward gate is a switch
rather than a deletion.

## Visual inspection and limits

A native Canvas 2D rasterization of the real `drawCar()` code and original PNG
was inspected at multiple sizes and tilt angles, beside the five other cars.
The complete vehicle is visible, points upward, retains its aspect ratio, and
has two attached rear plumes behind the body. No plume appears with boost off.
This used an already-installed test runtime; the game has no new dependency.

The race size and the ultimate fire were then reviewed in a real headless
Chromium at 430×900 with a device pixel ratio of 2, serving the repository over
HTTP and driving the live game state. Confirmed on screen: Flann sits
comfortably inside its lane at the new size, a little more substantial than the
other five and not oversized; the ultimate wraps the body in flame tongues down
both sills and around the tail while the paint, the glass and the flame livery
stay readable; an ordinary boost produces no body fire; a puddle taken during
the ultimate fouls the screen and shows **Obscured** beside **Boosted** with the
fire and the meter both still running; and a two-seat local race draws both
burning Flanns in both columns.

Still outstanding for an interactive review: physical local-controller play,
desktop and landscape presentation, other DPR values, animated lane changes
under a real frame loop, and the feel of the ram in live racing rather than in
a driven state. Automated Canvas/DOM doubles and scripted screenshots do not
replace those.
