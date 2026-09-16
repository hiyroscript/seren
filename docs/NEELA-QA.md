# Neela integration QA

Neela replaces Phantom. It is the game's second sprite car and the second car
whose ultimate does more than run fast.

## Implementation

- `js/data.js`, `js/i18n.js`, `js/main.js`, `index.html`: Neela takes the slot
  Phantom held rather than becoming a seventh car — the same place in `CAR_IDS`,
  the same temperament values in `TEMPERS`, the same button and preview canvas,
  and `neela` / `neelaUlt` in place of `phantom` / `phantomUlt` in both
  languages. No car id is persisted anywhere (`store` holds only the best
  distance, the language, sound and the settings block), so there is no saved
  `"phantom"` to migrate and no legacy code was added to look for one.
- `js/render.js`: `v_neela.PNG` and `vtm_neela.PNG` are fetched and cached once
  each alongside `v_flann.PNG`. A car with an `altForm` contributes both of its
  sheets to the preloader, so the alternate body is decoded at boot rather than
  the first time an ultimate is pressed, and each sheet schedules the same
  on-load repaint of the shared menu canvases.
- Both 1024×1536 sheets have transparent padding. Visible bounds were measured
  off the alpha channel: (220,25)–(803,1422) for the car and (228,22)–(795,1506)
  for the alternate form. The full image is drawn in both cases, uniformly
  scaled from natural dimensions and positioned so those bounds are centred on
  the logical car. Nothing is cropped and nothing is copied from Flann.
- The rear outlets were located in the artwork rather than estimated: the two
  chrome tips measure (325,1334)–(378,1376) and (645,1336)–(698,1376), giving
  anchors at their centres, (352,1355) and (671,1355). The alternate form's main
  thruster mouth measures (442,1265)–(582,1347), giving (512,1306).
- `js/render.js`: `spriteFrame()` and `spriteAnchor()` are the one place the
  placement of a sheet inside a car box is worked out, and `racerTailPoint()` is
  the world-space version the trail emitter uses. Every effect that must stay on
  a piece of artwork goes through them, which is what keeps a root on its outlet
  across sizes, lane-change tilt, race scale and split-screen columns.
- `js/render.js`: `CARS.<id>.exhaustStyle` picks what comes out of the pipes.
  Flann keeps `drawSpriteFlame`; Neela gets `drawSpriteEnergy` — a lightened
  white-cyan core, an electric blue body and a clean transparent streak rather
  than a pointed tongue. Every gradient in it starts on the anchor itself, so
  the root is the measured outlet exactly at every size and every point of the
  pulse. Reduced motion removes the pulse and keeps the energy.
- `js/data.js`, `js/runtime.js`, `js/mechanics.js`, `js/render.js`: the
  alternate body is `CARS.neela.altForm` — its own sprite, bounds, emitter,
  trail root, hull and `scale`. `racerModel(who)` is the single answer to which
  body a racer is wearing, and `racerDims()` and `carHit()` both read it, so the
  sprite and the hull switch on the same frame and switch back on the same
  frame. The menus paint from `CARS` directly and never see the alternate form.
- `js/mechanics.js`: `flannCar()` and `neelaCar()` are the only two places a
  racer's `car` is compared to a name. `neelaUltActive()` (the fifteen seconds,
  and the solid-hazard privilege) and `neelaFormActive()` (the alternate body,
  and the single exchange) are deliberately separate questions that diverge at
  the first racer contact; `clearsSolidHazards()` is the one predicate the
  hazard code in `mechanics.js` and `race.js` asks for either car.
- `js/mechanics.js`: `racerWorldPose()`, `teleportRacerToPose()` and
  `rebaseWorld()` are the whole of the position handling. Player one has no race
  `y`, so moving it moves the world past it — arithmetically one frame of
  scrolling done in a single step, which is why every unrelated racer, hazard,
  bubble, slick, seeker, spark, building, prop, walk, trail node and the track
  seam keep their absolute place on the road.
- `js/mechanics.js`, `js/race.js`: `whiteT`, `morphT`, `neelaForm`,
  `neelaOrigin`, `neelaSwapped`, `swapGuard` and `trail` are carried by every
  racer — `G` and rivals alike — reset in `startRace()`/`spawnRivals()`, and
  cleared by `clearNeelaState()` on a wreck, on a finish and at the start of a
  race. `endUlt()` leaves nothing behind either.
