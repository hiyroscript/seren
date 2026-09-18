# Rhosyn and Aero-Glow integration QA

Rhosyn replaces Rose. It is the game's fifth sprite car, and the fifth whose
ultimate does more than run fast. The field is still six.

Rose's ultimate was the generic one — fifteen seconds at double pace and
nothing else. Rhosyn's is not, and it is the only one of the five that is not a
collision priority: for fifteen seconds its own driver is shown a private world
and the shared road has no body at its position to interact with, in either
direction.

## Implementation

- `js/data.js`, `js/i18n.js`, `js/main.js`, `index.html`: Rhosyn takes the fifth
  slot Rose held rather than becoming a seventh — the same place in `CAR_IDS`,
  the same temperament values carried across unchanged
  (`nerve 0.62 / spite 0.58 / patience 0.50 / guard 0.58`), the same button and
  preview canvas under `carRhosyn`, and `rhosyn` / `rhosynUlt` in both
  languages. **No car id is persisted anywhere** — `pickCar()` writes `G.car`
  and nothing reads a saved one, and the only `store` keys are `seren.lang`,
  `seren.sound`, `seren.volume`, `seren.motion`, `seren.contrast`,
  `seren.controlHints` and `seren.best` — so there is no saved `"rose"` to
  migrate and no legacy branch was added to look for one. The procedural
  `coupe` body Rose used is removed with it: `drawCoupe()` and `coupeShell()`
  had exactly one user and no longer have it, so they are gone rather than left
  as dead branches. `flames()` stays, because Siren's cruiser still calls it.
- `js/render.js`: `v_rhosyn.PNG` is fetched and cached once in `CAR_SPRITES`
  alongside the other five sheets. No renderer builds an `Image`.

### The measurements

`v_rhosyn.PNG` is 1024×1536 with transparent padding. Everything below was
measured by decoding the PNG and reading the alpha and colour channels, not
estimated, and the same method reproduces the bounds already recorded for
Flann, Neela, Lolanthe and Verdant exactly — which is what says it is the
method the existing geometry was built with.

- **Visible bounds: (75,33)–(948,1437)**, so the artwork is 874 × 1405. The
  edges are hard rather than glowing: raising the alpha threshold from 24 to 200
  moves them by at most one pixel in each direction. The body's centre line
  comes out at x = 511.5 against an image centre of 512, so the car is drawn
  symmetrically about its own axis.
- **Race scale: none.** At 1:1 the body is 1.000 of the shared car box across —
  the width is what runs out first, and the height comes to 86% of the box.
  Against the numbers already recorded for the others (Flann 1.056, Neela 0.777,
  Lolanthe 1.000, Verdant 0.871 before their scales), it is the broadest car on
  the road against its own length, so a scale would make it a different class of
  vehicle. Lolanthe carries none for the same reason.
- **Two exhaust anchors**, because the artwork has two outlets. The rear valance
  carries a pair of chrome-rimmed stadium mouths whose dark bores measure
  (447,1320)–(500,1344) and (525,1322)–(577,1346). Their centres are
  (473.5, 1332) and (551, 1334), so the anchors are **(473, 1333)** and
  **(551, 1333)** — 39 source pixels either side of the sheet's own centre line,
  symmetric because the artwork is. Normalized `x/1024`, `y/1536`, exactly as
  every other anchor is, so `spriteFrame()` / `spriteAnchor()` place them through
  the same transform the body is drawn with. Both anchors were confirmed to sit
  inside the opaque bore rather than on the rim.
- **Hitbox: 32 points**, traced off the silhouette row by row. It is the only
  hull in the game that is not a simple convex blob, because the artwork has a
  forked nose and **the V between the two prongs is empty space a car can pass
  through rather than body**. The polygon follows the inner edge of each prong up
  to its tip, back down the outer edge, round the canard shoulder at y ≈ 372,
  in at the waist at y ≈ 650, out over the rear haunch to the widest point at
  y ≈ 1158, and in to the tail at y ≈ 1370 — stopping at the top of the diffuser
  blades, which splay out below and are trailing edges rather than body. Every
  vertex has its mirror. `insideHitPolygon()` and `hitPolygonsOverlap()` already
  handle a concave outline correctly (even-odd fill plus edge crossing), so
  nothing in the contact pipeline needed changing for it, and
  `tools/hitbox-check.mjs` asserts the V reads as a hole both square-on and
  rotated.

