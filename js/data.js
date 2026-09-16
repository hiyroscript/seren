"use strict";

/* SEREN - the game's definitions and tuning numbers. Cars, difficulties,
   temperaments, conditions, items, tracks and every constant the systems read.
   Loaded before runtime.js because the global state object is built from
   some of these. Nothing here has behaviour of its own. */

const CARS = {
  redd: {
    key:"redd", style:"gt", accent:"#FF4A50",
    body:"#E21B22", dark:"#101116", glass:"#3B404A",
    flame:["#FF7A3A","#FFD9A0"]
  },
  phantom: {
    key:"phantom", style:"jet", accent:"#6FC8FF",
    body:"#EDF1F6", dark:"#16305A", glass:"#7FB3E8", trim:"#1E5FA8",
    flame:["#2FA8F0","#CFEFFF"]
  },
  bolt: {
    key:"bolt", style:"buggy", accent:"#FFD21E",
    body:"#F5C400", dark:"#141414", glass:"#4A4636", trim:"#141414",
    flame:["#FFE44D","#FFFBDA"]
  },
  timestamp: {
    key:"timestamp", style:"wedge", accent:"#3FD98A",
    body:"#1F7A4C", dark:"#0E0E10", glass:"#7FE8B6", trim:"#3FD98A",
    flame:["#3FD98A","#D6FFE9"]
  },
  rose: {
    key:"rose", style:"coupe", accent:"#FF7ACF",
    body:"#7B3FA8", dark:"#2A1038", glass:"#FFB6E6", trim:"#FF7ACF",
    flame:["#FF7ACF","#FFD9F2"]
  },
  siren: {
    key:"siren", style:"cruiser", accent:"#4D8BFF", pip:"#FFFFFF",
    body:"#F2F3F5", dark:"#101114", glass:"#5A6472", trim:"#101114",
    flame:["#4D8BFF","#FFFFFF"]
  }
};
const CAR_IDS = ["redd","phantom","bolt","timestamp","rose","siren"];

/* ---------------- opposition -------------------------------------
   There is deliberately no charge multiplier here any more. Every car on the
   road - yours and theirs - fills its meter off the same ULT_CHARGE clock, so
   a difficulty setting changes how well a bot drives and how well it picks its
   moment, never how much sooner it gets to press the button. `ult` is still
   read: it is judgement, not rate. */
/* A difficulty is not a multiplier on anything the car does. Every one of these
   numbers describes how well the driver thinks: how far up the road it looks,
   how long it takes to act on what it sees, how often it misses something
   entirely, how well it reads what an item or an ultimate is worth right now,
   and how well it picks its moment. The car itself is the same car at every
   setting - same pace, same charge clock, same rules.

   - lapse  how often it simply fails to see trouble in its own lane
   - react  how long it takes to do something about it, in seconds
   - tick   how often it reconsiders the race at all
   - look   how much further ahead than the road in front it reads hazards
   - read   how many seconds of the future it projects other cars into
   - skill  master competence: weights the quality of every judgement below
   - hunt   how deliberately it picks an offensive target rather than lashing out
   - guard  how well it protects the place it is holding
   - judge  how well it values an item or an ultimate against the situation
   - plan   how many think-ticks an intention survives before it is thrown away
   - noise  how much of its decision is left to chance
   - block/aggro/boost/ult/keep  the old lane and throttle appetites, kept */
const DIFFS = {
  easy:   { key:"diffEasy",   lapse:0.52, react:[0.70,1.40], tick:[0.50,0.95],
            block:0.02, aggro:0.08, boost:0.10, ult:0.05, keep:0.00, look:0,
            skill:0.14, hunt:0.10, guard:0.06, judge:0.10,
            plan:0, noise:0.50, read:0.00 },
  medium: { key:"diffMedium", lapse:0.26, react:[0.35,0.75], tick:[0.34,0.68],
            block:0.16, aggro:0.24, boost:0.34, ult:0.28, keep:0.10, look:110,
            skill:0.46, hunt:0.42, guard:0.36, judge:0.46,
            plan:1, noise:0.26, read:0.35 },
  hard:   { key:"diffHard",   lapse:0.10, react:[0.18,0.42], tick:[0.22,0.46],
            block:0.44, aggro:0.50, boost:0.70, ult:0.70, keep:0.24, look:250,
            skill:0.80, hunt:0.78, guard:0.72, judge:0.82,
            plan:2, noise:0.11, read:0.80 },
  brutal: { key:"diffBrutal", lapse:0.03, react:[0.07,0.22], tick:[0.14,0.30],
            block:0.74, aggro:0.72, boost:1.00, ult:1.00, keep:0.32, look:380,
            skill:1.00, hunt:1.00, guard:1.00, judge:1.00,
            plan:3, noise:0.035, read:1.30 }
};
const DIFF_IDS = ["easy","medium","hard","brutal"];

