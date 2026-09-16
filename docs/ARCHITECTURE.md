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
8. `updateBubbles` → `updateSlicks` → `updateMissiles` → `updateTraps`
9. your rear-end check, then `updateRivals` (each rival's whole frame)
10. `serveOrders`, `updateBolts`, `checkFinish`, `updateFx`, seam handover

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
- `paintPicks()` keeps the six direct-pick buttons, taken states and player roster
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
  is any of the three (finished, wrecked, invulnerable). Every contact, hazard
  and targeting test asks this rather than reassembling it.

`activeConditions(who)` is the single derivation of which Conditions a racer has
right now, read straight off `slowT`/`slow`, `blind`, `slipT`/`slip`, the boost
state and the invulnerability timer. There is no second, mutable copy to fall out
of step, and the order it returns is `CONDITIONS`' own key order so a stack of
badges never reshuffles. A finished racer returns none.

`rearEnd` and `bumpTarget` apply ordinary contact rules regardless of ultimate
state; the short forward shove a rear-end hands its victim is `SHUNT_TIME` /
`SHUNT_BOOST` and shows as Boosted. `startUlt`, `tickUlt` and `endUlt` manage one
fixed 15-second speed multiplier for every driver.

Body contact is centralized in `carHit(who)`. Flann uses an inset eight-point
`hitShape` in logical car units; other cars retain their existing inset body
rectangle. Both rotate with the rendered tilt. Hitboxes never read image alpha,
image readiness, camera offsets or DPR. `nearestOnCar()` tests the polygon for
round hazards, pickups and seekers. `rearContact()` requires actual body overlap;
`carAt()` deliberately projects into a target lane for the barge mechanic.

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
All Canvas 2D drawing. Six car models, three tracks' worth of scenery and road,
hazards, particles, and the Conditions that sit over them.

**Draw order here is behaviour** — it decides what covers what. `renderView(dy)`
is the order for one view; `render()` is the loop over views, with the clip and
translate per column.

Flann uses the exact `v_flann.PNG` through the `sprite` branch of `drawCar()`;
its image is loaded once into `CAR_SPRITES`. On load, the shared menu canvases
repaint. The other five racers retain their procedural Canvas models. Showroom,
garage, player, bot and local columns all use this same dispatch.

`CARS.flann.spriteBounds` describes the visible body within the padded PNG.
`drawSpriteCar()` uses the image's natural dimensions and one uniform scale,
centres the visible bounds on the logical car position, and draws the full PNG.
The logical `carW`/`carH` dimensions are unchanged. The local draw order is shadow, exhaust,
image; race markers and Conditions remain outside the model.

`CARS.flann.exhaust` contains two normalized anchors measured at source pixels
(355, 1377) and (669, 1377), the centres of the paired rear tailpipes. They share
the image's transform, including tilt. Smooth sine pulses change plume dimensions
without moving the roots; reduced motion uses a static plume. Only the existing
boost/ultimate visual flag enables them, so previews never have exhaust.

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
8. **A preference has one home.** It is stored once, read through
   `getSetting()`, written through `setSetting()`, applied by `applySettings()`
   and drawn by `paintSettings()`. A control is a view of it, never a second copy
   of it — the moment the DOM, the store and the running game each hold their own
   answer, two of them are wrong.

These eight are judgement calls — `tools/check.mjs` cannot check any of them. What
it does check is the layer underneath: that the files load in the right order,
that names do not collide, and that every selector, string and table entry the
code reaches for actually exists.

## How to add things

### A car

1. `CARS` in `data.js` — an entry with `key`, `style`, `accent`, `body`, `dark`,
   `glass`, optional `trim`/`pip` and `flame` colors for a procedural model.
   An image model instead uses `style:"sprite"`, `sprite`, normalized
   `spriteBounds` and `exhaust`; keep `accent` and `flame` for shared effects.
2. `CAR_IDS` — append the id; add a temperament in `TEMPERS`.
3. `render.js` — a body drawing function and a `drawCar` style branch.
4. `i18n.js` — its name and `<id>Ult` describing the shared 15-second double-pace
   boost in both languages.
5. `index.html` — its selection button and preview canvas; wire selection in
   `main.js`.

Every car automatically uses the generic ultimate lifecycle, AI valuation,
boost flames and Boosted status. Do not add car-specific ultimate behavior.

Note `FIELD_SIZE` is 6 and local play hands every car in the game to the grid, so
a seventh car changes the shape of a local race.

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
