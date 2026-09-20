# Tuning

Every dial in the game, what it does, and where it lives. Almost all of them are
in `js/data.js`; the exceptions are noted.

Change a number, reload the page. There is nothing to rebuild.

> **Before you retune anything:** the two rules the design leans on are that a
> difficulty changes how well a driver *thinks* and never what its car may do,
> and that bots run the player's mechanics rather than a copy. Both are easy to
> break with a well-meaning multiplier.

---

## Pace and progression

| Constant | Value | Means |
| --- | --- | --- |
| `BASE_SPEED` | `420` | road speed at 1.00×, in design px/s |
| `SPEED_SECONDS` | `20` | how often the road steps up a tier |
| `MULT_STEP` | `0.10` | how much each tier adds |
| `MAX_MULT` | `3.00` | the ceiling |
| `MAX_TIER` | derived | `(MAX_MULT − 1) / MULT_STEP` = 20 tiers, so 6 minutes 40 seconds to top speed |
| `TRACK_SECONDS` | `60` | seconds on a track before it hands over to the next |

Distance is `speed × dt × 0.075`, so 1.00× ≈ 31.5 m/s. Each racer integrates its own physical speed into canonical metres (`G.meters`
for Player 1, `R.m` for rivals). `metersOf()` only reads those metres. The same
`0.075` conversion projects rival camera y and converts grid offsets, contacts,
teleports and parking offsets; camera coordinates never determine normal progress.

## Race structure

Bots and Local arm the final tracks once `MAX_TIER` is reached (3.00×), never
from elapsed time alone. Endless has no finish. `raceSpan()` projects the time
to that tier from `G.tier` and `G.speedT`, then the remaining track transitions.

| Constant | Value | Means |
| --- | --- | --- |
| `FINAL_TRACKS` | `3` | track changes after reaching 3.00×, then the flag is planted |
| `FINISH_STRETCH` | `900` | metres of the last track before the line |
| `FIELD_SIZE` | `6` | cars on the road, however they are driven |
| `LOCAL_MAX` | `4` | most people on one screen |
| `PARK_BASE` | `0.60` | car heights past the line for the last car home |
| `PARK_STEP` | `0.44` | car heights between one finishing place and the next |
| `PARK_EASE` | `3.9` | how hard the roll-out closes on its mark |

`PARK_STEP` is set by the lane cycle: consecutive places sit in different lanes,
so the only pair that ever shares a lane is three places apart, and `3 × 0.44`
leaves a third of a car between them. Any larger and sixth place falls off the
bottom of the screen when you win.

## Boost

Shared constants in `data.js` drive `update()` and `updateRival()` equally.

| Number | Value | Means |
| --- | --- | --- |
| `BOOST_DRAIN_TIME` | `5.5` | seconds from full to empty |
| `BOOST_REFILL_TIME` | `5.0` | seconds back to full |
| `BOOST_DRAIN_RATE` | `1 / 5.5` | normalized charge spent per second |
| `BOOST_REFILL_RATE` | `1 / 5` | normalized charge restored per second |
| `BOOST_SPEED` | `1.5` | pace multiplier while boosting |

Run it completely dry and it locks out until the bar is full again.

## Precision rewards

| Constant | Value | Means |
| --- | --- | --- |
| `ULT_ON_PERFECT_DODGE` | `0.10` | charge for a safe last-second lateral escape |
| `PERFECT_DODGE_WINDOW` | `0.12` | maximum seconds to predicted impact when steering changes |
| `ULT_ON_BUBBLE` | `0.05` | charge per collected Mystery Bubble, independent of the item gate |

`beginPerfectDodges()` snapshots the field before movement; `finishPerfectDodges()`
settles rewards after all collisions and finishes. It predicts the interrupted
steering trajectory against measured hulls and actual hazard geometry using
substeps of at most one pixel / 1/240s. Per-hazard racer masks prevent duplicate
rewards. A road hazard must fully clear the hull, or a meteor must resolve,
without a hit. Early steering, passive misses, immunity and absent racers do
not qualify. Charge deltas are ignored during an active ultimate; no duration
is added or removed. Mystery item rolls remain disabled.

## Contact

| Constant | Value | Means |
| --- | --- | --- |
| `BUMP_SLOW` | `1.3` | seconds of labouring after being barged |
| `SHUNT_TIME` | `0.8` | seconds the shunted car is pushed along for |
| `SHUNT_BOOST` | `1.35` | how fast it is pushed |

