"use strict";

/* SEREN - shared runtime state and layout.
   The canvas and its context, the road geometry, the split-screen view
   geometry, the one mutable game-state object G, the rule set readers, and
   the layout/resize machinery. It defines the state; it does not start the
   application - that is main.js. */

/* ================================================================
   RACE ENGINE
   ================================================================ */
const cv = $("#cv"), roadCtx = cv.getContext("2d");
/* Every model draws through this one handle. The select-screen icon painter
   borrows it for a moment so the icons come out of the same code as the road. */
let ctx = roadCtx;
let W=0, H=0, DPR=1;
let roadX=0, roadW=0, laneW=0, sideW=0, carW=0, carH=0, playerY=0, vign=null;
let SCENE = 1;                            /* scene scale, set by layout() from H */

/* ---- split screen ------------------------------------------------
   Local play draws the same world once per human, side by side. One world,
   several windows on to it: the master frame is player one's, and every other
   view is that frame shifted so its own car sits exactly where player one's
   sits in theirs.

   W is the width of one view, never of the canvas. Everything the world is
   built from has always measured off W, so a column is simply a narrower game
   and not one line of the road, the scenery or the cars has to know how many
   columns there are. */
let VIEWS = 1;              /* how many columns the canvas is cut into */
let FULLW = 0;              /* the whole canvas, in design px */
let CAMDY = 0;              /* this view's camera shift, in master screen px */
let CT = 0, CB = 0;         /* what this view can see, in master screen coords */
let VOWN = "me";            /* whose view is being drawn */
let VW_TOP = 0, VW_BOT = 0; /* the union of every view: what the world must cover */

/* Where a car's own view sits relative to the master frame. */
function camDy(who){ return who === "me" ? 0 : playerY - who.y; }

/* The union of every drawn view, in master screen coords. In a single-view
   game that is exactly the screen. In local play it stretches to cover the
   leading and the trailing human, so scenery is built and kept for the whole
   spread rather than for player one's window alone - otherwise a player half a
   screen up the road drives through an empty white world. */
function viewBounds(){
  if(!G.local){ VW_TOP = 0; VW_BOT = H; return; }
  let lo = 0, hi = H;
  for(let i=0;i<G.humans.length;i++){
    const dy = camDy(G.humans[i]);
    if(-dy < lo) lo = -dy;
    if(-dy + H > hi) hi = -dy + H;
  }
  VW_TOP = lo; VW_BOT = hi;
}
/* First y of a road pattern of this period that is at or above the top of the
   view being drawn. The markings are periodic in the scroll, so shifting the
   camera is the same as advancing the phase - this is what says by how much. */
function perTop(off, per){ return off + Math.floor((CT - off)/per)*per; }

