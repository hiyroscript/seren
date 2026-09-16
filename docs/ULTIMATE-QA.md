# Shared ultimate regression checks

The final instruction in `upd` sets the duration to **15 seconds**, superseding
its earlier five-second examples. Charge remains 75 seconds and pace remains 2×.

Run from the repository root:

```sh
node tools/check.mjs
node tools/menu-check.mjs
node tools/ultimate-check.mjs
node tools/sprite-check.mjs
node tools/hitbox-check.mjs
```

Verified with the real game scripts and DOM/Canvas test doubles:

- All six cars as the main player, a bot, and a human-controlled rival: activation,
  fixed timer, countdown fraction, ignored repeat presses, normal expiry and no
  change to the other racer; pace alongside Slowed and the rear-end shunt; no
  cleanse, no Invulnerability and no refusal of contact.
- Puddles, oil and seekers affect active ultimate users, every car included.
  Tumbleweeds and meteors affect the five cars that are not Flann.
- Ordinary barging can move or wreck an ultimate user, for those five. Every
  pair of car models uses ordinary rear contact when both ultimates are active,
  except the pairs containing exactly one Flann.
- Custom rules stop ultimate activation and charging. All drivers use the
  75-second charge rate. Temporary Invulnerability and finish protection remain
  independent of the ultimate, and remain distinct from each other: a finisher
  is untouchable without ever being reported as Invulnerable.
- All six bots activate on each difficulty using the common lifecycle.
- Four local seats activate via `humanUlt`, render, ignore repeated input and
  expire independently, rotating the selections to cover every car.
- Normal and local HUD/render paths execute, including the condition badges
  beside rival cars and in the HUD corner. Only Boosted is created by an
  otherwise clean ultimate; Invulnerable still lights the gold edge and outranks
  Boosted in the stack.
- Every Condition is derived from the state that owns it and from nowhere else,
  for the player and for rivals, bot or human alike.
- A finished racer is out of every target list, collision, hazard, item and
  debuff, shows no Condition badge, and a seeker already locked on gives the mark
  up harmlessly.
- All five Conditions have one colour, one type and one piece of icon artwork
  each, shared by the canvas and the SVG renderers; there is no `launched` or
  `winner` Condition.
- Timestamp leaves rival pace, meteor fall timing and tumbleweed motion unchanged.
- EN/FR garage, reference and menu navigation pass the existing menu suite.
- Mystery Bubble rewards are temporarily disabled behind `MYSTERY_ITEMS_ENABLED`.
  A player, a bot and a local human seat each sweep a bubble from the same row
  and none comes away holding anything: no item, no trade flash, no bot fuse, no
  boost can, no slick and no missile. Repeating it eight times over changes
  nothing. `useItem()` refuses a manually set Can, Oil or Seeker and drops it, so
  stale state cannot go off later. The roll, the rarities, the artwork and every
  branch of `useItem` are still present and still correct — the static suite
  checks that too, along with `rules.bubbles` remaining a separate switch.

### Flann's ram, the one car-specific power

The shared lifecycle above is unchanged for Flann — 75-second charge, 15-second
duration, 2× pace, one `ultOn`, no separate state machine. What it adds while
that lifecycle runs is a collision and hazard power, behind the single
`flannUltActive(who)` predicate, verified for Flann as the main player, as a
bot and as a local human rival:

- The tumbleweed is destroyed on contact and applies no Slow and no meter
  penalty; debris is thrown, so it reads as smashed rather than missed.
- A meteor blast cannot wreck it and does not end the ultimate; the explosion
  still happens. A falling rock on the roof is smashed through rather than
  detonating.
- A puddle still applies Obscured, keeps its spray, and leaves the puddle on the
  road — an ulting Flann can be Boosted and Obscured at once. Water is the
  deliberate exception: it is liquid and cannot be rammed apart.
- Rear-ending another racer wrecks that racer; being rear-ended wrecks the
  attacker. Barging out of a lane destroys whoever was in it; barging into
  Flann wrecks the barger and does not move Flann. Flann takes no Slow, shunt
  or wreck for a contact it wins.
- The lane-change entry points (`move`, `rivalLaneTo`) read `bumpTarget`'s
  outcome and do not go on to move a car that has just wrecked itself.
- Respawn invulnerability and finish protection remain authoritative in both
  directions: a ram cannot reach a protected racer, and a protected Flann is
  reached by nobody. No spawn-killing and no altered result.
- Expiry restores ordinary tumbleweed, meteor and racer-collision vulnerability
  immediately.
- Two ulting Flanns cancel and fall back to the ordinary shunt.
- The same ram is proved through `update()` and `updateRival()`, not only
  through direct calls.

Explicit non-Flann regression coverage proves the other five gain nothing: the
tumbleweed still slows them during their ultimate, a meteor still wrecks them,
a puddle still blinds them, and racer contact stays the ordinary shunt and
barge.

Results: **216 ultimate regression checks**, **80 menu checks**, **17 sprite
checks**, **15 hitbox checks**, and the static, translation, condition-table,
launch-absence, Mystery-gate, Flann-power and saved-data checks pass. The static
checker reports its usual warning about strings referenced dynamically.

There is now exactly one piece of car-dependent ultimate logic in the game, and
`tools/check.mjs` enforces that it stays one: `flannUltActive()` is the only
place a racer's car is compared to Flann, and the contact rules, the hazards and
the renderer all read it rather than reassembling the test for themselves. There
is still no ultimate-only status state, no duration extension and no second
ultimate state machine; the charge clock, the duration and the pace multiplier
are shared by all six and unchanged. No trace of the removed airborne launch
mechanic remains — `tools/check.mjs` enforces that on every run too. `upd` is
retained as the original task specification. `smashFx` is now used by the seeker
and by Flann's ram alike.

These are automated behavioral checks, not browser visual review or physical
controller testing. Those manual checks have not been performed.
