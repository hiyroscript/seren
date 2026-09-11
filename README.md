# SEREN

A minimalist three-column parkour racing game built with vanilla HTML, CSS and JavaScript.

You are one of six marbles racing down a three-column track. Hazards are generated
procedurally ahead of whoever is leading, speed climbs from 1.00x to 3.00x, and the run
ends with a final 500 metre stage and a finish line to cross. The readout under the
distance is the speed of the run and nothing else: it steps up with the climb and holds
there, because a boost or a shove moves the racer rather than the run. The five rivals
run the same simulation you do — same movement, same hazards, same collisions, same
respawns — so the only thing separating you from them is where the decisions come from.

Black ink on paper white, sounds synthesised in the browser, English and French.

## How to play

- Change column to dodge the black shapes. A square blocks one column.
- Barriers marked with white chevrons can only be passed by crouching.
- Boost pads (yellow) shove you forward — steer into them.
- Rare purple-to-blue square pads are smaller and give twice the yellow pad’s added
  speed (+150% instead of +75%) for the same 1.35 seconds. Their gradient is a band of
  purple running into blue that travels the length of the pad, held still if reduced
  motion is enabled. Pads refresh the effect without stacking.
- Small bubbly squares marked `?` are not part of the course. They keep their own
  clock and turn up anywhere the field is actually racing — any column, any moment,
  as readily a marble in front of you as half a lap up the track — about one every
  three quarters of a minute, the rate the roll table used to hand them out at. They
  can be collected off camera, and the first racer to touch one removes it for everyone.
  They fill one item slot with one of four things, drawn at random:
  - a shield — a blue, pink and yellow rim around the marble, with the spawn
    bubble's shape but no soap film. It has no timer: one hazard hit breaks it
    and destroys the hazard instead of eliminating the racer. Contact with a
    shielded racer breaks the shield and rebounds the attacker; an edge or
    occupied retreat column eliminates an unshielded attacker. Two shields
    absorb the contact and both break. Stars and spawn immunity take priority;
  - a fake mystery square — drop it to leave a trap behind you; its question mark is
    upside down, and it disappears when it hits a racer, triggering the usual
    elimination and respawn;
  - a yellow bolt — the yellow pad's shove exactly, carried with you and spent where
    you want it, refreshed rather than stacked like every other boost;
  - a star cycling smoothly through the bubbles’ blue, pink and yellow — use it for
    five active seconds of full immunity, destroying every hazard you touch, including
    traps and crouch barriers. The marble wears the same gradient and moves at 3.25x
    the run speed, faster than the purple-blue pad’s 2.50x. Pads cannot weaken it.
    It looks like nothing a pad does: no pad flare, no chevrons, but a six-point
    corona turning behind the marble, a rim of the same light on it, twinkles shed
    as it runs, and a ribbon of those same travelling colours laid down the track
    behind it. The light gutters over its last second and a ring closes back onto
    the marble as it goes out, so the moment you are touchable again is one you see.

  Collecting another pickup consumes the square but preserves your held item. Unclaimed squares last 10 seconds
  from spawning and blink during the final 2 seconds (a steady fade with reduced
  motion). Pausing freezes them.
- A hazard that is destroyed does not simply disappear: it breaks where it stood.
  Its face comes apart into shards that spin and fall with the ground they broke on,
  and a ring goes out through the track in the colour of whatever broke it — a star
  running one down, or a dropped trap spending itself on the racer it caught.
- A white line on the right represents the whole race, from start at the bottom to
  finish at the top. Its bright section shows your progress; colored dots show all
  six racers, with a ring around yours. Like Redline, the finish distance is projected
  until the real finish line is planted.
- Falling black squares use Redline's meteor timing: a red landing marker warns
  for 0.9–3.2 active seconds, then a square drops onto that fixed track position.
  Its impact is dangerous for 0.4 seconds before clearing. Boosting or slowing
  does not change its clock; pausing does. They are dropped the same way mystery
  squares are — every few seconds, in any column, anywhere along the stretch the
  field is actually running rather than aimed at any one racer — and only onto a
  clear row of track, never past the finish run-in. Shields and stars protect
  against them.
- Moving squares travel between two neighbouring columns, so the third column is always
  a way through.
- A hit removes you for two seconds; you respawn in a bubble that carries you over the
  track and sets you down on clear ground, with a moment of immunity afterwards.
- The smoked square under the HUD counts your ducks: one mark per crouch, however long
  you hold it, reset at the start of each run.
- Moving into an occupied column shoves whoever is there one column further the same way.
  Run out of track and that racer is out.
- Speed climbs to 3.00x, then the finish line is planted ahead of the leader. Hazards
  carry on right up to a short clear run-in, and nothing is ever authored past the line.
- Crossing the line pays a place. A finisher is out of play from that instant — nothing on
  the track can touch it, and no boost, shove or bubble follows it over — and instead of
  stopping where it crossed it rolls out onto the mark its place earned: first place rolls
  furthest, every place behind stops one step earlier, each in the column the staircase
  hands it. The field parks in the order it finished.
- The camera stops at the line when you cross it, so the run-out is something you watch.
  The rest of the field keeps racing.
- Once you are parked, the results come up on smoked glass over the field rather than
  instead of it: the place you took in big type, then the number of times you were
  eliminated and the number of times you ducked, and Play Again and Return Home at the
  foot of it. The X in its corner puts it away without ending the screen — Play Again,
  Return Home and Show Results take over at the bottom, and Show Results brings it back.