const G = {
  state:"idle", lane:1, x:0, tilt:0,
  scroll:0, speed:0, dist:0, meters:0,
  charge:1, boosting:false, keyBoost:false, ptrBoost:false,
  build:[[],[]], props:[], walks:[],
  shake:0, timers:[], swipeLock:0,
  biome:"city", next:null, seam:null, trackT:60, seamPts:[], seamBits:[],
  traps:[], fx:[], trapGap:0, nextTrap:600,
  tier:0, speedT:30, blind:0, blindPts:[], dead:0, invuln:0, slowT:0,
  car:"flann", ult:0, ultOn:false, ultKey:false, ultArmed:true,
  /* The active meter displays seconds remaining / the fixed duration. */
  ultT:0, ultMax:ULT_TIME,
  /* ---- Neela's ultimate, on the racer that is holding one -------
     Every racer carries these, player one and rival alike, so the mechanic
     never has to ask which kind of object it is looking at.

     `neelaForm` is whether the alternate body is the one on the road right
     now, and it is deliberately not the same question as "is Neela's ultimate
     running": after the one swap the form is gone and the ultimate is not.
     `neelaOrigin` is the world pose the ultimate was fired from, captured
     before the transformation and handed to whoever gets swapped back to it.
     `neelaSwapped` is the one swap, spent.

     `whiteT` is this racer's own whiteout - its view, nobody else's - and is
     separate from `blind`, which is puddle water and draws puddle water.
     `morphT` is the white flash on the body itself, which any car can wear
     because any car can be the one teleported. `swapGuard` is a single step's
     worth of "this contact has already been dealt with". */
  saffronPhase:"off", saffronT:0, saffronLift:0,
  neelaForm:false, neelaOrigin:null, neelaSwapped:false,
  whiteT:0, morphT:0, swapGuard:0, trail:[], trailGap:0,
  /* ---- Lolanthe's and Verdant's ultimates, on the racer holding one ----
     Carried by every racer for the same reason Neela's are: the mechanic
     never has to ask which kind of object it is looking at.

     `mindT` is the Mind Controlled Condition and the control lock together -
     conditionOn() derives the badge from it and controlsLocked() derives the
     lock from it, so there is no second copy to fall out of step. It is set to
     MIND_CONTROL_TIME and never added to. `mindPop` and `mindOut` are the
     three notes' entrance and exit, and only the inactive-to-active transition
     starts the entrance - a timer merely being reset does not. `mindSide` is
     the one-time coin toss that says which way a racer caught in the middle
     lane gets pushed, so the push does not flicker between frames.

     `queenPop` and `queenOut` are the same pair for the note above an ulting
     Lolanthe. `verdantHide` is how far into hiding Verdant is, 0 to 1, and is
     cosmetic throughout: the hitbox, the contact rules and the race never read
     it. `verdantRevealT` is the split second of full visibility a racer buys
     by running into it. */
  mindT:0, mindPop:0, mindOut:0, mindSide:0,
  queenPop:0, queenOut:0, verdantHide:0, verdantRevealT:0,
  /* ---- Rhosyn's ultimate, on the racer that is holding one -----
     Carried by every racer for the same reason the three above are.

     `aeroPhase` is the whole of Aero-Glow's state: "off", "in", "glow" or
     "out". It is deliberately not the same question as "is Rhosyn's ultimate
     running" - it starts a moment before the driver's view changes hands and
     outlives the meter by the length of one white transition, which is the
     stretch in which the car is neither in the void nor yet back on the road.
     rhosynElsewhere() is the one reader anything outside the renderer uses.

     None of it is a position. There is no second race `y`, no saved pose, no
     entry biome and no Aero-Glow distance: the racer's lane, x, tilt, speed
     and metres are the canonical ones the shared simulation goes on
     advancing throughout, which is why coming back needs no correction.

     `aeroT` is the transition clock, running only in "in" and "out".
     `aeroHide` is how far out of the shared road the body has faded, 0 to 1,
     and is cosmetic: every other view watches the car leave and arrive
     through it, and the isolation itself is the phase and not this. */
  aeroPhase:"off", aeroT:0, aeroHide:0,
  boostLock:false, rivals:[], stepFlash:0, parkWait:0, parkRot:0,
  cdT:0, cdStep:-1, wasCounting:false,
  mode:"endless", diff:"medium",
  /* the short forward shove a rear-end hands its victim */
  shuntT:0, bumpCD:0,
  slipT:0, item:null, swapT:0, boxes:[], slicks:[], missiles:[], boxGap:0, nextRow:6000, canT:0, lastTap:-9, tapClock:0,
  raceT:0, tracksLeft:-1, finishAt:0, finished:null, results:[], raceDone:false,
  /* local play */
  local:false, players:1, picks:[], humans:[], padBoost:false,
  pad:0, padId:null, padIds:[], pk:null, seat:0,
  custom:false, rules:null
};

/* ---------------- what is on the table ---------------------------
   Every mode runs on a rule set. Standard play and both single-player modes
   run on this one, which is the game as it has always been - so the rules
   object is never a special case bolted onto local play, it is the thing the
   race has always been reading and simply could not be changed before.

   bots is -1 for "fill the grid", which is what six-cars-whatever-happens has
   always meant; a custom race can name a number instead, down to nobody. */
function defaultRules(){
  return { bots:-1, traps:true, bubbles:true, boost:true, ults:true };
}
/* How many bots this race actually wants. -1 fills whatever the people leave. */
function botsWanted(){
  const fill = FIELD_SIZE - (G.local ? G.players : 1);
  const r = G.rules || defaultRules();
  return r.bots < 0 ? fill : clamp(r.bots, 0, fill);
}
/* One reader per switch, so nothing downstream has to know a rules object
   exists or cope with it being missing. */
function ruleOn(k){
  const r = G.rules || defaultRules();
  return r[k] !== false;
}

function diff(){ return DIFFS[G.diff] || DIFFS.medium; }