/* ---------------- temperament ------------------------------------
   Difficulty says how well a driver thinks. Temperament says what it thinks
   about first, and it is what stops five bots on the same setting from being
   the same bot five times. Each car has a leaning that suits it - Redd is a
   brawler, Timestamp sits on its ultimate waiting for the moment - and every
   race jitters it, so the Redd you raced last time is not quite this one.

   - nerve     what it will risk: tight gaps, traffic, a lane somebody else wants
   - spite     how much it would rather hurt somebody than simply drive faster
   - patience  how long it will sit on an item or an ultimate for a better use
   - guard     how hard it defends the place it is holding */
const TEMPERS = {
  redd:      { nerve:0.74, spite:0.86, patience:0.22, guard:0.42 },
  phantom:   { nerve:0.88, spite:0.46, patience:0.44, guard:0.30 },
  bolt:      { nerve:0.54, spite:0.64, patience:0.68, guard:0.52 },
  timestamp: { nerve:0.38, spite:0.32, patience:0.88, guard:0.74 },
  rose:      { nerve:0.62, spite:0.58, patience:0.50, guard:0.58 },
  siren:     { nerve:0.46, spite:0.30, patience:0.66, guard:0.80 }
};
function makeTemper(car){
  const b = TEMPERS[car] || TEMPERS.redd;
  const j = function(v){ return clamp(v + rand(-0.17, 0.17), 0.04, 0.98); };
  return { nerve:j(b.nerve), spite:j(b.spite), patience:j(b.patience),
           guard:j(b.guard) };
}
/* ---------------- conditions -------------------------------------
   The one table every part of the game reads a Condition out of: the badges
   beside a rival car, the badges in the corner of your own HUD, and the
   reference page in the garage. Name, colour, whether it helps or hurts and
   which icon it wears all live here and nowhere else, so a Condition cannot
   mean one thing on the road and another in the garage.

   The key order is the priority order. activeConditions() walks this object,
   so a car wearing several badges stacks them the same way every frame.

   - key    the localisation key for its name
   - col    the badge's fill, and the only colour it is ever drawn in
   - type   "buff" or "debuff": the two pages the garage splits on
   - icon   which artwork in CONDITION_PATHS it wears
   - ink    the icon's colour on that fill, picked for contrast

   Debuffs are refused, and cleared, by temporary invulnerability. */
const CONDITIONS = {
  invulnerable: { key:"condInvulnerable", col:"#FFD86B", type:"buff",
                  icon:"shield",   ink:"#20180A" },
  boosted:      { key:"condBoosted",      col:"#FF9A4A", type:"buff",
                  icon:"chevrons", ink:"#241000" },
  slowed:       { key:"condSlowed",       col:"#8A9099", type:"debuff",
                  icon:"slow",     ink:"#0B0B0C" },
  obscured:     { key:"condObscured",     col:"#B07A4A", type:"debuff",
                  icon:"eye",      ink:"#1B0F05" },
  skidded:      { key:"condSkidded",      col:"#0B0B0C", type:"debuff",
                  icon:"skid",     ink:"#FFFFFF" }
};
/* The priority order, read straight off the table so the two cannot drift. */
const CONDITION_IDS = Object.keys(CONDITIONS);
/* The garage's two pages, generated from the table rather than listed again. */
function conditionsOfType(type){
  return CONDITION_IDS.filter(function(id){ return CONDITIONS[id].type === type; });
}
const ULT_CHARGE = 75;                    /* seconds from empty to ready */
const ULT_TIME = 15;                       /* seconds it lasts */
const ULT_SPEED = 2.0;                    /* what every ultimate is worth in pace */
/* gold, silver, bronze, then plain white for the rest of the field */
const PLACE_COLS = ["#FFD24A", "#D9DEE6", "#D08A4A", "#FFFFFF"];
/* ---------------- mystery bubbles ---------------- */
const RARITY = {
  common:    { col:"#E8E9EC", weight:60 },
  rare:      { col:"#4D8BFF", weight:25 },
  epic:      { col:"#B96BFF", weight:10 },
  legendary: { col:"#FFD24A", weight:5  }
};
const ITEMS = {
  can:    { key:"itemCan",    rarity:"common" },
  oil:    { key:"itemOil",    rarity:"rare" },
  seeker: { key:"itemSeeker", rarity:"legendary" }
};
const ITEM_IDS = ["can", "oil", "seeker"];
const BUBBLE_GAP = [5400, 8600];          /* road distance between rows */
const CAN_TIME = 2.2, CAN_SPEED = 1.55;   /* the boost can */
/* The slick is live for fifteen seconds, then fades out harmlessly. Anything
   it catches takes it with it there and then, so what you can see on the road
   is always what can still catch you. */
