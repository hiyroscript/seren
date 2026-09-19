# Lolanthe and Verdant integration QA

Lolanthe replaces Bolt and Verdant replaces Timestamp. They are the game's
third and fourth sprite cars, and the third and fourth whose ultimates do more
than run fast. The field is still six.

## Implementation

- `js/data.js`, `js/i18n.js`, `js/main.js`, `index.html`: each takes the slot
  the car it replaced held rather than becoming a seventh or an eighth — the
  same place in `CAR_IDS`, the same temperament values carried across unchanged
  (`nerve 0.54 / spite 0.64 / patience 0.68 / guard 0.52` for Lolanthe,
  `0.38 / 0.32 / 0.88 / 0.74` for Verdant), the same button and preview canvas
  under `carLolanthe` / `carVerdant`, and `lolanthe` / `lolantheUlt` and
  `verdant` / `verdantUlt` in both languages. No car id is persisted anywhere,
  so there is no saved `"bolt"` to migrate and no legacy code was added to look
  for one. The procedural `buggy` and `wedge` bodies those two cars used are
  removed with them rather than left as dead branches.
- `js/render.js`: `v_lolanthe.PNG` and `v_verdant.PNG` are fetched and cached
  once each in `CAR_SPRITES` alongside the other three sheets.
  `queen_note.PNG` and `pion_note.PNG` are cached the same way in `FX_SPRITES`
  — they are world effects rather than bodies anybody drives, so they are kept
  apart from the car cache, but they are loaded once at boot on exactly the
  same terms. No renderer builds an `Image`.
- Both sheets are 1024×1536 with transparent padding. Visible bounds were
  measured off the alpha channel rather than estimated: (90,12)–(933,1477) for
  Lolanthe, (167,36)–(856,1508) for Verdant. The same measurement reproduces
  the bounds already recorded for Flann and Neela exactly, which is what says
  the method is the one the existing geometry was built with. The full image is
  drawn in both cases, uniformly scaled and positioned so those bounds are
  centred on the logical car. Nothing is cropped and nothing is copied from
  another car.
- The outlets were located in the artwork. Lolanthe's rear valance carries two
  oval mouths measuring (422,1343)–(488,1366) and (535,1343)–(602,1366), giving
  anchors at their centres, (455,1354) and (568,1354) — symmetric about the
  measured body centre line to within half a pixel. Verdant has exactly one
  outlet, the side-exit pipe on its right, whose bore measures
  (723,1307)–(754,1321), giving (738,1314). The slatted box under Verdant's
  tail was inspected at source resolution and is a three-finned diffuser with no
  bore, so nothing is drawn out of it: one anchor is what the artwork has, and
  one anchor is what the data records.
- Both use the ordinary `drawSpriteFlame` path — the default — rather than
  Neela's energy exhaust, because neither piece of artwork asks for anything
  else.
- Race size is measured, not chosen. Verdant's body spans 0.871 of the shared
  car box across at 1:1, so `raceScale 1.10` brings it to 0.958, in the band
  Flann (1.056) and Neela (0.917) already sit in. **Lolanthe carries no race
  scale at all**, and that is the measurement rather than an omission: its body
  is wider against its own length than any other car's and already fills the box
  across at 1:1, so it is the width that runs out first and an adjustment would
  make it a different class of vehicle.
- Hulls are traced off each silhouette, twenty-four points each, verified
  against the alpha channel to sit on or inside the visible body at every
  vertex. Lolanthe's stops short of the gold spikes trailing off its rear
  corners and of the ornament above its crown; Verdant's stops at the root of
  its swept rear blades and clear of the side pipe — the same exclusions Neela's
  diffuser blade already gets. Neither falls back on `CAR_HIT_RECT`.
- `js/mechanics.js`: `lolantheCar()`, `lolantheUltActive()`, `verdantCar()` and
  `verdantUltActive()` join `flannCar()` and `neelaCar()` as the only places a
  racer's `car` is compared to a name. `tools/check.mjs` enforces that, and now
  covers all four.
