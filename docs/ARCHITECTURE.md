# Architecture

How SEREN is put together, and where to change what.

The whole game is fifteen classic `<script defer>` files, one stylesheet and one
HTML shell. There is no build step, no bundler, no package manager and no
dependency. If you can serve a directory, you can develop it.

---

## Contents

- [The loading contract](#the-loading-contract)
- [One shared scope](#one-shared-scope)
- [The `who` convention](#the-who-convention)
- [Game state: `G`](#game-state-g)
- [The frame](#the-frame)
- [Coordinates and the split screen](#coordinates-and-the-split-screen)
- [File by file](#file-by-file)
- [Invariants worth not breaking](#invariants-worth-not-breaking)
- [How to add things](#how-to-add-things)
- [Testing](#testing)

---

## The loading contract

`index.html` ends with fifteen tags in exactly this order:

```
core → i18n → data → audio → runtime → ui → settings → local → ai → mechanics → race → render → hud → input → main
```

`defer` buys two guarantees: the document is fully parsed before any of them run,
and they run **in document order**. Both matter.

The order is a real dependency order for anything that executes *at load time*:

| File | Needs at load time |
| --- | --- |
| `i18n.js` | `store` from `core.js` |
| `runtime.js` | `$` from `core.js`, `ULT_TIME` from `data.js` (it is in the `G` literal), and `#cv` in the DOM |
| `ui.js`, `audio.js` | `store` from `core.js` |
| `settings.js` | `store` and `clamp` from `core.js` — it reads every saved preference at load |
| `input.js` | `cv` from `runtime.js` (it registers listeners on it) |

Everything else is function bodies, which do not care about order because they do
not run until `main.js` boots. That is why `applyLang()` in `i18n.js` can call
`paintPicks()` from `ui.js`, loaded five files later — the call happens at boot,
by which point every script has executed.

**`main.js` is last and is the only file that starts anything.** Other files
define systems; `main.js` connects and starts them. If you find yourself wanting
to run something at load time in another file, that is the signal it belongs in
`main.js`.

## One shared scope

There is no IIFE and no module system. Every file opens with `"use strict"` and
declares into the one global script scope, so `mechanics.js` can call `later()`
from `race.js` without ceremony.

The consequences, stated plainly:

- `function` declarations become properties of `window` (357 of them).
- `const` / `let` become global lexical bindings — visible everywhere, but not on
  `window` (200 of them).
- **Every top-level name must be unique across all fourteen files.** A duplicate
  `const` is a `SyntaxError` that kills the page; a duplicate `function` silently
  wins.
- None of the 557 current names collides with a browser global. Keep it that way —
  avoid `name`, `status`, `length`, `top`, `self`, `origin`, `event`, `screen`,
  `history`, `location`, `find`, `focus`, `blur`, `open`, `close`, `print`, `stop`.

`node tools/check.mjs` enforces both, so you do not have to remember them.

This was a deliberate trade for staying build-free. Hiding the internals again
means either a bundler or rewriting 557 cross-file references as imports.

## The `who` convention

Almost every gameplay function takes a `who` that is one of two things:

- the string `"me"` — player one, whose state lives directly on `G`
- a **rival object** from `G.rivals` — every other car, bot or human

The idiom that appears everywhere is:

```js
const o = who === "me" ? G : who;
```

This is why the same function drives a bot, a second player on a controller, and
you. `startUlt`, `useItem`, `tickUlt`, `clearDebuffs` and the rest each
have exactly one implementation.

Field names differ slightly between the two — `G.slipT` vs `R.slip`,
`G.slowT` vs `R.slow` — a historical wart. Helpers like
`invulnerableWho`, `noContact`, `refusesDebuffs` and `activeConditions` exist to
paper over it; prefer them to reaching into the fields.

Player one is *also* listed in `G.humans[0]` as the string `"me"`, so local-play
code can iterate seats uniformly.

## Game state: `G`

One object in `runtime.js` holds the entire mutable race. It is reset field by
field in `startRace()` — not replaced — so every reference stays valid.

Roughly grouped:

| Group | Fields |
| --- | --- |
| Lifecycle | `state` (`idle` / `countdown` / `running` / `paused` / `over`), `mode`, `diff`, `timers` |
| Your car | `lane`, `x`, `tilt`, `speed`, `meters`, `charge`, `boosting`, `dead`, `invuln` |
| Your ultimate | `ult`, `ultOn`, `ultT`, `ultMax` |
| Conditions on you | `slowT`, `blind`, `slipT`, `canT`, `shuntT`, `invuln` |
| The world | `biome`, `next`, `seam`, `build`, `props`, `walks`, `traps`, `fx` |
| Objects in play | `boxes` (bubble rows), `slicks`, `missiles` |
| The field | `rivals`, `humans`, `picks`, `results`, `finished`, `finishAt`, `tracksLeft` |
| Local play | `local`, `players`, `padIds`, `seat`, `pk`, `custom`, `rules` |

`G.rules` is the custom-race rule set (`{bots, traps, bubbles, boost, ults}`).
Never read it directly — use `ruleOn("traps")` and `botsWanted()`, which cope with
it being missing.

## The frame

```
frame(ts)                       race.js — requestAnimationFrame loop
  dt = min(ts - last, 0.05)     one clamp, so a background tab cannot leap
  update(dt)                    race.js — advance the world
  render()                      render.js — draw it
  paintHUD(false)               hud.js — sync the DOM HUD
```

`update(dt)` is the single ordering authority. Its shape:

1. `tickCountdown` and `viewBounds`
2. local play: poll pads, check for a dropped controller, drive each seat
3. your speed, distance, boost charge, lateral position
4. scroll the world; generate scenery ahead, cull behind
5. the race clock and track/speed-tier timers
6. your ultimate: charge, tick, fire
7. your status timers, then `sweepDebuffs`
8. `updateBubbles` → `updateSlicks` → `updateMissiles` → `updateTraps` (move hazards)
9. your rear-end check, then `updateRivals` (defer hazard contact), then `resolveTraps`
10. `lolantheAuras`, `checkFinish`, `updateFx`, seam handover

Hazard resolution consumes poses captured before movement and the settled
positions of every racer. `trapContact()` owns the swept narrow phase for
puddles, weeds and falling rocks, and `trapCarAt()` evaluates the current
model's traced hull along that motion. Meteor blasts use the precise impact
fraction within the frame. `hitRivalTraps()` retains the rival consequences
and per-racer masks; isolated `updateRival()` calls also use that same helper.
Dodge prediction shares `puddleHits()`, `weedBodyRadius()`, `meteorRockRadius()`
and `rockAlt()` with live contact. No separate bot collision shape exists.

Two things follow from that order and are easy to break:

- **Rivals move after the world does.** A rival's frame reads a world that has
  already scrolled this tick.
- **`botLook` runs before `rivalThink`**, so a bot decides on the road it is
  actually on rather than on the one it saw last tick.

Pausing works by returning early from `update` (`state === "paused"`), which is
why the countdown is driven from the frame loop and not from a timer — a timer
would keep running behind the pause panel. Race-lifecycle timeouts that *must*
survive go through `later()`, which records them in `G.timers` so `clearTimers()`
can cancel the lot between races.

## Coordinates and the split screen

Everything is drawn in **design pixels**; the canvas backing store is sized by
`DPR` and the desktop scale, and `ctx.setTransform` divides that back out. Game
code never thinks about device pixels.

Local play draws the same world once per person, in equal columns:

| Name | Means |
| --- | --- |
| `W` | the width of **one view**, never of the canvas |
| `FULLW` | the whole canvas, in design px |
| `VIEWS` | how many columns the canvas is cut into |
| `CAMDY` | this view's camera shift, in master screen px |
| `CT`, `CB` | what this view can see, in master screen coords |
| `VOWN` | whose view is being drawn (`"me"` or a rival) |
| `VW_TOP`, `VW_BOT` | the union of every view — what the world must cover |

Because `W` is one column and every world dimension has always measured off `W`, a
column is simply a narrower game: not one line of road, scenery or car code has to
know how many columns there are.

`VW_TOP`/`VW_BOT` are the reason scenery generation and culling use those bounds
rather than `0`/`H`: with four players strung out along the road, the world has to
exist for all of them at once, or the leader drives through nothing.

`camDy(who)` gives a car's camera offset; `perTop(off, per)` gives the first `y` of
a periodic road pattern at or above the top of the current view.

## File by file

### `core.js`
`store` (localStorage with a memory fallback), `$`, `clamp`, `lerp`, `rand`,
`randi`, `withA` (hex → rgba), and the capability flags: `DESKTOP`, `LANDSCAPE`,
and `motionReduced()` over `MOTION_QUERY` and `motionPref`. Plus `SPLASH_IMAGE`,
`SPLASH_MS`.

`motionReduced()` is the single answer to "should this move?" — it resolves the
player's `system` / `reduced` / `full` choice (written here by `settings.js`)
against `prefers-reduced-motion`. Anything drawn frame by frame from JS sits
outside the stylesheet's rule and asks it; the stylesheet answers the same
question from `<html data-motion>`. Never read the media query anywhere else.

Nothing here owns a game system. If a helper knows what a car is, it does not
belong here.

### `i18n.js`
`STR` is a flat map of key → `{en, fr}`. `t(k)` returns the current language, and
falls back to English and then to the key itself — a missing string shows as a
visibly wrong key rather than taking down the screen that asked for it.

`applyLang()` sweeps two attributes and repaints the language-dependent screens:

- `[data-i18n]` writes the string into `textContent`.
- `[data-i18n-aria]` writes it into `aria-label`. Icon-only controls — pause,
  back, close, settings, the ultimate and item squares — carry their name
  nowhere else, so that label has to be translated like any other copy. Never
  hard-code an `aria-label` in the HTML; give it a key.

`chooseLang(code)` is the only way the language ever changes: it validates,
saves `seren.lang` and repaints. The first-run picker and the Settings row both
call it, so neither can save or repaint in a way the other does not.

Adding a language means adding a third code to every entry, adding a
`.lang-opt` button and a Settings segment, and nothing else.

### `data.js`
Every definition and every tuning number: `CARS`, `DIFFS`, `TEMPERS`,
`CONDITIONS`, `RARITY`, `ITEMS`, `TRACKS`, and the constants. See
[TUNING.md](TUNING.md).

Loaded before `runtime.js` because the `G` literal reads `ULT_TIME`. Nothing here
has behaviour of its own — `makeTemper`, `bubbleR`, `rockLead` and `rockAlt` are
accessors on the numbers beside them.

### `audio.js`
Everything is generated; there are no audio files. `audio()` creates the context
on first call and caches it, which keeps creation inside a user gesture so
browsers do not refuse it. `tone()` and `noise()` no-op when sound is off or the
context could not be made, so callers never have to check.

Every voice is connected through the one `master` gain, and `masterGain()` is
what it should be: `0` when sound is off, the player's level when it is on.
`setSound()` and `setVolume()` are the two doors — nothing multiplies a volume
into an individual effect, and a node already playing follows the change.

### `runtime.js`
The canvas, the two contexts (`roadCtx` and the swappable `ctx`), the road
geometry, the split-view geometry, `G`, the rule readers (`defaultRules`,
`botsWanted`, `ruleOn`, `diff`), `layout()`, `laneCX()`, `deskFit()` and
`resize()`.

`ctx` is a `let` on purpose: `paintCarIcon` in `ui.js` borrows it for a moment so
the select-screen thumbnails come out of the same `drawCar` the road uses, then
puts it back in a `finally`.

### `ui.js`
Screen switching, focus management, setup summaries, the reference index,
custom rules, car picking, and shared Canvas car previews. Gameplay logic lives
elsewhere.

- `show(id)` sets `menuScreen`, toggles screen visibility, remembers the invoking
  control, and restores focus. `SETUP_IDS` identifies the full-screen race setup
  destinations. Home stays visible underneath to retain the moving road, while
  its title and controls fade away. The `menu` body class gives menus the full
  viewport; entering a race restores the existing race shell and scaling.
- `activeModal()` walks `MODAL_IDS` — the language picker, Settings, pause and
  results, topmost first — and is the one answer to "what is in front?".
  `gateFocus()` and `menuKeydown()` both ask it, so a new dialog is one entry in
  that list rather than three chains of ors.
- `gateFocus()` makes every inactive screen inert (a dialog outside the screens
  covers all of them; the race panels only gate the HUD), and moves focus into
  and out of dialogs. `menuKeydown()` contains Tab within the active surface and
  routes Escape to its Back control — or to the dialog in front, one keypress for
  one action. Native button activation owns Enter and Space in menus.
- `setupSummary()` reads the mode, player count, style, bots and difficulty from
  `G`. It is presentation only. `paintCustom()` still writes through the original
  rules and restores focus after rebuilding controls.
- `paintPicks()` keeps the seven direct-pick buttons, taken states and player roster
  current. `previewCar()` renders the focused/hovered vehicle at showroom size
  using the same `paintCarIcon()` / `drawCar()` path as the other car artwork.
  Previewing never commits a pick. The board remains three columns for gamepads.
- `infoCard()` creates reference entries with shared data; the index uses proper
  tab semantics and arrow-key navigation.

### `settings.js`
Player preferences and the dialog that edits them. One authoritative value per
preference, held in `settings` and written straight to `store`; nothing reads a
preference back off the DOM.

- `SETTINGS_KEYS`, `SETTINGS_DEFAULTS` and `SETTINGS_ALLOWED` are the contract.
  `settingValue()` validates on the way in, so a hand-edited or out-of-date key
  falls back to its default rather than travelling further into the game.
- `getSetting()` / `setSetting()` are the only accessors. `setSetting()`
  validates, saves, applies and repaints, in that order.
- `applySettings()` hands each value to whatever carries it out: `setSound()` and
  `setVolume()` in `audio.js`, `motionPref` in `core.js`, `data-motion` and
  `data-contrast` on `<html>`, and the `no-hints` body class. It runs at boot and
  after every change, so the game can never be running on a value the player no
  longer has.
- `paintSettings()` writes that same state on to the controls — segments,
  switches, the slider and the restore row — and is the only thing that touches
  them. Call it; never set a control by hand.
- `openSettings()` / `closeSettings()` own visible state, paint, focus and inert
  behaviour together, through `gateFocus()`.
- `restoreSettings()` resets the keys in `SETTINGS_KEYS` and nothing else: the
  personal best and the language in use are not this button's to throw away.

### `local.js`
Seats and player colours (`seatOf`, `seatCol`), the pad primitives (`padPoll`,
`padOf`, `padBtn`, `padAxis`, `newPadKeys`) and the two menu loops that run only
while the controller sheet or the car sheet is up.

A seat holds its pad's **slot number**, not its position in the list — the list
closes up when a pad drops out, and binding to "the third one connected" would
hand player three somebody else's controller mid-corner.

### `ai.js`
Sense → weigh → act, once per think-tick.

- `botSense` builds one honest picture of the race from where a car sits.
- `botTarget`, `laneScore`, `botUltValue` and `botItemWorth` score the options
  against it.
- `rivalThink` takes the best one and writes down what it meant to do next.

Two rules hold it together. Nothing in here asks whether a car has a person behind
it — the player is a row in the same list, scored by the same terms. And the mind
only ever *decides*: the doing is handed back to the same mechanics your inputs
call.

### `mechanics.js`
The rules of the road, shared by every car on it: contact and collisions, lane
changes, boost, wrecking and respawning, Conditions, ultimates, items, hazards,
particles.

Three layers sit on top of each other and are deliberately not the same thing:

- `finishedCar` / `finishedMe` — the race lifecycle state. Crossing the line puts
  a racer out of play permanently. It is not a Condition and it never shows as
  one.
- `invulnerableCar` / `invulnerableMe` / `invulnerableWho` — the temporary
  Invulnerable Condition and nothing else. This is what `activeConditions` reads.
- `noContact` — the one internal answer to "can anything reach this car?", which
  is any of four: finished, wrecked, invulnerable, or away in Aero-Glow. Every
  contact, hazard and targeting test asks this rather than reassembling it. The
  first three are protections — the racer is there and something is refusing to
  let the road have it. The fourth is not: `rhosynElsewhere(who)` says there is
  no body at that position to reach, because the body is somewhere the race does
  not go.

`activeConditions(who)` is the single derivation of which Conditions a racer has
right now, read straight off `slowT`/`slow`, `blind`, `slipT`/`slip`, `mindT`,
the boost state and the invulnerability timer. There is no second, mutable copy to fall out
of step, and the order it returns is `CONDITIONS`' own key order so a stack of
badges never reshuffles. A finished racer returns none.

`startUlt`, `tickUlt` and `endUlt` manage one fixed 15-second speed multiplier
for every driver, and that lifecycle is shared by all seven cars. Five cars add a
power on top of it. Four of those five are applied at the consequence or at the
view rather than through `noContact()`: an ulting Flann, Neela or Lolanthe still
has to physically meet a racer or a hazard for anything to happen, an ulting
Verdant is invisible and still physically there to be run into, and a puddle
still gets through to all four. Rhosyn's is the fifth and the exception — the
one car-specific state `noContact()` reads, because it is the one that is about
there being a body at all. `flannCar()`, `neelaCar()`, `lolantheCar()`,
`verdantCar()` and `rhosynCar()` are the only five places in the game a racer's
`car` is compared to a name; everything else asks one of the predicates built on
them.

**Flann is a ram** while `flannUltActive(who)` is true — the racer exists, its
car is `flann`, and its ordinary `ultOn` is running.

- `offensiveRam(by, victim)` accepts only a Flann-initiated contact against a non-ulting-Flann victim. Incoming contacts use ordinary rules.
- `rearEnd` and `bumpTarget` ask it. The loser is wrecked through the
  existing lifecycle (`wreckRacer` → `destroyCar` / `wreckRival`, so blame,
  meter penalty and reward, particles, shake and audio are all the usual ones)
  and the winner takes no slow, shunt or cooldown for it.

**Neela changes shape**, and its two states are deliberately not one question:

- `neelaUltActive(who)` is "the fifteen seconds are running". It carries the
  solid-hazard privilege for the whole of them.
- `neelaFormActive(who)` is "the alternate body is the one on the road". It
  carries the single exchange, and it is what `racerModel()` reads.

They are the same until the first racer contact and different from then until
the meter runs out. `beginNeelaForm` (from `startUlt`) captures the activation
pose *before* anything about the racer changes, raises the form, and starts the
racer's own whiteout and body flash. `swapMover(a, b)` says which of two racers
in contact is a transformed Neela with its exchange unspent — two of them
cancel, exactly as two Flanns do — and `neelaSwap` performs it: both world poses
are read first, the form is dropped with its flash, both racers get a whiteout
and a flash, and then each is put on the other's pose. Neither is wrecked and
the meter is not touched. `leaveNeelaForm` also runs on natural expiry, with no
teleport; `clearNeelaState` runs on a wreck or a finish, without the flash,
before `endUlt` is reached.

**Lolanthe takes the road** while `lolantheUltActive(who)` is true. There is no
second clock and no form to spend, so that predicate is the whole of the
question.

- `lolantheAuras(dt)` runs once a frame from `update()`, after the whole field
  has moved, so it reads one settled picture of the road rather than a
  half-updated one. `mindRange()` is `carH * MIND_AURA_LENGTHS` — four car
  lengths measured off the shared car box, so it is the same stretch of road at
  any viewport size and in any column — and every racer is measured against it
  in the master frame, which is what keeps the answer independent of `VOWN`.
- `mindTakes(by, target)` is the guest list: not Lolanthe itself, not a wreck,
  not a finisher, nothing refusing debuffs, and never an ulting Verdant.
- `applyMindControl(target)` **sets** `mindT` to `MIND_CONTROL_TIME` and never
  adds to it, so exposure holds a racer rather than accumulating. The entrance
  animation and the one-time coin toss for the middle lane belong to the
  inactive-to-active transition alone; a timer being reset replays neither.
- `controlsLocked(who)` is the single question every input surface asks —
  `move()`, `humanSteer()`, `humanBoost()`, `setBoost()`, `canFireUlt()`,
  `fireUltRival()`, `useItem()` and the three bot decision points in
  `updateRival`. Nothing else is needed, because every route a driver has into
  the mechanics passes through one of them. It is not a freeze: physics, the
  road, timed effects, the wreck lifecycle and an ultimate already running all
  carry on.
- `mindShove(victim)` is the forced lane change, and it deliberately goes
  nowhere near `move()` or `rivalLaneTo()`: it ignores the control lock it would
  otherwise trip over and ignores a Skidded car's reversed steering, because
  both are facts about the driver and the driver is not the one doing this. The
  destination does not have to be empty — whatever is in it is met through
  `bumpTarget` with the *victim* named as the racer that arrived, so a crash
  belongs to the collision system and never to a ram Lolanthe does not have.

**Verdant disappears** while `verdantUltActive(who)` is true, and that is all it
does to itself. `verdantHide` is a cosmetic 0-to-1 ramp advanced by
`tickVerdant`; the hitbox, the contact rules, the race order and `noContact()`
never read it.

- `racerViewAlpha(who, viewer)` answers per view off the existing split-screen
  viewer identity: `VERDANT_OWN_ALPHA` in its own driver's column, nothing in
  everybody else's. `drawCar` takes it as a scale, and the few places inside the
  car that set an absolute alpha ask `carAlpha()` instead of writing
  `ctx.globalAlpha` themselves, so a hidden car cannot be outlined by its own
  exhaust and nothing leaks into the next car.
- `racerDetectable(who)` separates "physically touchable" from "visually
  detectable". Contact, hazards and the hull go on asking `noContact()`;
  anything that is a driver reading the road — `botTarget`, `laneRisk`,
  `laneScore`, `threatOf`, `softness`, the front/back reads in `botSense`, the
  lane-cover loop and the HUD's edge markers — asks this instead. `carSeenAt()`
  is `carAt()` filtered through it.
- `specialContact(by, victim)` is the one resolver both `rearEnd` and
  `bumpTarget` call before anything else, so the two ways a contact is detected
  cannot disagree. In order: an ulting Flann and an ulting Verdant destroy each
  other through `mutualWreck` with both meters emptied afterwards, an
  alternate-form Neela meeting one is destroyed with its meter emptied and no
  exchange, and anything else that *arrives into* one is destroyed. A Verdant
  that did the arriving gets `null` and the ordinary rules underneath. Two
  ulting Verdants cancel, exactly as two Flanns do.
- `verdantReveal(who)` is the split second of full visibility a hit buys. It is
  cosmetic: the ultimate is not cut short, the meter is untouched, and the
  immunity to Lolanthe's aura holds right through it.

**Rhosyn goes somewhere else** while its phase is running, and this is the one
power whose whole point is an absence. The invariant the section exists to keep:
**Rhosyn never has a second race position.** Aero-Glow is a view and an
isolation over the same canonical racer. Nothing in the mechanic teleports the
racer, freezes it, captures a pose to restore it from, advances a distance
counter of its own, or writes `G.biome`, `G.next`, `G.seam` or `G.trackT`. The
racer's lane, lateral x, tilt, speed, metres, ranking, finish progress, seam
crossings and biome progression are the canonical ones the shared simulation
goes on advancing throughout.

That is the whole reason the return needs no correction: the car is already
exactly where the race has put it, in whatever biome the race has actually
reached. Implementing it by swapping `G.biome` or by teleporting away and back
would break precisely that — the position would have to be guessed on the way
home, every rival's metres are measured against player one's camera and would
move with it, and a biome swapped under the whole field changes what every other
column is looking at.

- `aeroPhase` is the state, carried by every racer like Neela's form and
  Verdant's fade: `"off"`, `"in"`, `"glow"`, `"out"`. `aeroT` is the transition
  clock, running only in `"in"` and `"out"`. `aeroHide` is a cosmetic 0-to-1
  ramp, derived every frame from the phase exactly as `verdantHide` is.
- `beginAeroGlow(who)` (from `startUlt`) sets the phase and starts the shared
  whiteout and body flash. It reads no position and saves none, because nothing
  is ever going to be put back on one. `beginAeroReturn(who)` (from `endUlt`)
  starts the way home; a racer wrecked or finished has had its phase cleared
  before `endUlt` is reached, the same order `clearNeelaState` is called in, so
  neither of those goes through the return.
- `tickAeroGlow(who, dt)` advances both from the ordinary update loop, so a
  paused race pauses the departure, the void and the return. At the end of
  `"out"` it calls `rejoinSharedRoad(who)`, which grants the existing
  Invulnerable Condition for `INVULNERABLE_TIME` as `max(existing, 2)`. There is
  no second shield timer and no per-hazard exception.
- `rhosynElsewhere(who)` is the single source of truth every other system reads,
  and the isolation is symmetric by construction: every contact test in the file
  asks `noContact()` of both sides, so a racer nothing can reach reaches nothing.
  `racerDetectable()` is false for it too, so no driver and no bot is shown a
  marker or a gap reading for a car that is not on the road.
- `aeroGlowViewActive(who)` is which world that racer's own view draws, and it
  is deliberately not the same question: the view changes hands under full white
  in each direction, so the car is unreachable while its driver is still looking
  at the shared road, and still looking at the void for the moment after the
  meter has run out.
- The paths that tested `dead`/`finished` directly rather than asking
  `noContact()` were audited and now ask: the player's hazards in `updateTraps`,
  the rivals' in `hitRivalTraps`, both halves of the bubble sweep in
  `updateBubbles`, `seekerTarget` and `markShielded`. `useItem()` refuses and
  **keeps** the item rather than spending it into a world its owner is not in.

`clearsSolidHazards(who)` is the one question those four powers answer:
`hitWeed` and the rival hazard sweep in `race.js` smash the tumbleweed instead
of taking Slow, and the falling rock and `detonate`'s blast cannot reach the
car. Puddles are the deliberate exception for all four and still apply normally:
water is not a solid thing to break. Rhosyn is deliberately not in that list and
does not need to be: nothing reaches a car that is not on the road, which is
stronger than a privilege over two of the hazards.

`bumpTarget` returns the outcome — `none`, `moved`, `wrecked`, `rammed`,
`stopped` or `swapped` — and `laneChangeDied()` says which of those leave no
lane change to finish, so `move()` and `rivalLaneTo()` never go on to move a car
that has just been wrecked on an ulting Flann or traded away by a Neela.

For grounded Saffron, for Flann the moment its ultimate expires, for Neela from
the exchange onwards, and for Lolanthe throughout — its power is the aura and
the shove, never a contact it wins — `rearEnd` and `bumpTarget` apply ordinary
contact rules regardless of ultimate state; the short forward shove a rear-end hands its
victim is `SHUNT_TIME` / `SHUNT_BOOST` and shows as Boosted. `swapGuard` is a
single step's worth of "this contact has already been dealt with", not
protection: it exists only so the two bodies an exchange has just put down
cannot be read as a second contact in the same frame.

### Where a racer actually is

Every racer owns an authoritative longitudinal distance: `G.meters` for Player 1
and `R.m` for each rival (bot or local human). `metersOf(R)` reads that distance.
Live rivals advance by their own `R.abs * dt * 0.075`, independently of visibility,
Player 1's movement, or Player 1's wreck timer. A rival's own wreck holds its
metres fixed until it respawns.

`R.y` is a read-only getter: `playerY - (R.m - G.meters) / 0.075`.
It has no clamp and no stored simulation state. Camera movement, resizing and
rebasing therefore cannot change progress or collapse separated racers into
false collision proximity. AI, HUD, targeting and finishes use `metersOf()`;
rendering and collision geometry read the same unclamped projection.

- `racerWorldPose(who)` returns `{ m, lane, x }`, independent of the camera.
- `teleportRacerToPose(who, pose)` sets a rival's canonical metres, lane and x.
  For Player 1 it calls `rebaseWorld(dy)`: `G.meters` and `G.scroll` change,
  screen-stored hazards/scenery/trails shift, and rival projections follow
  automatically. Unrelated rivals' metres, finish lines and parking marks do
  not change. Neela swaps use these same helpers.
- Rear-end separation writes canonical metres; it is actual displacement,
  unlike a camera rebase. Other y mutations belong to hazards, effects or scenery.
- Finish places are locked at crossing. During rollout, `R.m` follows `R.parkM`
  with the existing easing and parking staircase, so parked cars keep their
  world location while the rest of the field races.

### Which body a racer is wearing

`racerModel(who)` chooses the base entry, Neela’s alternate form or Saffron’s dragon. `racerDims()` and `carHit()` read that same model. Neela uses a relative model scale; Saffron uses `laneSpan:2`, measured against each view’s lane geometry. Saffron’s altitude is separate presentation state; no second race coordinate exists.

Body contact is centralized in `carHit(who)`. Flann uses an inset eight-point
`hitShape` in logical car units, Neela an eighteen-point one traced off
`v_neela.PNG` and a twenty-point one traced off `vtm_neela.PNG`; the other four cars also carry measured polygons. All of them rotate with the
rendered tilt. The shape is multiplied up by the racer's own size out of
`racerDims()`, so a car drawn larger on the road is collided larger by exactly
the same factor — a sprite car's hull scales with its sprite and there is never
a big car carrying a small hitbox. Hitboxes never read
image alpha, image readiness, camera offsets or DPR. `nearestOnCar()` tests the
polygon for round hazards, pickups and seekers. `rearContact()` requires actual
body overlap; `carAt()` deliberately projects into a target lane for the barge
mechanic.

Puddles share their quadratic control points with the renderer; contact flattens
the curves with at most 0.15 logical pixels of chord error. Oil contact uses the
same 30-segment rotated outline as the drawing, without expanding it to a box.
Protection gates and the consequences of contact are unchanged.

### `race.js`
The race: world seeding and track handover, the grid (`spawnRivals`), the
lifecycle (`startRace`, countdown, `pause`, `leave`), the finish
(`checkFinish`, `finishRace`, the parking staircase), `update()`, `updateRival()`
and the frame loop.

### `render.js`
All Canvas 2D drawing. Seven car models, three tracks' worth of scenery and road,
hazards, particles, and the Conditions that sit over them.

**Draw order here is behaviour** — it decides what covers what. `renderView(dy)`
is the order for one view; `render()` is the loop over views, with the clip and
translate per column.

`renderView` has exactly one branch in it, and it is the whole of Aero-Glow's
presence in the renderer: if `aeroGlowViewActive(VOWN)` the view draws
`drawAeroGlowWorld()` instead of the shared world's layers, and nothing else
about the frame changes. Every other column carries on drawing the real race in
the same frame. `drawGlassLayer()` — the vignette, the ladder and the water on
the screen — runs after either, because those are facts about the driver rather
than about which world that driver is being shown, and the ultimate meter
counting Aero-Glow down is the clearest of them.

`drawAeroGlowWorld()` renders the void, the perspective traces, the three-lane
route the racer is genuinely still steering between, the drifting motes and the
owner's own car, all from that racer's canonical travel and pace. It reads no
clock, so the same state draws the same frame, and it reads race state and
writes none. Aero-Glow is deliberately not a `TRACKS` entry and its name is
drawn inside the view rather than written into `#trackName`, which is the page's
one HUD and in split-screen belongs to whoever is not in there.

All seven cars use their root `v_*.PNG` sprite assets. Neela and Saffron also register their `vtm_*.PNG` alternate sheets in the shared cache. All eight car sheets load once; the two note sheets use `FX_SPRITES`. No procedural cruiser remains.

Showroom, garage, player, bot and local columns all use this same dispatch, and
the menus paint from `CARS` directly, so a preview is always the car and never
the shape it turns into.

A model's `spriteBounds` describes the visible body within the padded PNG.
`spriteFrame(model, w, h)` works the placement out once — the image's natural
dimensions, one uniform scale, the visible bounds centred on the logical car
position, the full PNG drawn — and `spriteAnchor(frame, a)` turns an image-space
anchor into a point in the car's own space. Everything that has to be pinned to
a piece of artwork goes through those two, which is what stops an effect
drifting off a tailpipe at another size, tilt or race scale.
`racerTailPoint(who)` is the world-space version, used by the update code that
drops trail nodes; it reads and changes nothing.
The local draw order is shadow, exhaust, image, ultimate fire, transformation
flash; then, outside the model and in the world rather than in the car's rotated
space, Lolanthe's queen note and the three orbiting notes of a Mind Controlled
racer; then the seat marker and the Condition stack, which a view only draws for
a car it is allowed to see. All of it reads timers the update code advances and
the wall clock, exactly as the exhaust pulse does, so drawing the same frame
twice draws the same frame — and none of it is collision geometry.

The shared `carW`/`carH` remain unchanged. Uniform race scales are Flann 1.12, Neela 1.18, Verdant 1.10, Rhosyn 1.14 and Saffron 1.25; Lolanthe uses 1. Neela’s alternate scale is 1.09. Saffron’s dragon spans two lanes through model metadata. Menus use the untransformed base models.

`CARS.<id>.exhaust` holds the measured emitter anchors: Flann's two at source
pixels (355, 1377) and (669, 1377), Neela's two at (352, 1355) and (671, 1355),
the alternate form's single thruster at (512, 1306), Lolanthe's two oval outlets
at (455, 1354) and (568, 1354), and Verdant's one at (738, 1314) — the bore of
the side-exit pipe, which is the only outlet its artwork has, because the
slatted box under its tail is a diffuser with no bore. They share the image's
transform, including tilt. `CARS.<id>.exhaustStyle` picks what comes out of
them — `drawSpriteFlame` for Flann's fire, `drawSpriteEnergy` for Neela's blue
energy, which is drawn lightened and is a clean streak rather than a pointed
tongue. Every gradient in both starts on the anchor itself, so the root is the
measured outlet exactly, at every size and every point of the pulse. Smooth sine
pulses change plume dimensions without moving those roots; reduced motion uses a
static plume rather than no plume. Only the existing boost/ultimate visual flag
enables them, so previews never have exhaust — and so an ordinary boost, a boost
can and the ultimate's own speed all light Neela's pipes without transforming
anything.

While the alternate body is on the road, update code drops bounded trail nodes
at `racerTailPoint(who)` — sampled by distance (`NEELA_TRAIL_GAP`), capped
(`NEELA_TRAIL_MAX`), aged over `NEELA_TRAIL_LIFE` — and `drawRacerTrail` strokes
them in three lightened passes from a wide cyan haze down to a white-hot core.
They are world positions that scroll with the road, they survive a player-one
rebase because `rebaseWorld` moves them with everything else, and the form
ending stops new ones without deleting the ones already down. Nothing in the
drawing is on a clock, so reduced motion keeps the whole trail: it is where the
car has been, which is information rather than decoration.

`drawCar` takes `boosting`, `ulting` and `white` as separate arguments on
purpose. `boosting` is the old one — anything that makes the car go faster — and
lights the exhaust on every model. `ulting` is narrower: this racer's ultimate is
running right now, and for Flann alone it adds `drawFlannUltFire(w, h, p)`, a
set of restrained flame tongues laid down both sills and around the tail inside
the car's own translated and rotated space. `white` is the transformation flash,
drawn by `drawMorphFlash` from the model's own hull so it is the car's
silhouette that goes white — which is why it works on whichever of the seven a
Neela exchange happens to catch, without a line of per-car code. Ordinary boost
and a boost can never trigger either, and menus pass none of the three. The
fire's only moving part is read off the clock, exactly as the exhaust pulse is,
so drawing stays state-pure; reduced motion pins the phase and leaves the flames
still rather than removing them. The flash reads a timer and no clock at all, so
it has no oscillation for reduced motion to take away.

The white transition belongs to a view rather than to the canvas.
`whiteoutActive(who)` derives from that racer's own timer, and `drawWhiteout` is
called after a column's road *and* after `drawSeatHud`, inside that column's
clip — so one person's game disappears and nobody else's does. On one screen the
instruments are page elements over the canvas, so `paintHUD` puts a `whiteout`
class on the shell for exactly as long as the timer runs and the stylesheet
takes the HUD layer out of sight.

This file reads game state and never changes it.

### `hud.js`
Two HUDs that must agree. The DOM one is painted over the canvas (`paintHUD`,
`paintItemBox`, `syncConditions`); the canvas one is drawn per column in local
play (`drawSeatHud` and friends), because four copies of the DOM HUD would be four
stylesheets to keep in step.

What keeps them from drifting is a block of named constants near the top —
`HUD_EDGE`, `HUD_TOP`, `HUD_READ_W`, `HUD_ACT`, `HUD_ACT_GAP`, `HUD_ACT_BOT`,
`HUD_RAIL_*`, `HUD_COND_*` and the ink ramp — plus four functions that derive the
rest: `hudSide()` (the instrument band's inset), `hudFoot()` (how far the bottom
row stands off), `readWidth()` and `readMetrics()` (the standings panel, which
narrows on a narrow view and tightens on a short one). **Each of those has a twin
in `css/app.css`**, and the stylesheet says so where it does. Change one, change
the other, or a phone and a split-screen column stop showing the same race.

`hudGlass()` is the page's glass as close as a canvas gets it: there is no blur
to be had, so the dark fill carries the contrast the blur would have carried and
the hairline plus the top highlight carry the shape.

This file also owns the **condition icon layer**, which is the only place a
Condition is ever drawn. `COND_PATHS` holds each icon once, on the same 24-unit
grid the item icons use, in strokes only; `drawConditionIcon` / `drawConditionBadge`
build `Path2D` from those strings for the canvas, and `conditionSvg` builds inline
SVG from the same strings for the page and the garage. Nothing carries a second
copy of a name, a colour or a buff/debuff classification — those come from
`CONDITIONS` in `data.js`.

Where the badges go is the one thing that differs by renderer:
`drawConditionStack` puts them beside a car for every racer that is *not* the
current `VOWN`, clamped into that view's own column so a split-screen window's
badges cannot leak into the next; `hudConditions` puts the view owner's own in
the bottom-left corner; and `syncConditions` does the same for the page, rebuilt
only when the set actually changes. The rim colour is derived from each icon's
`ink` rather than listed again, which is why the near-black Skidded badge gets a
light outline and needs no special case.

### `input.js`
Keyboard, pointer and controller, each translated into the same mechanics call.
`humanSteer`, `humanBoost` and `humanUlt` are the three doors; every input path
ends at one of them.

`keyBoost`, `ptrBoost` and `padBoost` are the three ways the boost can be held
down; `setBoost()` is the one place that decides whether it is actually biting,
so no input path gets to answer that question for itself.

### `main.js`
Boot, in order: splash image, desktop class, `deskFit`, `applyLang`, `paintBest`,
`applySettings`, the splash timeout, every menu listener, the window resize and
visibility listeners, and `settle()` — repeated once after layout and once after
fonts, in case the first read landed before the stylesheet applied.

## Invariants worth not breaking

1. **One authority per question.** `noContact` decides contact protection.
   `rockAlt` decides where a meteor is. `activeConditions` decides which
   Conditions a racer has. If two places compute the same thing they will
   disagree eventually.
2. **Difficulty changes the driver, never the car.** No `DIFFS` value may multiply
   speed, charge rate or any car capability. It buys perception and judgement.
3. **Bots run your mechanics.** If you add a player ability, a bot must reach it
   through the same function, not a copy.
4. **The canvas HUD mirrors the DOM HUD.** A change to one needs the same change
   in the other, or a phone and a split-screen column stop showing the same race.
   The shared numbers are the `HUD_*` constants in `hud.js` and their twins in
   `css/app.css`; they are the contract, not a coincidence.
5. **A finisher is out of play.** Crossing the line takes a car off every target
   list, out of every collision and beyond every hazard, item and debuff, for the
   rest of that race. It is a lifecycle state, never a Condition, and it is never
   presented as Invulnerable.
6. **`W` is one view, not the canvas.** Anything measuring off `FULLW` in world
   code is a split-screen bug waiting to happen.
7. **Nothing boots outside `main.js`.**
8. **Player one is the camera, not a position.** It is held at `playerY` while
   the world runs past, so `racerWorldPose()` is the only honest way to read a
   racer's place and `teleportRacerToPose()` / `rebaseWorld()` the only way to
   change player one's. Anything that compares or copies a raw `y` between
   player one and a rival is wrong the moment the road has scrolled.
9. **A preference has one home.** It is stored once, read through
   `getSetting()`, written through `setSetting()`, applied by `applySettings()`
   and drawn by `paintSettings()`. A control is a view of it, never a second copy
   of it — the moment the DOM, the store and the running game each hold their own
   answer, two of them are wrong.
10. **One race, however many views of it.** Aero-Glow is the case that makes
   this explicit: a racer may be shown a different world and taken out of
   contact, and neither of those may give it a second position, a second
   distance, a second biome or a second clock. The canonical simulation is the
   only simulation, so a private view is a view and never a race — which is why
   coming out of one needs no correction, and why `G.biome` must never be
   written with anything that is not a track.

These ten are judgement calls, and `tools/check.mjs` can check almost none of
them. The exception is the mechanical half of the tenth, which is specific
enough to catch: it fails the build if any file writes an Aero-Glow value into
`G.biome`, `G.next`, `G.seam` or `G.trackT`, if any racer grows a second
Aero-Glow metre count, pose, origin or scroll, or if the departure reaches
`teleportRacerToPose()` or `rebaseWorld()`. What it otherwise checks is the
layer underneath: that the files load in the right order, that names do not
collide, and that every selector, string and table entry the code reaches for
actually exists.

## How to add things

### A car

1. `CARS` in `data.js` — an entry with `key`, `style`, `accent`, `body`, `dark`,
   `glass`, optional `trim`/`pip` and `flame` colors for a procedural model.
   An image model instead uses `style:"sprite"`, `sprite`, normalized
   `spriteBounds`, `exhaust` and an `exhaustStyle`; keep `accent` and `flame`
   for shared effects, and measure `spriteBounds`, the anchors and `hitShape`
   off that PNG rather than copying another car's. Measure them — decode the
   alpha channel, find the visible bounds, find the centre of each real outlet,
   trace the contact body. Coordinates that "look close" are the one thing that
   cannot be checked automatically and the one thing every other car's comment
   records so it can be re-derived.
2. `CAR_IDS` — append the id; add a temperament in `TEMPERS`.
3. `render.js` — a body drawing function and a `drawCar` style branch. A sprite
   car needs neither: it goes through `drawSpriteCar` already.
4. `i18n.js` — its name and `<id>Ult` describing its complete behavior in both
   languages, including any form-specific multiplier exceptions.
5. `index.html` — its selection button and preview canvas; wire selection in
   `main.js`.

Every car automatically uses the generic ultimate lifecycle, AI valuation,
boost flames and Boosted status, and a new car should stay there. The two
exceptions are Flann's ram and Neela's exchange, described under `mechanics.js`
above: the base lifecycle is shared and stays shared, and what those two add is
a collision and hazard power that runs only while that shared `ultOn` is true,
behind named predicates. Adding a third means extending that pattern — one
identity predicate, the questions built on it, applied at the consequence — and
never a parallel ultimate state machine. If the power needs a car to be
somewhere else, it goes through `racerWorldPose` and `teleportRacerToPose` and
never through raw `x`/`y`; if it needs a second body, it goes in an `altForm`
and comes out through `racerModel()`.

`FIELD_SIZE` is 7. Standard races include all seven identities; custom rules
can request fewer bots. Two, three and four local humans leave five, four and
three bot slots respectively. Cole’s permanent alternate form is selected by
`racerModel()`; `switchColeForm()` handles input eligibility and `racerPace()`
centralizes form-aware speed for players and bots.

### A track

`TRACKS` and `TRACK_IDS` in `data.js`, a `<id>Info` string in `i18n.js`, scenery
and road branches in `render.js` (`drawSide`, `drawProps`, `drawRoad`,
`drawEdges`, `drawMarks`, `drawFeatures`), and a hazard branch in `spawnTrap` in
`mechanics.js`.

### An item

`ITEMS` and `ITEM_IDS` in `data.js` with a rarity, artwork in `ITEM_PATHS` in
`hud.js`, a branch in `useItem` in `mechanics.js`, `itemX` / `itemXInfo` strings,
and a branch in `botItemWorth` in `ai.js`. The garage odds table and the drop roll
both read `RARITY`, so they cannot disagree.

**Mystery Bubble item rewards are temporarily switched off.**
`MYSTERY_ITEMS_ENABLED` in `data.js` is `false`, and while it is, `takeBubble`
grants +0.05 through `ultDelta` before the item gate — no item, no trade,
no bot fuse — and pops the bubble in a
plain colour rather than a rarity one. `useItem` refuses a Mystery item as
defence in depth, so stale state cannot go off later. Nothing is deleted: the
roll, the rarities, the artwork, the strings, the bot valuation, oil and seeker
rendering and every branch of `useItem` are all intact, and setting the gate
back to `true` restores items alongside the single +0.05 charge reward. It is a separate
question from `rules.bubbles`, which decides whether rows spawn on the road at
all.

### A Condition

An entry in `CONDITIONS` in `data.js` carrying its localisation key, colour,
`type` (`"buff"` / `"debuff"`), `icon` and `ink`; the artwork itself in
`COND_PATHS` in `hud.js`; a `<id>Info` string for its garage card; and a branch
in `conditionOn` in `mechanics.js` — which is the only place a Condition is
derived, so one that has quietly lapsed cannot leave its badge behind. Where it
is in `CONDITIONS` is where it sits in a stack of badges, and its `type` is what
puts it on the Buff or the Debuff page. A debuff must also be cleared and refused
by `clearDebuffs` and `refusesDebuffs`. `col` is never the only thing carrying
the meaning — the icon is — so a dark one is fine.

### A setting

1. `SETTINGS_KEYS`, `SETTINGS_DEFAULTS` and `SETTINGS_ALLOWED` in `settings.js` —
   the key, its default and what it may be.
2. `applySettings()` — hand the value to whatever actually carries it out. If
   that is a system of its own, give the system a setter and call it; do not
   reach into its internals from here.
3. `index.html` — a `.set-row` in the right `.set-group`, with `data-set` (and
   `data-val` per option on a segmented row). Name and description carry
   `data-i18n` keys; a control with no visible text carries `data-i18n-aria` or
   an `aria-labelledby` pointing at the row's name.
4. `paintSettings()` — nothing, if it is a segment or a switch: both are painted
   generically. Anything else gets a line here, reading the stored value.
5. `i18n.js` — the new strings, in both languages.

The delegated listener in `main.js` already routes any `[data-set]` row, so a new
segment or switch needs no new listener.

### A screen

A `<section class="screen">` with an id. `show()` handles visibility generically.
Add setup destinations to `SETUP_IDS` to retain Home's road behind them. Use
`.setup-screen` / `.setup-frame` with shared `.setup-rail`, `.setup-head`,
`.setup-body` and optional `.setup-foot` for navigation and overflow. Give the
actual decision its own layout: do not force modes, controllers and cars into
one option-row pattern. Add new copy to both languages in `STR`.

## Checking your work

Most of the invariants above are mechanically checkable, and
[`tools/check.mjs`](../tools/check.mjs) checks them:

```sh
node tools/check.mjs
```

Plain Node, no dependencies, no `package.json`, exits non-zero on failure. It
covers the script order and `defer`, syntax, the uniqueness of every top-level
name, browser-global collisions, every literal `#id` selector against the real
DOM, translation completeness and key resolution — for `[data-i18n]` and
`[data-i18n-aria]` alike, so an icon-only button cannot ship with an untranslated
name — and the wiring of every car, Condition and item, including that no trace
of the removed launch mechanic survives in the source or the page.

That is the cheap half. It cannot tell you whether the game still *plays* the
same — for that, see below.

## Testing

There is no test suite and no test dependency, by design — the brief is a
build-free static site.

What has been used, and is worth repeating after a substantial change:

- `node tools/check.mjs` first — it is instant and catches the silent failures.
- Serve the directory and drive it in a headless browser
  ([Playwright](https://playwright.dev/) against the system Chromium works well
  without adding anything to the repo). The flows worth covering are the ones in
  the modes list: boot, the first-run language choice, every Settings preference
  and its persistence across a reload, the garage tabs, each
  mode's path to the grid, the countdown, lanes, boost, the condition badges
  beside rivals and in your own corner, pause/resume, leave, the personal best,
  and a four-player split.
- For anything touching gameplay numbers, diff against the previous build rather
  than eyeballing it: seed `Math.random`, run both, and compare the HUD values
  frame for frame. Frame timing still varies between runs, so treat a single
  mismatched sample as noise and repeat before believing it.
- Fake gamepads through `navigator.getGamepads` to exercise local play; the code
  reads only `index`, `id`, `connected`, `buttons[i].pressed/.value` and
  `axes[i]`.

Menu behavior can also be checked with `node tools/menu-check.mjs`. It executes
all fifteen scripts against small DOM/Canvas test doubles, drives the actual
event handlers, and supplies simulated Gamepad snapshots. It does not validate
CSS layout, browser rendering or real controller hardware. See
[MENU-REDESIGN-QA.md](MENU-REDESIGN-QA.md) for the remaining visual test matrix.

## Flight and private-world updates

`refusesDebuffs()` contains lifecycle protection and Aero-Glow absence. `noContact()` adds Saffron flight without making it immune to Mind Control. `mindShove()` can change airborne canonical lanes while `carAt()` correctly finds no physical road contact. Meteor interception checks the falling trajectory against every active dragon before ground detonation.

Saffron’s phase/lift clocks live on every racer, are reset with other form state and use the shared transition helpers. The airborne render pass follows road objects and carries body, exhaust and badges upward while retaining a canonical shadow. Touchdown uses the normal model’s polygon and existing wreck/credit functions.

Aero-Glow adapts Ponu’s lane highlight, rungs and dash rhythm through `aeroEachRung()`, driven by owner travel. `hudReadout()` and `drawLadder()` suppress race-position information only for the private-world owner. The DOM HUD restores the current `curTrackKey` after return.

### Shield presentation and contact feedback

Shield bars remain ordered pink → yellow → cyan, but lose durability cyan →
yellow → pink. `shieldBarFill()` supplies both HUDs; `SHIELD_GRADIENTS` supplies
matching borderless, dividerless gradient fills without changing bubble colors.
`SHIELD_MAX` remains six halves. Respawn restores them after the existing wreck delay.

`hitShield()` preserves the current half count while `ultOn` is active. This
neither regenerates shield nor grants universal invulnerability: surviving
Obscured/Slow effects and car-specific solid-hazard behavior remain intact,
and meteors still bypass durability under their existing destruction rules.

Accepted surviving hazard contacts refresh cosmetic `shieldHitT` to
`SHIELD_HIT_TIME` (1 second). Frame updates count it down; wreck, respawn, finish
and race reset clear it. `shieldStage()` selects the current color and half-state.
`drawShieldHit()` shows one compact bar above the measured car silhouette,
including the airborne render pass, suppresses the current viewport owner and
uses the car's per-view alpha so invisible racers stay hidden. No-contact states
and dodges produce no feedback. This timer has no gameplay effect.