## The invariant

**Rhosyn never has a second race position.** Aero-Glow is a view and an
isolation over the same canonical racer.

Nothing in the mechanic teleports the racer, freezes it, captures a pose to
restore it from, advances a distance counter of its own, or writes `G.biome`,
`G.next`, `G.seam` or `G.trackT`. The racer's lane, lateral x, tilt, speed,
metres, ranking, finish progress, seam crossings and biome progression are the
canonical ones the shared simulation goes on advancing throughout.

That is the whole reason the return needs no correction: the car is already
exactly where the race has put it, in whatever biome the race has actually
reached. Doing it the other way — swapping `G.biome`, or teleporting away and
back — would break precisely that: the position would have to be guessed on the
way home, every rival's metres are measured against player one's camera and
would move with it, and a biome swapped under the whole field changes what every
other column is looking at.

`tools/check.mjs` fails the build if any file writes an Aero-Glow value into
`G.biome`, `G.next`, `G.seam` or `G.trackT`, if any racer grows a second
Aero-Glow metre count, pose, origin or scroll, or if the departure reaches
`teleportRacerToPose()` or `rebaseWorld()`.

## The phase

One small explicit state per racer, advanced from the ordinary update loop so a
pause pauses it. It is deliberately not `ultOn` overloaded.

| Phase | The racer | Its own view | Every other view |
| --- | --- | --- | --- |
| `"off"` | on the shared road | the shared world | the car, solid |
| `"in"` | already unreachable | the shared world, going white | the car, flashing white and fading out |
| `"glow"` | away | Aero-Glow | nothing at all |
| `"out"` | still away | Aero-Glow, going white | the car, flashing white and fading back in |

`AERO_SHIFT` is `WHITEOUT_TIME/2` and `AERO_FADE` is `MORPH_TIME`: both derived
from the shared white transition rather than invented beside it. The whiteout is
opaque for its first half, so half of it is exactly the moment the screen is
covered and the renderer swaps worlds behind a curtain. `NEELA_WHITEOUT` and
`NEELA_MORPH` were renamed to `WHITEOUT_TIME` and `MORPH_TIME` because two cars
use them now; the values and Neela's behaviour are unchanged, and
`tools/ultimate-check.mjs` still asserts Neela's whiteout against the constant.

## Automated coverage

All five suites pass: **275 ultimate regression checks**, **95 menu checks**,
**44 sprite checks**, **34 hitbox checks**, and the static suite.