- `controlsLocked(who)` is the single answer to "may this driver issue a
  command?", asked by `move()`, `humanSteer()`, `humanBoost()`, `setBoost()`,
  `canFireUlt()`, `fireUltRival()`, `useItem()` and the three bot decision
  points in `updateRival`. Every route a person or a bot has into the mechanics
  passes through one of those, so no input surface can bypass it — and the
  refusal is at the mechanic rather than at the keyboard.
- `specialContact(by, victim)` is the single resolver for a contact with an
  ulting Verdant on one side of it, called first by both `rearEnd` and
  `bumpTarget`, so the two ways a contact is detected cannot disagree.
- `racerViewAlpha(who, viewer)` is the single answer to "how much of this car
  may this view see", and `drawCar` takes it as a scale rather than a value:
  the handful of places inside the car that set an absolute alpha ask
  `carAlpha()` instead of writing `ctx.globalAlpha`, and the whole car is inside
  one `save`/`restore`, so nothing leaks into the next car.
- `racerDetectable(who)` separates "physically touchable" from "visually
  detectable" instead of abusing `noContact()`. Contact, hazards and the hull go
  on asking `noContact()`; every deliberate bot read — targeting, lane risk,
  lane scoring, threat, softness, the front/back gap and the lane-cover loop —
  and the HUD's edge markers ask this instead.

## Automated checks

Run from the repository root:

```sh
node tools/check.mjs
node tools/menu-check.mjs
node tools/ultimate-check.mjs
node tools/sprite-check.mjs
node tools/hitbox-check.mjs
```

All five pass. What they add for these two cars:

- **`check.mjs`** — the Condition table is six entries in priority order with
  Mind Controlled on the Debuff page; the car-power predicate list covers all
  four cars plus `controlsLocked`, `racerDetectable` and `specialContact`; the
  ad-hoc car-name scan now permits only the four identity predicates; every new
  tuning constant is declared in `js/data.js`; `applyMindControl()` sets `mindT`
  to `MIND_CONTROL_TIME` and **no file anywhere adds to a mind timer**;
  `racerDetectable()` is demonstrably built on `verdantUltActive()` rather than
  on contact; the shared 75 / 15 / 2× lifecycle is untouched; only sprite cars
  carry a race scale and only within the measured band.
- **`menu-check.mjs`** — the six slots were, at the time of this record,
  exactly `flann, neela, lolanthe, verdant, rose, saffron`; the fifth is Rhosyn
  now, and the assertion moved with it. Both new buttons exist, carry
  the right `data-car`, and are reached by the generic `carEl()` path; both
  temperaments moved across with the right numbers and no `TEMPERS.bolt` or
  `TEMPERS.timestamp` survives; both names and ultimate descriptions print in EN
  and FR, say what the power actually does and leak no implementation
  vocabulary; Mind Controlled has a name, a description, a unique colour and a
  vector badge with no PNG in it; and no Bolt or Timestamp string survives
  anywhere in `STR` or on the page in either language.
- **`ultimate-check.mjs`** — the documented collision priority is asserted for
  **every ordered pair of the six cars** against a table written from the rules
  rather than from the code; the aura, the reset semantics, the forced lane
  change, the control lock, the directional defence, both pair overrides, the
  hazard privilege, the bot fairness and the state cleanup each have their own
  test, and every one of them runs in all six ownership directions
  (player / bot / local seat).
- **`sprite-check.mjs`** — seven cached images and no more; both new sheets are
  centred from their own measured bounds at three sizes; every plume root is the
  measured tailpipe at three sizes and three tilts, with as many plumes as the
  artwork has outlets and no more; Verdant is drawn at half in its own column
  and not at all in any other, in one, two, three and four views; the queen note
  pops in, bobs, and pops out; exactly three orbiting notes sit a third of a turn
  apart on a ring measured off the wearer's own box, with no bob and no restart
  on a reset; and a full render of both ultimates changes no race state.