Both cars lose the same time to a bump. A rear-end also has a 0.5s per-car
cooldown (inline in `rearEnd`) so one collision cannot fire every frame.

The shunt is a short push down the same tarmac, nothing more, and it reads on the
shunted car as the **Boosted** Condition — the same as any other thing that makes
a car go faster.

## Ultimates

| Constant | Value | Means |
| --- | --- | --- |
| `ULT_CHARGE` | `85` | seconds from empty to ready — the same clock for every car |
| `ULT_TIME` | `15` | seconds an ultimate lasts |
| `ULT_SPEED` | `2.0` | pace multiplier while one is running |
| `ULT_ON_WRECK` | `−0.10` | meter cost of being destroyed |
| `ULT_ON_TRAP` | `−0.05` | meter cost of hitting a hazard |
| `ULT_ON_KILL` | `+0.10` | meter reward for wrecking somebody |

While an ultimate runs, the meter is its remaining duration, so those deltas are ignored
until it is over rather than changing its duration (`ultDelta` enforces this).

All cars share this speed multiplier. It has no status, targeting or
world-clock effects, and its duration cannot be extended. A wreck or finish
ends it. Ordinary negative speed modifiers still apply independently.

All six cars add behaviour to the shared lifecycle. Saffron flies over the road, intercepts falling meteors and drops on expiry. Mind Control remains effective. Its base model uses raceScale 1.25; the dragon uses two lane widths.

### Flann's ram

Flann, and only Flann, adds a collision and hazard power on top of that shared
lifecycle, for exactly as long as it runs. `flannUltActive(who)` is the one
predicate that says so, and there is nothing to tune here: no new duration, no
new clock, no new constant.

| While it runs | What happens |
| --- | --- |
| Contact with another racer | The victim is wrecked only if Flann initiated the contact. Flann takes no `BUMP_SLOW`, no `SHUNT_TIME` and no wreck. |
| Two ulting Flanns | Neither can smash the other; the contact falls back to the ordinary shunt and barge. |
| Tumbleweed | Destroyed on contact. No `SLOW_TIME`, no `ULT_ON_TRAP`. |
| Meteor, falling rock or blast | Cannot wreck Flann, and does not end the ultimate. |
| Puddle | Shield halves are preserved during the active ultimate. `BLIND_TIME`, the spray and the Obscured badge all apply — water is liquid and cannot be rammed apart. |
| Oil, seekers | Unchanged. These are Mystery Bubble items and are currently unobtainable in any case. |

Respawn invulnerability and finish protection are untouched and stay
authoritative: a ram cannot reach a racer `noContact()` refuses, in either
direction. The moment the fifteen seconds are up, every one of these goes
straight back to the ordinary shared rule.

### Neela's exchange

Neela is the second car with something on top of the shared lifecycle, and the
only one with two states inside it rather than one:

- `neelaUltActive(who)` — the fifteen seconds are running. This is what carries
  the solid-hazard privilege, for the whole of them.
- `neelaFormActive(who)` — the alternate body, `vtm_neela.PNG`, is the one on
  the road. This is what carries the single exchange, and it ends at the first
  racer contact.

They are the same until that contact and different afterwards. Conflating them
would give Neela either a privilege it has lost or a second exchange it never
had, so `tools/check.mjs` asserts that `neelaFormActive()` is still built on
both the ultimate and the form flag.

| While it runs | What happens |
| --- | --- |
| First racer contact, in the alternate body | Nobody is wrecked. The two racers exchange world positions: Neela takes the place the other was standing in at the instant of contact, and that racer is put where Neela was when the ultimate started. The alternate body ends there, the meter does not. |
| Two transformed Neelas | Neither can trade with the other; the contact falls back to the ordinary shunt and barge. |
| A Neela and an ulting Flann | The exchange, not the ram: the contact spends the form either way, and spending it on a wreck would leave a racer destroyed and an exchange still owed. |
| Any racer contact after that | Ordinary `BUMP_SLOW` / `SHUNT_TIME` rules. Neela never gains the ability to wreck anybody. |
| Tumbleweed | Destroyed on contact, before and after the exchange. No `SLOW_TIME`, no `ULT_ON_TRAP`. |
| Meteor, falling rock or blast | Cannot wreck Neela, and does not end the ultimate. Again, before and after. |
| Puddle | Shield halves are preserved during the active ultimate. `BLIND_TIME`, the spray and the Obscured badge all apply — water is liquid and cannot be smashed. |
| Oil, seekers | Unchanged. These are Mystery Bubble items and are currently unobtainable in any case. |