- The place readout at the top left changes colour for a moment whenever your place
  changes: one ink for a place taken, another for a place lost, fading back to black.
- The line itself wears the same soap film as the mystery squares and the respawn
  bubbles, drawn as a band across all three columns.

### Computer controls

| Action | Keys |
| --- | --- |
| Move left | `A`, `Q` or `←` |
| Move right | `D` or `→` |
| Crouch (hold) | `S`, `↓` or `Space` |
| Use item | `Shift` or click the bottom-right slot |
| Pause / resume | `Escape` |
| Start from the home screen | `Enter` or `Space` |

Menus and home-screen circles also respond to the mouse.

A landscape window at least 620 px wide is required; the playfield is drawn as a centred
portrait corridor inside it.

### Mobile-device controls

| Action | Gesture |
| --- | --- |
| Change column | A decisive swipe left or right (one column per flick) |
| Crouch | Swipe down and keep your finger on the glass |
| Use item | Tap the bottom-right slot or quickly double-tap the screen |
| Pause | The pause button, top right |

Portrait orientation is required.

## Repository structure

```text
seren/
├── index.html            markup, metadata, panels and the ordered script tags
├── favicon.svg           the mark: one marble in three columns
├── README.md
├── .gitignore
│
├── test/
│   └── suite.js          headless-browser tests over the game's own invariants
│
├── css/
│   └── seren.css         the whole visual identity
│
└── js/
    ├── 00-utils.js       maths and easing helpers
    ├── 01-storage.js     safe localStorage wrapper (the seren.* namespace)
    ├── 02-i18n.js        English and French strings, lookup, number formatting
    ├── 03-marbles.js     the six marbles and their drawn devices
    ├── 04-settings.js    player settings and persistence
    ├── 05-audio.js       Web Audio synthesis — every sound effect
    ├── 06-config-state.js  CFG balancing values, accent colour, device detection, App/ST
    ├── 07-layout.js      canvas, VIEW, PF, safe areas, responsive sizing
    ├── 08-vfx.js         particles, ripples, dashes, speed lines, screen shake,
    │                     the break-up of a destroyed hazard and the star's sparks
    ├── 09-world.js       the canonical course in metres, obstacles, the loose
    │                     squares dropped onto it, world-to-screen, and the soap
    │                     film every friendly thing on it wears
    ├── 10-generator.js   the procedural course generator, and the mystery
    │                     squares' own clock, which is not part of it
    ├── 11-racers.js      Racer, the shared simulation, and Race
    ├── 12-ai.js          CPU decision-making across four difficulty levels
    ├── 13-run.js         run progression, countdown, final stage, the finish line
    ├── 14-rendering.js   every canvas drawing routine, in draw order
    ├── 15-input.js       keyboard, mouse and the gesture system
    ├── 16-home.js        the interactive canvas home screen
    ├── 17-screens.js     panel navigation, pause, completion, chrome
    ├── 18-settings-ui.js applyI18n() and the DOM-side settings synchronisation
    ├── 19-orientation.js the orientation gate
    ├── 20-main-loop.js   update(), frame() and the requestAnimationFrame loop
    └── 21-boot.js        event wiring and boot()
```

The JavaScript files are classic scripts, not ES modules. They share one global scope and
are loaded with `<script defer>` in the numbered order above, which is their dependency
order: nothing runs before the state it depends on exists. Keep that order if you add a
file, and keep each object authoritative — there is exactly one `Settings`, one `App`, one
`Race`, one `Run`, one `Player`, one `Input` and one `Sound`.

## Running it locally

Everything is static, so the files can be opened directly, but a local HTTP server is
preferable: `file://` origins have no usable `localStorage` in some browsers, which breaks
saved settings, and they make the separate CSS and JS files behave inconsistently across
browsers.

Any static server will do — from the repository root:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose your default branch and the `/ (root)` folder, then **Save**.

The site is served from `https://<user>.github.io/<repository>/` within a minute or so. No
build step and no workflow are needed — the paths in `index.html` are relative, so the game
works from a project subpath as well as from a user or organisation root.

## Tests

`test/suite.js` drives the real game in a headless browser and asserts its
invariants — no mocks, it calls the game's own `update()` and `render()`. It
covers the speed readout, the ground the camera actually travels, the pads, the
mystery square and where it turns up, all four items it hands out, the effect a
destroyed hazard leaves behind, the place readout's colour change,
the crouch tally, the generator's fairness floor, pause and restart, the finish
line, the parked field past it and the results dialog over it, reduced motion,
both languages, and full runs at three difficulties on desktop and mobile
viewports.

It is a development tool and is not part of the site. It needs a static server
and Playwright's Chromium:

```sh
python3 -m http.server 8123 &
node test/suite.js
```

It exits non-zero on failure. Point it elsewhere with `SEREN_URL`. A globally
installed Playwright works too: `NODE_PATH=$(npm root -g) node test/suite.js`.

## Dependencies

None. No frameworks, no libraries, no npm packages, no bundler, no build step. The sounds
are synthesised at runtime with the Web Audio API rather than loaded from files, and the
only images are the inline SVGs in `index.html` and `favicon.svg`. The test suite above is
the one exception,
and it ships nothing to the browser: it needs Playwright to drive one, but the site does
not.