function layout(){
  /* Everything the world is built from scales off the height, against a
     portrait phone as the reference. That is what keeps the two orientations
     the same game: a short landscape viewport draws a smaller road and smaller
     cars, so the stretch of road in front of you - measured in car lengths -
     comes out identical. Width still caps the road on a narrow screen, which
     is what portrait has always done. */
  SCENE  = clamp(H/860, 0.34, 2.2);
  roadW  = Math.min(W*0.72, 400*SCENE);
  roadX  = (W-roadW)/2;
  laneW  = roadW/3;
  sideW  = clamp(roadX*0.4, 10*SCENE, 32*SCENE);
  carW   = Math.min(laneW*0.64, 62*SCENE);
  carH   = carW*1.86;
  playerY= H - carH*0.62 - H*0.15;
  G.x    = laneCX(G.lane);
  if(G.seam !== null) buildSeamShape();
  vign = ctx.createRadialGradient(W/2, H*0.55, H*0.28, W/2, H*0.55, H*0.9);
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(0,0,0,0.55)");
  seedWorld();
}
function laneCX(i){ return roadX + laneW*(i+0.5); }

/* Race-only uniform size. Rendering and hulls use these same dimensions;
   menus fit the measured base artwork independently. */
function raceScale(carId){
  const c = CARS[carId];
  return c && c.raceScale > 0 ? c.raceScale : 1;
}
function carDims(carId){
  const k = raceScale(carId);
  return { w:carW*k, h:carH*k };
}
/* Authoritative active model for body, hull, exhaust and dimensions. */
function racerModel(who){
  const o = who === "me" || who === undefined ? G : who;
  const c = CARS[o && o.car];
  if(!c) return CARS.flann;
  /* Asked with the racer itself rather than the argument, so carHit() calling
     this with nothing at all still means player one. */
  return c.altForm && (neelaFormActive(o) || saffronDragonActive(o)) ? c.altForm : c;
}
/* A model may be drawn larger or smaller than the racer's own box; only an
   alternate form uses it, and only to keep the shape it turns into the size
   of the car it replaced. */
function modelScale(model){ return model && model.scale > 0 ? model.scale : 1; }

/* The same answer for a racer rather than a car id: "me", a rival, or any
   object carrying a `car` key - and through the model, so a racer wearing an
   alternate body is measured at that body's size. */
function racerDims(who){
  const o = who === "me" || who === undefined ? G : who;
  const d = carDims(o && o.car);
  const model = racerModel(who);
  if(model.laneSpan) return {w:laneW*model.laneSpan, h:laneW*model.laneSpan*1.86};
  const k = modelScale(model);
  return k === 1 ? d : { w:d.w*k, h:d.h*k };
}

/* How much bigger the desktop shell can be drawn than it is laid out. Measured
   from the shell's own layout box, which a transform does not affect, so there
   is no feedback loop. Floored at 1 - this only ever makes things larger. */
function deskFit(){
  const root = document.documentElement;
  if(!document.body.classList.contains("desk")){
    root.style.setProperty("--desk-k", "1");
    return 1;
  }
  const sh = $("#shell");
  const w = sh.clientWidth, h = sh.clientHeight;
  if(w < 2 || h < 2) return 1;
  const k = clamp(Math.min(window.innerWidth/w, window.innerHeight/h), 1, 3);
  root.style.setProperty("--desk-k", k.toFixed(4));
  return k;
}

function resize(){
  const k = deskFit();
  /* The rect includes the desktop scale, so divide it back out: the game keeps
     thinking in the same design coordinates it always has, and every cap in
     layout() still means exactly what it meant. The backing store is then sized
     from the on-screen rect, so blowing the shell up stays crisp - cw*DPR comes
     out at r.width*devicePixelRatio either way. */
  const r = cv.getBoundingClientRect();
  const cw = Math.max(1, r.width/k), ch = Math.max(1, r.height/k);
  DPR = Math.min(Math.min(window.devicePixelRatio || 1, 2)*k, 3);
  cv.width = Math.round(cw*DPR); cv.height = Math.round(ch*DPR);
  {
    FULLW = cw; H = ch;
    W = cw/VIEWS;                              /* one column is one game */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  CT = 0; CB = H; CAMDY = 0; VW_TOP = 0; VW_BOT = H;
  layout();
}
