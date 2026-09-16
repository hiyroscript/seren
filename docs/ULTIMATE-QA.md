# Shared ultimate regression checks

The final instruction in `upd` sets the duration to **15 seconds**, superseding
its earlier five-second examples. Charge remains 75 seconds and pace remains 2×.

Run from the repository root:

```sh
node tools/check.mjs
node tools/menu-check.mjs
node tools/ultimate-check.mjs
```

Verified with the real game scripts and DOM/Canvas test doubles:

- All six cars as the main player, a bot, and a human-controlled rival: activation,
  fixed timer, countdown fraction, ignored repeat presses, normal expiry and no
  secondary effect; pace alongside Slowed and the rear-end shunt; no cleanse or
  contact protection.
- Puddles, tumbleweeds, meteors, oil and seekers affect active ultimate users.
- Ordinary barging can move or wreck an ultimate user. Every pair of car models
  uses ordinary rear contact, including when both ultimates are active.
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

Results: **170 ultimate regression checks**, **80 menu checks**, and the static,
translation, condition-table, launch-absence and saved-data checks pass. The
static checker reports its usual warning about strings referenced dynamically.

A manual repository search found no car-dependent ultimate logic, ultimate-only
status state, duration extension, or old power helper remaining in runtime code,
and no remaining trace of the removed airborne launch mechanic — `tools/check.mjs`
now enforces the latter on every run. `upd` is retained as the original task
specification. Car body artwork (including Rose's badge and Siren's static
lightbar), temporary invulnerability, puddle rendering, and `smashFx` (used by the
seeker) are retained because they are live non-ultimate code. No dormant ultimate
power implementation remains.

These are automated behavioral checks, not browser visual review or physical
controller testing. Those manual checks have not been performed.
