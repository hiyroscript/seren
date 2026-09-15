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
  secondary effect; slowed and airborne pace; no cleanse or contact protection.
- Puddles, tumbleweeds, meteors, oil and seekers affect active ultimate users.
- Ordinary barging can move or wreck an ultimate user. Every pair of car models
  uses ordinary rear contact, including when both ultimates are active.
- Custom rules stop ultimate activation and charging. All drivers use the
  75-second charge rate. Respawn immunity, finished protection and airborne
  contact protection remain independent of the ultimate.
- All six bots activate on each difficulty using the common lifecycle.
- Four local seats activate via `humanUlt`, render, ignore repeated input and
  expire independently, rotating the selections to cover every car.
- Normal and local HUD/render paths execute. Only Boosted is created by an
  otherwise clean ultimate; real immunity still lights the immune treatment.
- Timestamp leaves rival pace, meteor fall timing and tumbleweed motion unchanged.
- EN/FR garage, reference and menu navigation pass the existing menu suite.

Results: **167 ultimate regression checks**, **70 menu checks**, and the static,
translation and saved-data checks pass. The static checker reports its usual
warning about strings referenced dynamically.

A manual repository search found no car-dependent ultimate logic, ultimate-only
status state, duration extension, or old power helper remaining in runtime code.
`upd` is retained as the original task specification. Car body artwork (including
Rose's badge and Siren's static lightbar), launch strength helpers, genuine
immunity, puddle rendering, and `smashFx` (used by the seeker) are retained because
they are live non-ultimate code. No dormant ultimate power implementation remains.

These are automated behavioral checks, not browser visual review or physical
controller testing. Those manual checks have not been performed.
