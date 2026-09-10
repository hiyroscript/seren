'use strict';

/* ============================================================================
   5. CONFIG — all balancing values live here, named.
   Distances are expressed in "N" units = fractions of the playfield height,
   so every value is resolution independent.
   ========================================================================== */
var CFG = {
  /* world */
  METERS_VISIBLE:   26,     /* metres represented by one playfield height */
  BASE_SPEED:       12.5,   /* metres per second at 1.00x */
  SPEED_STEP:       0.05,
  SPEED_STEP_TIME:  20,     /* seconds of active play per step */
  SPEED_MAX:        2.00,
  FINAL_DISTANCE:   500,    /* metres of the final stage */
  SUCTION_DISTANCE: 100,    /* metres of gap at which the wall takes hold */
  WORLD_AHEAD:      46,     /* metres of course authored beyond the leader */

  /* racers */
  RACERS:           6,      /* one human, five rivals */
  GRID_ROW:         2.9,    /* metres between the two rows of the starting grid */
  GRID_IMMUNITY:    1.2,    /* seconds of room to breathe as the field spreads */
  ENTRY_DIST:       15,     /* metres a racer rolls in from during the countdown */
  ENTRY_TIME:       1.9,    /* seconds that roll takes */
  ENTRY_STAGGER:    0.08,   /* seconds between one racer setting off and the next */
  BOOST_SCALE:      1.55,   /* how much ground a boosted racer gains */
  BOOST_TIME:       1.35,   /* seconds the shove forward lasts */
  BOOST_FLASH:      0.32,   /* seconds a pad stays lit after it fires */
  MOVER_PERIOD:     1.7,    /* seconds a moving square takes to cross and back */
  SHUTTLE_PERIOD:   1.05,   /* the quick one */
  BUMP_RANGE:       2.6,    /* metres of overlap needed for contact to make sense */
  BUMP_COOLDOWN:    0.22,   /* seconds before a racer can trade contact again */
  BUMP_SLOW_TIME:   2.0,    /* seconds a shoved racer is held back */
  BUMP_SLOW_SCALE:  0.62,   /* how much ground a shoved racer loses */
  BUBBLE_TIME:      1.25,   /* seconds the respawn bubble is guaranteed to carry */
  BUBBLE_MAX:       3.5,    /* but never longer than this, whatever is below */
  BUBBLE_DROP:      0.34,   /* seconds it takes to set the racer down */
  LAND_LEAD:        1.2,    /* seconds of clear track wanted under it before it lets go */

  /* player */
  PLAYER_Y:         0.845,  /* fraction of playfield height */
  PLAYER_R:         0.225,  /* fraction of column width */
  LANE_TIME:        0.155,  /* seconds per lane switch */
  CROUCH_RATE:      22,     /* crouch easing rate */
  ROLL_RATE:        0.85,   /* radians of marble spin per metre travelled */
  CROUCH_SHRINK:    0.42,   /* how far the marble shrinks when it ducks */
  DASH_TIME:        0.30,   /* seconds a lane-switch dash survives */
  HITBOX_FORGIVE:   0.84,
  OBSTACLE_FORGIVE: 0.055,  /* shrink obstacles by this fraction of their size */

  /* collision / respawn */
  RESPAWN_DELAY:    1.7,
  IMMUNITY_TIME:    2.0,
  IMMUNITY_EXTEND:  0.25,
  IMMUNITY_MAX_EXT: 1.6,

  /* generation */
  REACTION_BASE:    0.58,   /* seconds guaranteed between obstacles */
  REACTION_LANE:    0.22,   /* extra seconds per lane the player must travel */
  CROUCH_RELEASE:   0.15,   /* extra seconds after a crouch barrier */
  WALL_COOLDOWN:    2.6,    /* seconds between full-width barriers */
  SPAWN_MARGIN:     0.04,   /* spawn this far above the playfield (N) */

  /* timing */
  COUNT_STEP:       0.68,
  SPLASH_TIME:      2.5,
  IRIS_IN:          0.55,
  IRIS_OUT:         0.6
};

/* ---------------------------------------------------------------------------
   ACCENT — the world is ink on paper, but its *energy* takes on colour, and
   that colour travels round the wheel as the run accelerates: cool at 1.00x,
   hot by 2.00x, resolving into the full spectrum of the finish wall.
   Set ACCENT to false for a strictly black-and-white run.
   ------------------------------------------------------------------------- */
var ACCENT = true;
function accentHue() { return lerp(206, 342, clamp((Run.mult - 1) / 1, 0, 1)); }
function accent(a, light) {
  if (!ACCENT) return 'rgba(0,0,0,' + a + ')';
  return 'hsla(' + accentHue().toFixed(0) + ',88%,' + (light || 52) + '%,' + a + ')';
}

/* ============================================================================
   DEVICE + STATE
   ========================================================================== */
var UA = navigator.userAgent || '';
function detectMobile() {
  if (/Android|iPhone|iPod|iPad|Windows Phone|IEMobile|Opera Mini/i.test(UA)) return true;
  if (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) return true; /* iPadOS */
  try {
    if (window.matchMedia('(pointer: coarse)').matches &&
        window.matchMedia('(any-hover: none)').matches &&
        Math.min(screen.width, screen.height) < 900) return true;
  } catch (e) {}
  return false;
}
var IS_MOBILE = detectMobile();

var ST = {
  LANG: 'LANGUAGE_SELECT', SPLASH: 'SPLASH', HOME: 'HOME',
  HOWTO: 'HOW_TO_PLAY', SETTINGS: 'SETTINGS', MARBLE: 'MARBLE_SELECT', CPU: 'CPU_SELECT',
  COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING', PAUSED: 'PAUSED',
  RESPAWNING: 'RESPAWNING', FINISH: 'FINISH_SEQUENCE', COMPLETED: 'COMPLETED'
};

var App = {
  state: ST.SPLASH,
  prev: null,          /* screen to come back to from SETTINGS */
  blocked: false,      /* wrong orientation -> gameplay suspended */
  time: 0,             /* global clock, always running (menus animate on it) */
  set: function (s) { this.state = s; syncChrome(); }
};
function inRun(s) {
  s = s || App.state;
  return s === ST.PLAYING || s === ST.RESPAWNING || s === ST.COUNTDOWN || s === ST.FINISH;
}