const OIL_LIFE = 15, OIL_FADE = 0.9, SLIP_TIME = 4;
/* Four ways oil lands on tarmac, so no two drops read the same: a round pool,
   a long smear laid down at speed, a scattered splatter, and a thin ribbon.
   Each drop then gets its own seed on top, which jitters the outline, throws
   the sheen off-centre and scatters the droplets - so even two pools differ.
   jit is how ragged the edge is, spots is how many droplets get flung clear. */
const SLICK_KINDS = [
  { rx:[30, 39], ry:[23, 29], rot:0.14, jit:0.26, sheen:0.95, spots:[0, 2] },
  { rx:[19, 25], ry:[34, 45], rot:0.10, jit:0.20, sheen:0.70, spots:[2, 5] },
  { rx:[25, 32], ry:[21, 27], rot:0.30, jit:0.46, sheen:0.50, spots:[3, 6] },
  { rx:[15, 20], ry:[30, 41], rot:0.34, jit:0.16, sheen:1.00, spots:[1, 3] }
];
const MISSILE_SPEED = 2100;
/* the seeker is a big piece of hardware: longer than a car and wider across
   the fins, so it reads as a threat from the far end of the road */
const MISSILE_LEN  = 1.45;                /* nose to tail, in car heights */
const MISSILE_BODY = 0.55;                /* body half width, in car widths */
const MISSILE_FIN  = 0.92;                /* fin reach from centre, in car widths */
const BUBBLE_R = 21;
/* A row does not sit there forever. It flashes and goes on whichever comes
   first: the clock below, or the last stretch before it drops off the bottom.
   Both matter, because at racing speed a row crosses the screen in about two
   seconds and never gets near the clock - the run-off is what warns you that
   one is about to be lost at speed, and the clock is only what clears rows when
   the road is barely moving. Either way you get the same flash.

   So the clock is really a question about being stopped: how long should a row
   wait for a driver who cannot reach it yet? Longer than the longest thing that
   can hold you still - a Bolt pin, an ordering, a wreck and a respawn back to
   back - and thirty seconds clears all of them with time in hand. */
const BUBBLE_LIFE = 30, BUBBLE_BLINK = 1.6;
/* Swapping one item for another can be completely silent - roll a can while
   holding a can and the box is pixel-identical before and after - so a trade
   gets its own short flash on the box. Without it a second bubble looks like a
   bubble that did nothing. */
const ITEM_SWAP = 0.34;
/* the pickup is drawn and caught at this radius, scaled with everything else */
function bubbleR(){ return BUBBLE_R*SCENE; }

const PIP_FAR = 500;                      /* an off-screen racer only gets an arrow past this */
/* Two kinds of off-screen marker, and the split is PIP_FAR.

   Inside it the car is close enough to matter to you right now, so the marker
   goes to the edge of the screen it went off, sits in that car's lane, and
   prints the gap: where it is, which side it is coming from, how far. Past it
   the number is no use - a car 1200m up is not a car you are about to meet -
   so the marker collapses to a pair of chevrons and moves to the ladder, where
   its dot already says how far down the race it is.

   The edge badge only ever prints three digits and an m, because anything
   larger is a far marker by definition, so it can be sized exactly. */
const EDGE_W = 58, EDGE_ROW = 32;         /* badge width, and the drop to the next row */
const FAR_W = 34;                         /* two chevrons and nothing else */

/* Player colours, in the order players join. Everything that has to say which
   player something belongs to says it with one of these four. */
const PCOLS = ["#FF3B3B", "#3B8CFF", "#35D06B", "#FFCE2B"];
const PCOL_KEYS = ["pRed", "pBlue", "pGreen", "pYellow"];
const LOCAL_MAX = 4;
const FIELD_SIZE = 6;       /* six cars on the road, however they are driven */

/* ---------------- tracks ----------------------------------------- */
const TRACK_SECONDS = 60;
const SPEED_SECONDS = 30;                 /* the road speeds up on this clock */
const BASE_SPEED = 420;                   /* 1.00x */
const MULT_STEP = 0.05, MAX_MULT = 2.00;  /* +5% every SPEED_SECONDS, up to double */
const MAX_TIER = Math.round((MAX_MULT - 1)/MULT_STEP);
const BLIND_TIME = 2.6;                   /* puddle: how long the view stays fouled */
const DEAD_TIME = 3, INVULNERABLE_TIME = 2;   /* destroy: wreck, then respawn untouchable */
const SLOW_TIME = 1.7;                    /* tumbleweed: how long it drags you down */
/* ---- meteor ----------------------------------------------------
   A rock falls on a clock of its own, and the ring under it is a spot on the
   road that scrolls with the road like everything else does.

   It used to be neither. The drop was measured in scrolled pixels against a
   mark that was a fixed row of player one's camera, which made two things
   wrong at once. The road is not the only thing that moves the scroll - a
   wreck stops it dead and an ultimate runs it at double pace - so the same
   rock hung in the sky through one and came down in half the time through the
   other. And a mark fixed to one camera is not a spot
   on the road at all - it never scrolled, so it could not be somewhere the
   field drives past.

   Both fall out of the same change: the ring is a road position, and how long
   the rock has left is seconds, independent of every racer’s speed. */