Unlike the ram, this does have constants of its own. They are Neela's timings
and nothing else: the shared `ULT_CHARGE`, `ULT_TIME` and `ULT_SPEED` are
untouched.

| Constant | Value | Means |
| --- | --- | --- |
| `WHITEOUT_TIME` | `0.42` | seconds an involved human's view is white |
| `MORPH_TIME` | `0.6` | seconds the white flash on the body burns off |
| `NEELA_SWAP_GUARD` | `0.05` | seconds a just-exchanged pair is skipped for |
| `NEELA_TRAIL_LIFE` | `1.8` | seconds a trail node takes to fade out |
| `NEELA_TRAIL_GAP` | `9` | px of travel between trail nodes |
| `NEELA_TRAIL_MAX` | `170` | trail nodes kept per racer, hard cap |

The first two are shared rather than Neela's: Rhosyn flashes through the same
transition on the way into Aero-Glow and on the way back out, so they are named
for what they are and not for the car that used them first. The values and the
behaviour are unchanged.

The whiteout is a transformation flash and not a blindfold: long enough to hide
the change of shape, short enough that a car travelling at twice pace is never
driven blind into anything. It does not pause the race, stop the meter, freeze
the car or take the controls away — the racer drives itself through all of it,
as a person or as a bot, and there is no homing or auto-steer anywhere in the
mechanic. It drives the existing **Obscured** Condition through a timer of its
own rather than through `blind`, which is puddle water and draws puddle water.

The guard is one step's worth and is not protection. `tools/check.mjs` fails it
above 0.12s, because anything approaching a second of it would be hidden
invulnerability rather than a duplicate-contact guard.

Respawn invulnerability and finish protection are again authoritative in both
directions: a racer `noContact()` refuses cannot be exchanged with, and cannot
exchange. When the meter reaches zero every one of these privileges goes at
once, and `endUlt()` leaves no alternate-form state behind.

### Lolanthe's mind control

Lolanthe adds an aura and a forced lane change on top of the shared lifecycle,
for exactly as long as it runs. `lolantheUltActive(who)` is the one predicate
that says so. The shared `ULT_CHARGE`, `ULT_TIME` and `ULT_SPEED` are untouched.

| Constant | Value | Means |
| --- | --- | --- |
| `MIND_CONTROL_TIME` | `3` | seconds without controls, from the **last** application |
| `MIND_AURA_LENGTHS` | `4` | how far the aura reaches, in car lengths of road |
| `MIND_POP` | `0.26` | seconds of scale/opacity pop, in and out |
| `MIND_ORBIT` | `0.42` | turns a second the three notes make |
| `MIND_NOTE_K` | `0.30` | one note's size, in car heights |
| `MIND_ORBIT_X` | `0.72` | orbit half width, in car widths |
| `MIND_ORBIT_Y` | `0.42` | orbit half height, in car heights |
| `QUEEN_POP` | `0.3` | seconds of scale/opacity pop for Lolanthe's own note |
| `QUEEN_NOTE_K` | `0.52` | its size, in car heights |
| `QUEEN_LIFT` | `0.74` | how far above the car it floats, in car heights |
| `QUEEN_BOB` | `0.055` | how far it rises and falls, in car heights |
| `QUEEN_BOB_RATE` | `1.6` | seconds for one rise and fall |
| `QUEEN_NOTE_IMG` | `queen_note.PNG` | the note above an ulting Lolanthe |
| `MIND_NOTE_IMG` | `pion_note.PNG` | the three that orbit a controlled racer |

The reach is in car lengths rather than pixels because a car length is the one
unit that means the same stretch of road on a phone, on a desktop and in one
column of a four-way split. It is measured in the master frame, so which view
happens to be rendering cannot change the answer.

`MIND_CONTROL_TIME` is **set**, never added to. A racer held inside the aura has
its timer put back every frame and so stays controlled for as long as it is
exposed and for three seconds after the last application — never for six, nine
or twelve. `tools/check.mjs` fails any `+=` on a mind timer anywhere in the
source. The pop-in belongs to the inactive-to-active transition alone, so a
reset does not replay it.