- **`hitbox-check.mjs`** — both hulls are their own traced shapes rather than
  the shared rectangle or a copy of another car's, symmetric, inset within their
  own artwork, and present before either image loads; hiding a Verdant moves
  nothing; and the notes change no collision geometry.

## Manual browser QA

Checked in Chromium against the real page, with the real frame loop and real
key events. The only failing network request is the Google Fonts stylesheet,
which the sandbox's certificate authority blocks; nothing in the repository
404s.

### Sprite scaling and tailpipe alignment

- All six cars on the road together at a range of viewport sizes: the two new
  sprites sit in their lanes at the same visual weight as Flann and Neela, and
  the four-point-rectangle cars are unchanged.
- Boosting, screenshotted and magnified: Lolanthe's two plumes emerge from
  inside the two oval mouths in its rear valance, and Verdant's single plume
  from inside the bore of its side pipe. Checked at three car sizes, stationary
  and boosting, and tilted through a lane change in both directions — the roots
  stay in the mouths.
- The garage and select-screen previews paint both cars from `CARS` directly
  and are unaffected by race scale.

### Lolanthe

- With the aura up over a live race, every racer inside four car lengths takes
  the Condition, in all three lanes, and racers outside it do not. Lolanthe
  never takes itself.
- Racers sharing Lolanthe's lane are pushed out of it and stay out; racers in
  the other two lanes keep their lane. With both doors blocked, the victim still
  takes one of them and the car standing in it is wrecked against the barrier by
  the ordinary barge — a chain reaction the collision system produced, with
  Lolanthe credited with nothing.
- Held bots do not boost, do not fire an ultimate and do not spend an item, for
  sixty frames after being armed with all three. Their cars keep driving.
- `queen_note.PNG` floats above the car, upright through a lane change, rises
  and falls, and pops out rather than vanishing when the meter runs out.
- Exactly three `pion_note.PNG` icons orbit each held racer, a third of a turn
  apart, with no vertical bob.

### Verdant

- In its own driver's view the car is drawn at half opacity; in every other
  view there is nothing at all — no body, no exhaust, no seat ring, no seat
  flag, no Condition badges and no edge marker. Its dot stays on the ladder.
  Confirmed in one view and in two-, three- and four-player split screen, with
  each column answering for its own seat.
- Driving into it with a real `ArrowRight` barge destroys the barging car and
  leaves Verdant alive with its ultimate running; the reveal fires on the
  impact and lapses on its own without cutting the ultimate short.
- An ulting Verdant barging into an ordinary racer shoves that racer across and
  leaves it slowed. Nobody is destroyed and nothing is revealed.
- An ulting Flann meeting an ulting Verdant destroys both, with both meters
  reading exactly `0` afterwards.
- A transformed Neela meeting an ulting Verdant is destroyed with its meter at
  exactly `0`, Verdant survives with its ultimate running, the reveal fires, and
  neither car is teleported anywhere.

### Reduced motion

With `prefers-reduced-motion` honoured, the queen note and all three orbiting
notes are still drawn — the same four images in the same numbers — and two
renders 0.8s apart are pixel-identical, so nothing is moving. Under full motion
the same two renders differ.

## Deliberate decisions

- **Verdant has one exhaust anchor.** Its artwork has one outlet. Giving it a
  second would mean inventing a tailpipe the picture does not have, which is
  exactly what the measured-anchor pipeline exists to prevent.
- **Lolanthe has no race scale.** Adding one would be a guess; the measurement
  says none is needed.
- **The orbiting notes are the vector badge's idea at another size, not the
  same artwork.** `pion_note.PNG` is a world effect. The HUD badge is a path in
  `COND_PATHS` like every other Condition icon, so it survives being drawn at a
  third of its size in a four-way split.
- **A non-ulting Verdant is an ordinary target for Mind Control.** The immunity
  is a fact about the ultimate, not about the car.
- **A bot arms its ultimate and its item on the frame before control lands.**
  The aura is applied after the field has moved, so a bot that was ready to
  press a button a frame earlier is entitled to have pressed it. From the frame
  control lands, nothing more is spent.