const METEOR_ALT = 300;                   /* how far up the rock comes in */
const METEOR_MIN_T = 0.9;                 /* never less warning than this */
const METEOR_MAX_T = 3.2;                 /* and never hanging longer than this */
const METEOR_ROCK_K = 0.66;               /* the last of the fall, with the rock in view */
/* Seconds of the fall during which the rock itself is drawn and can be hit. */
function rockLead(o){ return Math.max(0.2, (o.max || METEOR_MAX_T)*METEOR_ROCK_K); }
/* How high it still is. The fall, the roof test and the drawing all read this
   one number, so they cannot disagree about where the rock is. */
function rockAlt(o){ return METEOR_ALT*clamp(o.fall/rockLead(o), 0, 1); }
const TRACKS = {
  city:   { key:"trackCity",   ground:"#C9CCD3", shoulder:"#EDEEF1", road:"#16171B",
            mark:"rgba(237,238,241,0.86)", edge:"rgba(237,238,241,0.5)", accent:"#E21B22" },
  desert: { key:"trackDesert", ground:"#D6BC90", shoulder:"#BFA372", road:"#2B2722",
            mark:"rgba(233,214,158,0.82)", edge:"rgba(233,214,158,0.42)", accent:"#D9822B" },
  space:  { key:"trackSpace",  ground:"#07070D", shoulder:"#5CE1E6", road:"#0D0D15",
            mark:"rgba(255,255,255,0.92)", edge:"rgba(255,255,255,0.5)", accent:"#9B5CFF" }
};
const TRACK_IDS = ["city","desert","space"];
const RAINBOW = ["#FF3B4E","#FF8A2B","#FFD23B","#4FD46B","#3BC2FF","#5A6BFF","#B45CFF"];

const RIVAL_LAPSE = 0.14;                 /* how often it simply misses one */
const BUMP_SLOW = 1.3;
const ULT_ON_WRECK = -0.10;               /* what each event does to the meter */
const ULT_ON_TRAP  = -0.05;
const ULT_ON_KILL  =  0.10;
/* ---- the rear-contact shunt -------------------------------------
   Running into the back of somebody shoves them along for a moment while the
   car that hit them labours. It is a push down the same tarmac and nothing
   more, which is why it is named for a shunt. Both cars lose the same time to
   the bump. */
const SHUNT_TIME = 0.8, SHUNT_BOOST = 1.35;

const RACE_MINUTES = 5;                   /* bots mode: then three tracks to the flag */
const FINAL_TRACKS = 3;
const FINISH_STRETCH = 900;               /* metres of the last track before the line */
/* Where each finisher comes to rest, measured past the flag in car lengths.
   The winner rolls furthest and every place behind it stops one step earlier,
   so the order the race finished in is the order the field is parked in and
   nothing has to be untangled afterwards.

   The step is set by the lane cycle: consecutive places sit in different lanes,
   so the only pair that ever shares a lane is three places apart. Three steps
   is what has to clear a car length, and 3 x 0.44 leaves a third of a car
   between them. Any larger and sixth place falls off the bottom of the screen
   when you win. The base is what the last car home gets, and it is a shade over
   the distance a car coasts on its own, so nobody has to stop harder than the
   car would have stopped anyway. */
const PARK_BASE = 0.60;                   /* car heights past the line for the last car in */
const PARK_STEP = 0.44;                   /* car heights between one place and the next */
const PARK_EASE = 3.9;                    /* how hard the roll-out closes on the mark */

const TRAFFIC_PAINT = [
  {body:"#E9EAEE", dark:"#191B1F", glass:"#3E434B"},
  {body:"#8A9099", dark:"#15171A", glass:"#333840"},
  {body:"#3D444D", dark:"#101215", glass:"#5A626C"},
  {body:"#D8A03A", dark:"#191B1F", glass:"#3E434B"},
  {body:"#4F7F72", dark:"#101215", glass:"#39434A"},
  {body:"#B9BEC6", dark:"#15171A", glass:"#39404A"}
];