Old Rose assertions were rewritten rather than renamed where their meaning
changed. Siren is now the generic rectangle car (`CAR_HIT_RECT`, the nearest-
point and rotated-oil geometry tests) and the generic ultimate (the "does an
ordinary ultimate disturb anything?" test), because Rhosyn is neither any more.

- **Rename.** `CAR_IDS` is `flann, neela, lolanthe, verdant, rhosyn, siren`;
  `rose` is not in it, `#carRose` does not exist, `CARS.rose` and `TEMPERS.rose`
  are `undefined`, no `STR` entry and no rendered page text contains Rose in
  either language, clicking the button starts a race in `v_rhosyn.PNG`, and the
  sheet is registered through `CAR_SPRITES`.
- **Sprite.** Style `sprite`, file exactly `v_rhosyn.PNG`, the measured bounds
  and anchors asserted against the numbers above, the whole sheet drawn and
  centred on its measured bounds at three sizes, both plumes rooted on the
  measured outlets at three sizes × three tilts and again at two extreme
  scale/rotation pairs, the two roots symmetric about the sheet's centre line,
  `drawSpriteExhaust` reached through the ordinary boost flag, never a body
  fire, and both the menu preview and the race drawn from the same model.
- **Hitbox.** The hull is `CARS.rhosyn.hitShape` and not `CAR_HIT_RECT` and not
  anybody else's; it is symmetrical and tapered; points just inside the body,
  the prongs, a prong tip, the widest point and the tail collide; points in the
  nose V, outboard of a prong, past the widest point and down in the diffuser
  blades do not; the race size and the hull size scale together and the hull
  never reaches past the box; a rotated Rhosyn is collided on the rotated
  polygon vertex for vertex and the V is still a hole; the geometry exists
  before the image loads; and Aero-Glow moves the hull by nothing.
- **Lifecycle.** The shared 75 / 15 / 2× is untouched, the phase runs
  `in → glow → out → off`, the meter ends the ultimate and the phase outlives it
  by one transition, the meter recharges off the shared clock afterwards — in
  every ownership direction (player one, a bot, a local seat).
- **Continuity.** With the ultimate running and a seam brought on mid-flight:
  the canonical metre count keeps advancing monotonically, the canonical lane
  keeps answering the controls, the race changes biome underneath, and ending
  the ultimate moves the racer by **exactly nothing** — no metre delta, no lane
  or lateral change. It emerges into the biome the race reached, not the one it
  left. There is no `aeroMeters`, `aeroPose`, `aeroOrigin` or `aeroBiome` on the
  racer.
- **Isolation, both ways.** Rear contact, the lane barge, Flann's ram, Neela's
  exchange, Verdant's defence, Lolanthe's aura and forced lane change, the
  tumbleweed, the meteor, the puddle, oil, a seeker in flight, seeker target
  selection, `carAt()`, `rearContact()`, the bot threat picture and a shared
  bubble row all pass it by, and it reaches none of them. The hazards are not
  spent on it either — the weed, the puddle, the slick and the seeker are all
  still there afterwards. A held item is refused and **kept**. It steers
  normally throughout.
- **Visibility.** Its own column draws it whole inside Aero-Glow; every other
  column draws no body, no exhaust, no shadow, no seat marker, no Condition
  badges and no orbiting notes. It keeps its dot on the ladder and its place in
  the standings.
- **Split screen.** In two, three and four columns, only the Rhosyn's own column
  flashes white and only that column changes worlds; the others keep rendering
  the real race in the same frame and return to the same one world afterwards.
- **The two seconds.** `INVULNERABLE_TIME` is still 2 and the return grants the
  existing Invulnerable Condition at the frame the car is genuinely back, not
  while it is still behind the exit whiteout. An ulting Flann into it
  immediately afterwards is refused; the same contact two seconds later lands. A
  longer protection already running is not shortened. There is no
  `rhosynImmune`, `aeroShield` or `aeroInvuln` field anywhere.
- **Edges.** A pause stops the departure, the void and the return dead and
  resuming picks them up where they stopped; crossing the line from inside
  Aero-Glow is a real finish and leaves no phase, no fade and no renderer in the
  void; an ordinary wreck cannot reach it and a forced one still cleans up; a
  restart and leaving the race both clear it.
- **The renderer.** It reads canonical state and writes none: a hundred frames
  of Aero-Glow change no race state and allocate no images, and with the car's
  own exhaust pulse pinned the same state draws the same frame however much time
  has passed — what it moves with is the road the racer is actually covering.

## Browser verification

Run in headless Chromium against the real page, at 520×900 with a device pixel
ratio of 2.

- A race as Rhosyn renders the car on the road at the right size against
  Lolanthe, Neela and Flann beside it, in its lane, with its fire in its pipes.
- Firing the ultimate flashes the view white, and the frame caught mid-fade
  shows Aero-Glow underneath with the car's own white body flash still burning
  off — the intended sequence rather than a cut.
- Aero-Glow itself reads as a near-black void with one light in it: a tight
  magenta band off the horizon, luminous pink perspective traces converging on
  the vanishing point, the three-lane route the car is still steering between
  with markers running down it at the rate the racer is covering ground, drifting
  streaks, the name set quietly above the horizon, and Rhosyn alone in it. The
  HUD keeps working — the distance, the running order and the ultimate meter
  counting down. `#trackName` still reads the real track, because it is the
  page's one HUD and is deliberately not mutated.
- From another racer's view, a rival Rhosyn that fires disappears from the road
  entirely — no body, no exhaust, no shadow — while its dot stays on the ladder
  and its metres keep climbing in the standings. `racerViewAlpha` is 0,
  `noContact` is true and `racerDetectable` is false. When it returns the body
  and the edge badge come back and the dot wears the Invulnerable ring.
- A 400-second bots race driven to the flag: three biomes crossed, all four
  phases exercised, no `NaN`, no non-track biome, no phase left on the wrong
  car, and no page errors.
- A 600-second race with the ultimate forced every 20 seconds: **30 departures,
  30 returns, every one granting the Invulnerable Condition, and all 9 biome
  changes happening while Rhosyn was away** — so every one of them was a return
  into a biome the car had not left from. No bad states and no page errors.

Physical controller testing and review on real hardware have not been performed.
