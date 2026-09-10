# SEREN

A minimalist three-column parkour racing game built with vanilla HTML, CSS and JavaScript.

You are one of six marbles racing down a three-column track. Hazards are generated
procedurally ahead of whoever is leading, speed climbs from 1.00x to 3.00x, and the run
ends with a final 500 metre stage that finishes against a wall. The readout under the
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
- A very rare bubbly square marked `?` is a gamble rather than a pad: touch it and it
  hands you one outcome at random — a yellow pad's shove, a rare pad's shove, a few
  seconds nothing can touch you, or the setback a bump would have cost you. Roughly two
  or three appear in a whole run, each rolls separately for every racer that reaches it,
  and it stays on the track once taken.
- Moving squares travel between two neighbouring columns, so the third column is always
  a way through.
- A hit removes you for two seconds; you respawn in a bubble that carries you over the
  track and sets you down on clear ground, with a moment of immunity afterwards.
- Moving into an occupied column shoves whoever is there one column further the same way.
  Run out of track and that racer is out.
- Speed climbs to 3.00x, then you travel the final 500 metres to the wall.

### Computer controls

| Action | Keys |
| --- | --- |
| Move left | `A`, `Q` or `←` |
| Move right | `D` or `→` |
| Crouch (hold) | `S`, `↓` or `Space` |
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
| Pause | The pause button, top right |

Portrait orientation is required.

## Repository structure

```text
seren/
├── index.html            markup, metadata, panels and the ordered script tags
├── README.md
├── .gitignore
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
    ├── 08-vfx.js         particles, ripples, dashes, speed lines, screen shake
    ├── 09-world.js       the canonical course in metres, obstacles, world-to-screen
    ├── 10-generator.js   the procedural course generator
    ├── 11-racers.js      Racer, the shared simulation, and Race
    ├── 12-ai.js          CPU decision-making across four difficulty levels
    ├── 13-run.js         run progression, countdown, final stage, finish sequence
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

## Dependencies

None. No frameworks, no libraries, no npm packages, no bundler, no build step. The sounds
are synthesised at runtime with the Web Audio API rather than loaded from files, and the
only images are the inline SVGs in `index.html`.