The lock is `controlsLocked(who)` and covers steering, boost, items and the
ultimate button for the player, a local seat and a bot alike. It is not a
freeze: physics, ordinary forward movement, timed effects, collision handling,
an ultimate already running, hazards and the wreck lifecycle all carry on.

The forced lane change ignores both the control lock and a Skidded car's
reversed steering, because neither is a fact about the car. The destination does
not have to be empty — the occupant is met through `bumpTarget` with the victim
named as the racer that arrived — so it can shunt, wreck, ram or be swapped
away, and Lolanthe is credited with none of it.

### Verdant's invisibility

Verdant adds visibility rules and a directional contact rule, again for exactly
as long as the shared lifecycle runs. All of its own constants are cosmetic:
none of them touches the hitbox, the contact rules or the race.

| Constant | Value | Means |
| --- | --- | --- |
| `VERDANT_FADE` | `0.25` | seconds to fade into and out of hiding |
| `VERDANT_OWN_ALPHA` | `0.5` | what its own driver still sees |
| `VERDANT_REVEAL` | `0.18` | seconds of full visibility after a hit |

The owner's half is what makes the car drivable; every other view gets nothing.
It is worked out per view off the existing split-screen viewer identity, so one
to four columns each answer for their own seat. The reveal is long enough to
read and far too short to aim at, and it buys the racer that caused it nothing —
Verdant's immunity to Mind Control holds right through it.

A wreck clears the fade outright rather than letting it ramp, so there is no
ghost dissolving through somebody else's wreck animation.

| While it runs | What happens |
| --- | --- |
| Racer arrives into it | That racer is destroyed; Verdant reveals and keeps its ultimate |
| It arrives into a racer | Ordinary shunt or barge. The defence works one way only |
| Ulting Flann, either way | Both destroyed, both meters left at exactly `0` |
| Transformed Neela, either way | Neela destroyed, meter `0`, no exchange, no teleport; Verdant reveals |
| Lolanthe's aura | Refused for the whole ultimate, reveal included |
| Tumbleweed, meteor | Smashed apart, exactly as Neela's are |
| Puddle, oil, seekers | Existing effects remain; an active ultimate preserves puddle shield halves |

### Rhosyn's Aero-Glow

Rhosyn is the fifth and last car with something on top of the shared lifecycle,
and the only one whose power is not a collision priority. The other four decide
who loses a contact between two bodies; this one says that for fifteen seconds
one of those bodies is not on the shared road at all.

**The invariant, first, because everything else follows from it: Rhosyn never
has a second race position.** Aero-Glow is a view and an isolation over the same
canonical racer. Nothing in the mechanic teleports the racer, freezes it, saves
a pose to restore it from, advances a distance counter of its own or writes
`G.biome`, `G.next`, `G.seam` or `G.trackT`. The racer's lane, lateral x, tilt,
speed, metres, ranking, finish progress, seam crossings and biome progression
are the canonical ones the shared simulation goes on advancing throughout.

That is why the return needs no correction, no lerp and no snap: the car is
already exactly where the race has put it. It is also why it emerges into
whatever track the race has actually reached rather than the one it left — there
is no saved entry biome to restore, because restoring one would be the bug.

Implementing it the other way — a temporary `G.biome`, or a teleport away and a
teleport back — would break exactly that. The racer's position would have to be
guessed on the way home, every other racer's metres are measured against player
one's camera and would move with it, and a biome swapped under the whole field
would change what every other column is looking at.

| Constant | Value | Means |
| --- | --- | --- |
| `AERO_SHIFT` | `WHITEOUT_TIME/2` | seconds under full white, each way: when the view changes hands |
| `AERO_FADE` | `MORPH_TIME` | seconds the body takes to leave, and to arrive back on, every other view |

Both are derived rather than invented. The whiteout is opaque for its first half
and fades over its second, so half of it is exactly the moment the screen is
covered — the renderer swaps worlds behind a curtain and the driver never sees
the seam. The fade is the body flash's own length, so what the rest of the field
sees is one white flash that ends in an empty lane rather than a car blinking
out mid-flash.

The phase is carried by every racer as `aeroPhase`, advanced from the ordinary
update loop so a pause pauses it:

| Phase | The racer | Its own view | Every other view |
| --- | --- | --- | --- |
| `"off"` | on the shared road | the shared world | the car, solid |
| `"in"` | already unreachable | the shared world, going white | the car, flashing white and fading out |
| `"glow"` | away | Aero-Glow | nothing at all |
| `"out"` | still away | Aero-Glow, going white | the car, flashing white and fading back in |