- `js/mechanics.js`: **Obscured** now derives from `blind > 0 || whiteT > 0`.
  The puddle's `blind` is untouched and still draws puddle water; the whiteout
  is a timer of its own, so a Neela transition never paints water on a screen.
- `js/render.js`, `js/hud.js`, `css/app.css`: the white belongs to a view.
  `drawWhiteout(who)` is called after a column's road *and* after its
  instruments, inside that column's clip, so one person's game disappears and
  nobody else's does. On one screen the instruments are page elements over the
  canvas, so `paintHUD` puts a `whiteout` class on the shell for as long as the
  timer runs.
- `js/render.js`: `drawMorphFlash` fills the model's own hull white, so it is a
  car's silhouette that flashes rather than a disc over the top of it — and it
  therefore works on whichever of the six a Neela exchange catches, without a
  line of per-car code. It reads `morphT` and no clock, so it is deterministic
  and has no oscillation for reduced motion to remove.
- `js/render.js`: the alternate-form trail is a bounded per-racer list of world
  positions, dropped by update code at the measured thruster and aged there.
  Drawing only reads them. Ending the form stops new nodes without deleting the
  ones already down, which is what lets a trail finish fading after an exchange,
  after natural expiry and after a wreck.
- `js/ai.js`: `botUltExtra()` adds a car-aware term to the shared ultimate
  valuation for both Flann and Neela. Neither branch assumes the other does not
  exist, and the four remaining cars are unaffected. Bot Neela is the same code
  path as player Neela throughout; there is no bot-only implementation and no
  homing.