| While it runs | What happens |
| --- | --- |
| Any racer contact, either way | None. `noContact()` is true, so there is no body at that position to meet and none to meet with |
| Flann's ram, Neela's exchange, Verdant's defence | None of them, in either direction — they all settle contacts that cannot happen |
| Lolanthe's aura | Refused. `mindTakes()` asks `refusesDebuffs()`, which is `noContact()` |
| Tumbleweed, meteor, puddle, oil, seeker | None reach it, and none are spent on it: the hazard is still there afterwards for whoever does drive over it |
| Shared bubble rows | Not collected. It cannot see the row it is driving through |
| Its own items | Refused and **kept**, not silently spent into a world it is not in |
| Offensive targeting | It is off every target list, and an in-flight seeker waits it out as it would waits out invulnerability |
| Boost, steering, the 2× pace | All normal. This is personal movement, not contact |
| The race order, the ladder, the finish | All normal. It is never marked dead or finished and never removed from the standings |

On the frame the phase reaches `"off"` the racer is granted the existing
**Invulnerable** Condition for `INVULNERABLE_TIME`, as `max(existing, 2)` so a
longer protection already running is never shortened. There is deliberately no
second shield timer and no per-hazard exception: the Condition is the source of
truth, which is what gives the return its badge and its blink for free.

A wreck, the finish line and a restart all clear the phase outright rather than
sending the car through the return, so none of them hands out the two seconds
and none of them can leave a renderer stranded in the void.

The world itself is drawn by `drawAeroGlowWorld()` in `render.js`, from the
owner's own canonical travel and pace. It is a renderer and nothing else — it
reads race state and writes none — and it is deliberately not a `TRACKS` entry,
because Aero-Glow is never a track the race is on.

| Constant | Value | Means |
| --- | --- | --- |
| `AERO_VOID` | `#04010A` | the black the whole world sits on |
| `AERO_PINK` | `#FF2E9E` | the one colour in it |
| `AERO_PALE` | `#FFA8DA` | and its highlight |
| `AERO_HORIZON` | `0.30` | where the vanishing point sits, in view heights |
| `AERO_RIBBON` | `190` | px of travel between two route markers |
| `AERO_MOTES` | `34` | luminous specks adrift in the void |

## Hazards

| Constant | Value | Means |
| --- | --- | --- |
| `BLIND_TIME` | `2.6` | puddle: seconds the view stays fouled |
| `SLOW_TIME` | `1.7` | tumbleweed: seconds at half speed |
| `DEAD_TIME` | `3` | seconds wrecked |
| `INVULNERABLE_TIME` | `2` | seconds Invulnerable after respawning |
| `METEOR_ALT` | `300` | how far up the rock comes in |
| `METEOR_MIN_T` | `0.9` | never less warning than this |
| `METEOR_MAX_T` | `3.2` | and never hanging longer than this |
| `METEOR_ROCK_K` | `0.66` | the last fraction of the fall, with the rock in view |

The meteor's ring is a **position on the road**, and its remaining fall is measured
in **seconds** — so boosting or being slowed moves where it lands, not when.
The fall uses elapsed seconds, unaffected by ultimates. `rockAlt()` is the single answer to "how
high is it", read by the fall, the roof test and the drawing alike.

Spawn spacing is inline in `race.js`: a hazard every `rand(430, 900)` of road, and
none while a track seam is crossing.

## Mystery bubbles and items

> **Item rewards are temporarily off.** `MYSTERY_ITEMS_ENABLED` in `data.js` is
> `false`, so a collected bubble grants no Can, Oil or Seeker to anybody —
> player, bot or local seat. Nothing below has been removed or retuned; the
> numbers are what they will be again the moment the gate goes back to `true`.
> The gate is not `rules.bubbles`, which is the custom-race switch for whether
> rows spawn at all and still works. The +0.05 ultimate-charge reward runs
> before this gate and remains enabled.