- `js/render.js`: Phantom's procedural `drawJet()`/`jetBody()` and the
  `style === "jet"` branch are removed. A repository-wide search confirmed the
  `"jet"` style had no other user; the shared `flames()` helper the other four
  procedural cars call is untouched.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/TUNING.md`: updated for the second
  sprite car, the second car-specific ultimate, the world-pose rules and the two
  new sheets.

The six-racer field, the shared `carW`/`carH`, the boost and ultimate charge
clock, duration and pace, Conditions, standings, the finish lifecycle, respawn
invulnerability, Flann's ram, puddles, oil, seekers and local multiplayer are
all unchanged. No game dependency, module system or build step was added. Both
original PNGs are unchanged.

## Geometry

`carW`/`carH` are unchanged, so five of the six racers are drawn exactly at
them. Neela's artwork is narrower and longer than Flann's — 584×1398 of visible
body against 679×1337 — and at 1:1 its body covers barely half a lane while
every other car covers about two thirds. `CARS.neela.raceScale` is 1.18, which
brings it to a shade under the shared car box while keeping the hull a car's.
`CARS.neela.altForm.scale` is 1.09, measured rather than chosen: it is what
makes the craft's fuselage and fin span come out the size of the car it
replaced, so transforming changes the shape on the road and not how much road it
takes up.

An independent source-alpha check sampled both hulls' edges just inside the
outline, against the decoded PNGs:

| Hull | Edge samples | Below alpha 200 | Coverage |
| --- | --- | --- | --- |
| `CARS.neela.hitShape` | 1080 | 2, at the nose tip | 100% of the hull over opaque artwork; 86% of the artwork inside the hull |
| `CARS.neela.altForm.hitShape` | 1200 | 104, of which 100 are the two fin trailing edges | 98% of the hull over opaque artwork; 86% of the artwork inside the hull |

The alternate hull's two exceptions are deliberate: the edges that run from each
swept fin tip back to the fuselage cross the open V behind the wing, which is
the wing root a hull is expected to close over. Neither hull reaches past the
widest opaque pixel on any row, and both exclude the PNG's transparent corners,
the shadow, the plumes, the trail, the diffuser blade under the car's tail and
the energy spike under the craft's.

## Automated validation

| Command | Result |
| --- | --- |
| `node tools/check.mjs` | Pass; one informational warning for localization strings built dynamically |
| `node tools/menu-check.mjs` | 85 checks passed |
| `node tools/ultimate-check.mjs` | 244 checks passed |
| `node tools/sprite-check.mjs` | 27 checks passed |
| `node tools/hitbox-check.mjs` | 24 checks passed |
| `git diff --check` | Pass |

No existing assertion was deleted to make the suite pass. Where an assumption
genuinely changed — that only one car carries a race scale, that only one car
has an ultimate power, that Obscured has one source — the assertion was
rewritten to guard the new invariant rather than dropped. `tools/check.mjs` now
also fails if `neelaFormActive()` stops being narrower than `neelaUltActive()`,
if a car is named outside the two identity predicates, if a procedural car gains
a race scale, if a scale leaves its measured band, if Neela's timings stop being
named constants, or if the swap guard grows past a single step.

The new coverage is:

- **`sprite-check.mjs`** — three cached sheets with exact filenames and casing,
  each fetched once and each scheduling its own late-load repaint; both Neela
  sheets centred from their own measured bounds; the normal energy roots exactly
  on (352,1355) and (671,1355) and the alternate root exactly on (512,1306),
  across three sizes and three tilts; the roots leaning with tilt; the menu
  preview always the car and never the alternate form; ordinary boost, a boost
  can and the ultimate's speed never transforming anything; the ultimate doing
  so and expiry undoing it on the next frame; a rival Neela treated identically;
  the transformation flash tracing the model's own hull on all six cars and
  being neither a plume nor a body fire; reduced motion deterministic; rendering
  state-pure over sixty frames with a trail on the road; and 2/3/4-player
  columns each drawing their own body with only the right seats whited out.
- **`hitbox-check.mjs`** — both Neela hulls against their measured artwork,
  transparent corners rejected and real body points accepted, the hull switching
  on activation and back on both an exchange and natural expiry, rotation
  following the rendered tilt exactly, player and rival geometry identical, edge
  contact and a thousandth of a pixel of separation, and hit geometry existing
  before either image has loaded.
- **`ultimate-check.mjs`** — a Neela section covering activation (the standard
  fifteen-second meter, the origin captured exactly once and never re-taken, the
  alternate form up, nothing else on the road moved), the whiteout (controls
  answering, the countdown and the road still running, Obscured derived without
  `blind`, and it ending on its own), no immunity and no invulnerability, the
  solid-hazard privilege for the whole ultimate including after the exchange and
  gone the moment it ends, the falling rock gone through, puddles unchanged, oil
  and seekers not converted into immunity, natural expiry returning the car
  where it stands, wrecks and finishes clearing the form outright, the trail
  bounded and fading rather than purged, and the exchange itself in all six
  ownership directions — player into bot, player into seat, bot into player, bot
  into seat, seat into player and seat into bot — each checked for both
  destinations being exact, nobody wrecked, the meter continuing, one exchange
  only, ordinary rules afterwards, protected targets refused, and no second
  event in the same step. A dedicated regression teleports player one and
  asserts that every unrelated racer, hazard, bubble, slick, seeker, spark,
  building, prop, walk, trail node and the seam keeps its exact distance down
  the road, and that the standings still agree with `placeOf()`.
- **`menu-check.mjs`** — Neela in the second slot and not a seventh car, named
  and described in both languages with no implementation vocabulary in the copy,
  no Phantom string anywhere a player can read, and every menu preview painting
  the car model even while the alternate form is on the road.

## Browser validation

Driven in Chromium against the real page, through the game's own code paths.

- **Select screen** — Neela appears where Phantom did, with `v_neela.PNG`, its
  localized name and its own ultimate description in the showroom.
- **Endless, ordinary driving** — the car is centred in its lane, tilts through
  lane changes, and the blue energy leaves both rear outlets and leans with the
  car. No transparent-padding artefacts.
- **Activation** — the view whites out completely, road and DOM instruments
  together; `vtm_neela.PNG` is already the active body during the transition;
  the meter keeps counting (14.92 of 15 at the first frame checked), the road
  keeps moving and the controls still answer; Obscured is on with `blind` at 0.
- **Alternate form** — the white burns off, the instruments return, and the long
  blue trail runs from the thruster off the bottom of the screen, following the
  driven path through lane changes.
- **Exchange** — Neela at 124m with its origin at 15m met a rival at the same
  spot; afterwards Neela was at 132m, the rival at 16m, neither wrecked, the
  meter continuing from 13.12, the body back to `v_neela.PNG`, the exchange
  spent, and both cars flashing white with both views covered.
- **After the exchange** — the hazard privilege still held: a tumbleweed was
  smashed with no Slow and the ultimate ran on; a puddle still applied
  `BLIND_TIME`, stayed on the road and showed Obscured.
- **Local play, 2/3/4 seats** — activating in seat one whited out seat one
  alone; exchanging with the human in seat two whited out seats one and two and
  left seats three and four entirely untouched, still showing the road, their
  own instruments, the flashing car and the trail on the road behind it.