| Constant | Value | Means |
| --- | --- | --- |
| `BUBBLE_GAP` | `[5400, 8600]` | road distance between rows |
| `BUBBLE_R` | `21` | draw and catch radius, scaled by scene |
| `BUBBLE_LIFE` | `30` | stall-breaker clock; only runs when the road has all but stopped |
| `BUBBLE_BLINK` | `1.6` | seconds of flashing before a row goes |
| `ITEM_SWAP` | `0.34` | seconds the box flashes on a trade |
| `CAN_TIME` | `2.2` | boost can: seconds of it |
| `CAN_SPEED` | `1.55` | boost can: pace, and it does not touch the boost meter |
| `OIL_LIFE` | `15` | seconds a slick stays live |
| `OIL_FADE` | `0.9` | seconds it spends fading out harmlessly afterwards |
| `SLIP_TIME` | `4` | seconds of reversed steering after touching one |
| `MISSILE_SPEED` | `2100` | seeker px/s |
| `MISSILE_LEN` | `1.45` | nose to tail, in car heights |
| `MISSILE_BODY` | `0.55` | body half width, in car widths |
| `MISSILE_FIN` | `0.92` | fin reach from centre, in car widths |

`SLICK_KINDS` holds four oil shapes — a round pool, a long smear, a scattered
splatter and a thin ribbon — each with a radius range, rotation, edge raggedness
(`jit`), sheen and droplet count. Each drop then gets its own seed on top, so even
two pools differ.

### Drop odds

Odds come from `RARITY` weights, and the garage table is computed from the same
numbers the roll uses, so the printed odds can never drift from what drops.

| Rarity | Weight | Item | Normally | When leading |
| --- | --- | --- | --- | --- |
| common | `60` | Boost can | 66.7% | 70.6% |
| rare | `25` | Oily oil | 27.8% | 29.4% |
| epic | `10` | *(unused)* | — | — |
| legendary | `5` | Seeker | 5.6% | — |

The seeker is never offered to whoever is already leading; out in front its share
is redistributed across the other two. `epic` is defined and coloured but no item
currently uses it. These odds describe the roll, which is still correct and
still tested; while the reward gate above is closed the roll is simply never
reached from a bubble.

## Conditions

`CONDITIONS` in `data.js` is the whole model: six entries, and the key order is
the priority order a stack of badges is drawn in.

| Condition | Colour | Type | Icon | Comes from |
| --- | --- | --- | --- | --- |
| `invulnerable` | `#FFD86B` | buff | shield | `G.invuln` / `R.invuln`, granted by a respawn for `INVULNERABLE_TIME` |
| `boosted` | `#FF9A4A` | buff | forward chevrons | `boosting`, `ultOn`, `canT` or `shuntT` |
| `slowed` | `#8A9099` | debuff | arrow onto a floor | `G.slowT` / `R.slow` |
| `obscured` | `#B07A4A` | debuff | crossed-out eye | `blind` |
| `skidded` | `#0B0B0C` | debuff | paired skid marks | `G.slipT` / `R.slip` |
| `mindControlled` | `#8A4FE0` | debuff | musical note | `mindT`, set by an ulting Lolanthe's aura |

`activeConditions(who)` in `mechanics.js` is the only derivation, so nothing has
a second copy to fall out of step with those timers. A finished racer returns
none — it is out of the race, not protected within it. `type` is what splits the
garage's Buff and Debuff pages; nothing lists the two sides separately.

## Difficulty

`DIFFS` in `data.js`. None of these may ever multiply speed, charge rate or any
car capability — they describe the driver, not the car.

| Field | Means |
| --- | --- |
| `lapse` | how often it simply fails to see trouble in its own lane |
| `react` | `[min, max]` seconds before it acts on what it sees |
| `tick` | `[min, max]` seconds between reconsidering the race at all |
| `look` | how much further ahead than the road in front it reads hazards |
| `read` | how many seconds of the future it projects other cars into |
| `skill` | master competence; weights the quality of every judgement below |
| `hunt` | how deliberately it picks an offensive target rather than lashing out |
| `guard` | how well it protects the place it is holding |
| `judge` | how well it values an item or an ultimate against the situation |
| `plan` | how many think-ticks an intention survives before it is thrown away |
| `noise` | how much of its decision is left to chance |
| `block` `aggro` `boost` `ult` `keep` | lane and throttle appetites |

`TEMPERS` gives each car a leaning — `nerve`, `spite`, `patience` and `guard` —
and `makeTemper()` jitters it by ±0.17 at the start of every race, so five bots
on one setting are not the same bot five times.

## Input

In `js/input.js`:

| Constant | Value | Means |
| --- | --- | --- |
| `SWIPE_STEP` | `42` | px of horizontal travel that counts as a lane change |
| `SWIPE_LOCK` | `0.18` | seconds before a held drag may step again |
| `TAP_SLOP` | `14` | px a tap may wander and still count |
| `LONG_PRESS` | `0.35` | seconds of one-finger hold that fires the ultimate |
| `DOUBLE_TAP` | `0.5` | seconds within which a second tap uses the item |

Vertical gestures use a fixed 34px threshold, inline in the `pointermove` handler.

In `js/local.js`:

| Constant | Value | Means |
| --- | --- | --- |
| `STICK_ON` | `0.55` | pushed |
| `STICK_OFF` | `0.32` | centred — the gap between the two is deliberate hysteresis |
| `LANE_REPEAT` | `0.26` | seconds between steps while a stick is held over |
| `PAD_*` | | standard-mapping button indices |

## HUD

| Constant | Value | Where | Means |
| --- | --- | --- | --- |
| `PIP_FAR` | `500` | `data.js` | past this, an off-screen racer gets chevrons on the ladder instead of an edge badge with a distance |
| `EDGE_W` | `58` | `data.js` | edge badge width — sized for three digits and an `m` |
| `EDGE_ROW` | `32` | `data.js` | drop to the next row of badges |
| `FAR_W` | `34` | `data.js` | far marker width: two chevrons and nothing else |
| `PLACE_COLS` | | `data.js` | gold, silver, bronze, then white |
| `PCOLS` | | `data.js` | the four player colours, in join order |
| `COND_R` | `8` | `hud.js` | radius of a condition badge beside a car, at scene scale 1 |
| `HUD_COND_R` | `11` | `hud.js` | radius of a condition badge in the HUD corner |
| `COND_ICON_K` | `1.5` | `hud.js` | the icon's box, in badge radii — the canvas and the SVG both scale by it |

## Miscellaneous

| Constant | Value | Where | Means |
| --- | --- | --- | --- |
| `SPLASH_MS` | `2600` | `core.js` | how long the splash stays up |
| `SPLASH_IMAGE` | `""` | `core.js` | a data URI or a path to replace the built-in mark; empty keeps the mark |
| `RAINBOW` | | `data.js` | the seven bands of the space track |

### Sprite artwork and race size

All six base cars and both alternate forms use measured bounds and source-pixel exhaust anchors. `spriteFrame()` fits uniformly; `carDims()` and `racerDims()` keep rendering and hulls locked together. Menus use base models with their own preview size.

| Car | Race scale | Visible bounds (x,y,width,height) | Exhaust source pixels |
| --- | --- | --- | --- |
| Flann | 1.12 | 173,72,678,1337 | 355,1377; 669,1377 |
| Neela | 1.18 | 220,25,584,1398 | 352,1355; 671,1355 |
| Lolanthe | 1 | 90,12,844,1466 | 455,1354; 568,1354 |
| Verdant | 1.10 | 167,36,690,1473 | 738,1314 |
| Rhosyn | 1.14 | 162,73,701,1363 | 483,1366; 544,1366 |
| Saffron | 1.25 | 194,45,634,1390 | 473,1359; 552,1359 |

All base sheets are 1024×1536. Saffron’s dragon is 1199×1312; its bounds, six anchors and two-lane sizing are documented in [SAFFRON-QA.md](SAFFRON-QA.md). Neela’s alternate remains scale 1.09 with one energy emitter.

### Body hitboxes

Each model has its own traced polygon in logical car units. `carHit()` rotates and scales it without consulting image readiness. Rhosyn’s current solid nose replaces the former fork; Saffron’s dragon preserves wing/limb concavities. Empty corners, low-alpha detached pixels and decorative diffuser tips do not collide. The generic rectangle remains available as a geometry fallback, but no playable car uses it.

Aero-Glow uses 3.4m rung spacing and 2.2m divider-dash spacing adapted from Ponu. Every fourth rung is stronger. Scrolling comes from canonical owner travel, while speed drives streak length and edge intensity. Reduced motion keeps world structure without flicker.


### Unused constants

Two leftovers are declared but never read. They are harmless and are left in place
rather than removed:

| Constant | Where | Note |
| --- | --- | --- |
| `RIVAL_LAPSE` | `data.js` | superseded by the per-difficulty `lapse` field |
| `LANDSCAPE` | `core.js` | from before the road always ran up the screen |

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
