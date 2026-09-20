"use strict";

/* SEREN - the rules of the road, shared by every car on it.
   Contact and collisions, lane changes, boost, wrecking and respawning,
   Conditions, ultimates, items, hazards and particles. Player and bot run the
   same functions here; nothing is duplicated for one or the other. */

/* ---------------- finish protection ------------------------------
   Crossing the line takes a racer out of play for the rest of the race: no
   targeting system may pick it, nothing can reach it, and nothing may alter
   the result it has just earned. This is a race lifecycle state and not a
   Condition - a finisher wears no badge, because it is no longer racing. */
function finishedCar(R){ return !!R && R.finished !== null; }
function finishedMe(){ return G.finished !== null; }

/* ---------------- temporary invulnerability ----------------------
   The Invulnerable Condition itself, and nothing else. Respawn protection is
   what grants it. It is deliberately kept apart from finish protection:
   activeConditions() asks these and never the finish flag, so a racer that has
   crossed the line is never presented as Invulnerable. */
function invulnerableMe(){ return G.invuln > 0; }
function invulnerableCar(R){ return !!R && R.invuln > 0; }
function invulnerableWho(who){ return who === "me" ? invulnerableMe() : invulnerableCar(who); }

/* The one internal answer to "can anything reach this car at all?". Temporary
   invulnerability, being wrecked, having finished and having left the shared
   road for Aero-Glow all say no, and every contact, hazard and targeting test
   downstream asks this rather than reassembling the four for itself.

   The first three are protections: the racer is there and something is
   refusing to let the road have it. The fourth is not a protection at all -
   see rhosynElsewhere() below. There is no body at that position to reach,
   because the body is somewhere the race does not go. */
function refusesDebuffs(who){
  if(who === "me")
    return finishedMe() || G.dead > 0 || invulnerableMe() || rhosynElsewhere("me");
  return !who || finishedCar(who) || who.dead > 0 || invulnerableCar(who) ||
         rhosynElsewhere(who);
}
/* Protection is independent of the ultimate speed multiplier. */
function safeCar(R){ return !R || noContact(R); }
function playerUntouchable(){ return noContact("me"); }

/* Road reachability also excludes flight. Mental reachability does not:
   airborne Saffron still shares Lolanthe’s canonical road-distance aura. */
function noContact(who){ return refusesDebuffs(who) || saffronAirborne(who); }
function clearDebuffs(who){
  const o = who === "me" ? G : who;
  if(who === "me"){
    G.slowT = 0; G.blind = 0; G.slipT = 0;
  } else if(who){
    who.slow = 0; who.blind = 0; who.slip = 0;
  }
  /* Mind Control is a debuff like the other three, so protection takes it
     away with them - and the three notes go with it rather than being left
     orbiting a car that is no longer controlled. */
  if(o){ o.mindT = 0; o.mindPop = 0; o.mindOut = 0; }
}
function sweepDebuffs(){
  if(invulnerableMe() || finishedMe()) clearDebuffs("me");
  for(let i=0;i<G.rivals.length;i++){
    const R = G.rivals[i];
    if(invulnerableCar(R) || finishedCar(R)) clearDebuffs(R);
  }
}

/* Saffron's altitude is presentation, never a second race coordinate. */
function saffronCar(who){ const o = who === "me" ? G : who; return !!o && o.car === "saffron"; }
function saffronDragonActive(who){
  const o = who === "me" ? G : who;
  return saffronCar(who) && (o.saffronPhase === "rise" || o.saffronPhase === "air");
}
function saffronAirborne(who){
  const o = who === "me" ? G : who;
  return saffronCar(who) && ["rise","air","drop"].includes(o.saffronPhase);
}
function saffronAltitude(who){
  const o = who === "me" ? G : who;
  return (o && o.saffronLift || 0)*carH*1.15;
}
function clearSaffronState(who){
  const o = who === "me" ? G : who;
  if(o){ o.saffronPhase = "off"; o.saffronT = 0; o.saffronLift = 0; }
}
function beginSaffronFlight(who){
  const o = who === "me" ? G : who;
  o.saffronPhase = "rise"; o.saffronT = 0; o.saffronLift = 0;
  startWhiteout(who); startMorph(who);
}
function beginSaffronDrop(who){
  const o = who === "me" ? G : who;
  o.saffronPhase = "drop"; o.saffronT = 0; o.saffronLift = 1;
  startWhiteout(who); startMorph(who);
}
function saffronTouchdown(who){
  const body = carHit(who); // already back in the measured normal-car model
  for(const a of racers()){
    const target = a.me ? "me" : a.obj;
    if(target === who || noContact(target)) continue;
    if(hitPolygonsOverlap(body.points, carHit(target).points)) wreckRacer(target, who);
  }
  const p = ultPos(who);
  puffFx(p.x, p.y); noise(.18, .2);
}
function tickSaffron(who, dt){
  const o = who === "me" ? G : who;
  if(!saffronAirborne(who)) return;
  if(o.dead > 0 || o.finished !== null ||
     (G.finishAt > 0 && (who === "me" ? G.meters : metersOf(who)) >= G.finishAt)){
    clearSaffronState(who); return;
  }
  if(o.saffronPhase === "rise"){
    o.saffronT += dt;
    o.saffronLift = clamp(o.saffronT/MORPH_TIME, 0, 1);
    if(o.saffronLift === 1) o.saffronPhase = "air";
  } else if(o.saffronPhase === "drop"){
    o.saffronT += dt;
    // First reveal the ordinary car aloft, then accelerate down rapidly.
    const k = clamp((o.saffronT - MORPH_TIME*.45)/.26, 0, 1);
    o.saffronLift = 1 - k*k;
    if(k === 1){
      saffronTouchdown(who);
      clearSaffronState(who);
      o.swapGuard = Math.max(o.swapGuard || 0, dt + 1e-6);
    }
  }
}
/* Falling rocks occupy the air; ground blast and ground hazards do not.
   Sweep the rock through this frame's descent to avoid tunnelling at low FPS. */
function interceptSaffronMeteor(rock, previousAlt){
  for(const a of racers()){
    const who = a.me ? "me" : a.obj;
    if(!saffronDragonActive(who) || a.out) continue;
    const altitude = saffronAltitude(who), alt = rockAlt(rock);
    const depth = racerDims(who).h*.18;
    if(alt > altitude + depth || previousAlt < altitude - depth) continue;
    const y = racerY(who) - altitude;
    const hull = carHit(who, undefined, y);
    const ry = clamp(y, rock.y - previousAlt, rock.y - alt);
    const p = nearestOnCar(hull, rock.x, ry);
    if(Math.hypot(p.x-rock.x, p.y-ry) > rock.mr) continue;
    smashFx(rock.x, ry, rock.mr, "#FF8A24", "saffron");
    return true;
  }
  return false;
}

/* ---------------- Conditions -------------------------------------
   One derivation, read straight off the state that owns each Condition, so
   there is no second copy to fall out of step with slowT, blind, slipT, the
   boost or the invulnerability timer. Both the badges beside a rival car and
   the badges in a HUD corner ask this and nothing else.

   The order is CONDITIONS' own key order, so a stack of badges never
   reshuffles between frames. A finished racer is out of play and returns
   none: it is not racing, so it has no Conditions to show. */
function conditionOn(who, id){
  const me = who === "me";
  const o = me ? G : who;
  if(!o) return false;
  if(id === "invulnerable") return invulnerableWho(who);
  if(id === "boosted"){
    /* Anything that makes this car faster, whatever put it there: the boost
       meter, a boost can, a running ultimate, or the shove a rear-end gave it. */
    return !!o.boosting || !!o.ultOn || (o.canT || 0) > 0 ||
           (me ? G.shuntT : o.shuntT || 0) > 0;
  }
  if(id === "slowed") return (me ? G.slowT : o.slow || 0) > 0;
  /* Two things put a screen out of use, and the Condition is the same
     Condition either way: puddle water on the glass, or the white a Neela
     transformation or teleport puts over the view it belongs to. Derived from
     both timers rather than from a flag somebody has to remember to set. */
  if(id === "obscured") return (o.blind || 0) > 0 || (o.whiteT || 0) > 0;
  if(id === "skidded") return (me ? G.slipT : o.slip || 0) > 0;
  /* The badge and the lock are the same question asked twice, so they are
     answered in one place: a Condition that has lapsed cannot leave a driver
     without controls, and a driver without controls cannot be missing a
     badge. */
  if(id === "mindControlled") return controlsLocked(who);
  return false;
}
function activeConditions(who){
  const out = [];
  if(!who) return out;
  if(who === "me" ? finishedMe() : finishedCar(who)) return out;
  for(let i=0;i<CONDITION_IDS.length;i++){
    const id = CONDITION_IDS[i];
    if(conditionOn(who, id)) out.push(id);
  }
  return out;
}

/* every car on the road, described the same way */
function racers(){
  const list = [{ me:true, obj:null, lane:G.lane, y:playerY, car:G.car,
                  out:G.dead > 0 || finishedMe() }];
  for(let i=0;i<G.rivals.length;i++){
    const R = G.rivals[i];
    list.push({ me:false, obj:R, lane:R.lane, y:R.y, car:R.car,
                out:R.dead > 0 || finishedCar(R) });
  }
  return list;
}
function carAt(lane, y, skip){
  if(noContact(skip)) return null;             /* out of reach: meets nobody */
  const box = carHit(skip, laneCX(lane), y, 0);
  const all = racers();
  for(let i=0;i<all.length;i++){
    const a = all[i];
    if(a.out || a.obj === skip || (skip === "me" && a.me)) continue;
    if(noContact(a.me ? "me" : a.obj)) continue;                /* and nobody meets it */
    if(a.lane === lane && hitPolygonsOverlap(box.points, carHit(a.me ? "me" : a.obj).points)) return a;
  }
  return null;
}

/* Rear contact uses the actual moving bodies, never the target lane labels.
   Lane-barging above deliberately projects into the requested lane. */
function rearContact(who){
  if(noContact(who)) return null;
  const box=carHit(who), all=racers();
  let front=null;
  for(let i=0;i<all.length;i++){
    const a=all[i], other=a.me ? "me" : a.obj;
    if(other === who || noContact(other) || a.y >= box.y) continue;
    if(hitPolygonsOverlap(box.points,carHit(other).points) && (!front || a.y>front.y)) front=a;
  }
  return front;
}

/* ---------------- the five car-specific ultimates ----------------
   Every car runs the same ultimate: eighty-five seconds to charge, fifteen
   seconds long, double pace, and the lifecycle in startUlt/tickUlt/endUlt
   below is shared by all six. Five of them add something on top of it, and
   only while that shared lifecycle is running. Saffron is the one left with the
   plain fifteen seconds and nothing else.

   These are the predicates that say which car is which, and they are the only
   place in the game a racer's `car` is compared to a name. Everything else -
   contact, hazards, the hull, the sprite - asks one of the questions built on
   them, so there is no second copy of the rule anywhere to drift out of step.

   Four of the five are collision priority, applied at the consequence: none of
   them is the Invulnerable Condition and none of them goes through
   noContact(). An ulting Flann still has to physically meet a racer or a
   hazard in order to break it, an ulting Neela still has to physically meet a
   racer in order to trade places with it, an ulting Verdant is invisible but
   still physically there to be run into, and the puddle must still get
   through to all of them.

   Rhosyn's is the one that is not. It is not a protection either: a racer in
   Aero-Glow has left the shared road altogether, so there is nothing at its
   canonical position for the road to meet in either direction - which is why
   it is the one car-specific state that noContact() reads. See
   rhosynElsewhere() below. */
function flannCar(who){
  const o = who === "me" ? G : who;
  return !!o && o.car === "flann";
}
function neelaCar(who){
  const o = who === "me" ? G : who;
  return !!o && o.car === "neela";
}
function lolantheCar(who){
  const o = who === "me" ? G : who;
  return !!o && o.car === "lolanthe";
}
function verdantCar(who){
  const o = who === "me" ? G : who;
  return !!o && o.car === "verdant";
}
function rhosynCar(who){
  const o = who === "me" ? G : who;
  return !!o && o.car === "rhosyn";
}
/* Flann catches fire and becomes a ram, so solid things it hits come apart
   instead of it - and so do racers. */
function flannUltActive(who){
  const o = who === "me" ? G : who;
  return flannCar(who) && !!o.ultOn;
}
/* Neela's, and the one distinction that matters most in this file.

   neelaUltActive() is "the fifteen seconds are running", which is what buys
   the solid-hazard priority and keeps it for the whole of the ultimate.

   neelaFormActive() is "the alternate body is the one on the road", which is
   what buys the one swap and what the renderer and the hull read.

   They are the same thing until the first racer Neela touches, and different
   from then until the meter runs out. Anything that conflates them gives Neela
   either a hazard privilege it has lost or a second swap it never had. */
function neelaUltActive(who){
  const o = who === "me" ? G : who;
  return neelaCar(who) && !!o.ultOn;
}
function neelaFormActive(who){
  const o = who === "me" ? G : who;
  return neelaUltActive(who) && !!o.neelaForm;
}
/* Lolanthe's. The aura, the forced lane change and the note above the car all
   last exactly as long as the shared fifteen seconds and not a frame longer -
   there is no second clock and no form to spend, so this is the whole of the
   question. */
function lolantheUltActive(who){
  const o = who === "me" ? G : who;
  return lolantheCar(who) && !!o.ultOn;
}
/* And Verdant's. Invisibility, the directional defence and the immunity to
   Mind Control are all this one predicate, for the whole of the fifteen
   seconds - including the split second the car is revealed by a hit, which is
   a cosmetic timer and never this. */
function verdantUltActive(who){
  const o = who === "me" ? G : who;
  return verdantCar(who) && !!o.ultOn;
}
/* And Rhosyn's. The ultimate running is what the meter, the pace and the HUD
   read; where the driver is being shown while it runs is the phase below, and
   the two are deliberately different questions. The phase outlives the
   ultimate by the length of one white transition on the way back out, which is
   exactly the stretch in which the car is neither in Aero-Glow nor yet back on
   the road. */
function rhosynUltActive(who){
  const o = who === "me" ? G : who;
  return rhosynCar(who) && !!o.ultOn;
}
/* ---- the one question the rest of the game asks about Aero-Glow ----
   Whether this racer has left the shared road. True from the instant the
   ultimate is fired, through the fifteen seconds, and until the return
   transition has actually put the car back down - so there is exactly one
   answer, and noContact(), the hazards, the pickups, the targeting and the
   renderer all read it rather than each deciding for themselves.

   It is the whole of the isolation and it is symmetric by construction: a
   racer that cannot be reached also reaches nobody, because every contact
   test in this file asks noContact() of both sides.

   It says nothing at all about where the racer is. Its lane, its lateral x,
   its distance, its speed, its ranking, its finish progress and the biome it
   is driving through are the canonical ones the shared simulation is still
   advancing, exactly as they would be without the ultimate. Aero-Glow is a
   view and an isolation over that one racer, never a second race. */
function rhosynElsewhere(who){
  const o = who === "me" ? G : who;
  return !!o && rhosynCar(who) && !!o.aeroPhase && o.aeroPhase !== "off";
}
/* Whether this racer's own view should be drawing Aero-Glow instead of the
   shared world. It changes hands under full white in both directions, which is
   why it is not simply rhosynElsewhere(): the car is already unreachable while
   its driver is still looking at the shared road, and still looking at the
   void for the moment after the meter has run out. */
function aeroGlowViewActive(who){
  const o = who === "me" ? G : who;
  return !!o && rhosynCar(who) && (o.aeroPhase === "glow" || o.aeroPhase === "out");
}
/* How far out of the shared road the body is, 0 to 1, for the renderer to
   read. Cosmetic throughout - the isolation above is the rule, and this is
   only what the rest of the field watches it happen through. */
function aeroHideK(who){
  const o = who === "me" ? G : who;
  return o ? clamp(o.aeroHide || 0, 0, 1) : 0;
}
/* Whether this racer's ultimate lets it clear Seren's solid road hazards - the
   tumbleweed and the meteor - rather than being stopped by them. Water is not
   solid and is deliberately not here. One question, asked by the player's
   hazards in this file and the rivals' in race.js. */
function clearsSolidHazards(who){
  return flannUltActive(who) || neelaUltActive(who) ||
         lolantheUltActive(who) || verdantUltActive(who);
}
/* And whether this racer is a Neela that still has its one exchange to spend.
   The form has to be up, the swap has to be unspent, and the contact must not
   be one already dealt with in this step. */
function neelaCanSwap(who){
  const o = who === "me" ? G : who;
  return neelaFormActive(who) && !o.neelaSwapped && !(o.swapGuard > 0);
}
function swapGuarded(who){
  const o = who === "me" ? G : who;
  return !!o && o.swapGuard > 0;
}

/* ================================================================
   WHERE A RACER ACTUALLY IS
   ================================================================
   Player one has no race `y` of its own. It is held at playerY while the road
   runs past underneath, and every rival's position is a screen offset from
   that camera which metersOf() turns into a distance along the road. So there
   is no pair of coordinates that means the same thing for both kinds of racer,
   and anything that reads one racer's place in order to put another racer
   there has to go through here.

   A pose is the honest answer: how far down the road, which lane, and where
   across that lane. It does not move when the camera does, so it is still
   correct several seconds and several hundred metres later - which is exactly
   what Neela's swap needs, because the pose it hands back was taken before the
   ultimate started. */
function racerWorldPose(who){
  const me = who === "me";
  const o = me ? G : who;
  if(!o) return null;
  return { m: me ? G.meters : metersOf(o), lane:o.lane, x:o.x };
}

/* Move the whole world past player one by dy screen pixels.

   This is the one place player one's position can change, and it is not a
   special case so much as a single frame of scrolling done in one step: a
   frame adds d to G.scroll, d*0.075 to G.meters and d to the y of every object
   on the road, and so does this. Which is why nothing that was not asked to
   move changes place: every rival, hazard, bubble, slick, seeker, spark,
   building, trail node and the track seam all travel with the metre count, so
   metersOf() gives every one of them exactly the answer it gave before. Marks
   that are already distances - the finish line, a finisher's parking mark -
   are absolute and are not touched at all. */
function rebaseWorld(dy){
  if(!dy) return;
  G.scroll += dy;
  G.meters += dy*0.075;
  for(let i=0;i<G.rivals.length;i++){
    G.rivals[i].y += dy;
    shiftTrail(G.rivals[i], dy);
  }
  shiftTrail(G, dy);
  for(let s=0;s<2;s++){
    const a = G.build[s];
    for(let i=0;i<a.length;i++) a[i].y += dy;
  }
  for(let i=0;i<G.props.length;i++) G.props[i].y += dy;
  for(let i=0;i<G.walks.length;i++) G.walks[i].y += dy;
  for(let i=0;i<G.traps.length;i++) G.traps[i].y += dy;
  for(let i=0;i<G.boxes.length;i++) G.boxes[i].y += dy;
  for(let i=0;i<G.slicks.length;i++) G.slicks[i].y += dy;
  for(let i=0;i<G.missiles.length;i++) G.missiles[i].y += dy;
  for(let i=0;i<G.fx.length;i++) G.fx[i].y += dy;
  if(G.seam !== null) G.seam += dy;
}

/* Put a racer on a pose. A rival is simply placed: its y is whatever screen
   offset puts it at that distance right now. Player one cannot be placed, so
   the world is moved instead - handled here and nowhere else, so nothing that
   uses a pose has to know that the two kinds of racer are stored differently. */
function teleportRacerToPose(who, pose){
  if(!pose) return;
  if(who === "me"){
    rebaseWorld((pose.m - G.meters)/0.075);
    G.lane = pose.lane;
    G.x = pose.x;
  } else if(who){
    who.y = playerY - (pose.m - G.meters)/0.075;
    who.lane = pose.lane;
    who.x = pose.x;
  }
}

/* ================================================================
   NEELA'S ULTIMATE
   ================================================================
   The shared lifecycle starts and ends it; everything here is what Neela does
   inside those fifteen seconds. All of it is advanced from update code and
   only read by the renderer, so drawing the same frame twice draws the same
   frame. */

/* ---- the white transition ----
   Belongs to one racer and covers one view: the racer's own. In local play
   every human is drawn their own column, so whiting out the person who was
   swapped must not touch the person in the next seat. A bot has no view to
   cover, but it still carries the timer, because the Condition beside its car
   is derived from the same state and a bot mid-transformation is Obscured like
   anybody else. */
function startWhiteout(who){
  const o = who === "me" ? G : who;
  if(o) o.whiteT = WHITEOUT_TIME;
}
function whiteoutActive(who){
  const o = who === "me" ? G : who;
  return !!o && (o.whiteT || 0) > 0;
}
/* ---- the flash on the body ----
   Cosmetic, and generic: it is played on whichever car was transformed or
   teleported, and the victim of a swap can be any of the six. It changes no
   hitbox and no race state. */
function startMorph(who){
  const o = who === "me" ? G : who;
  if(o) o.morphT = MORPH_TIME;
}
/* How white that car is right now, 0 to 1, for the renderer to read. */
function morphFlash(who){
  const o = who === "me" ? G : who;
  if(!o || !(o.morphT > 0)) return 0;
  return clamp(o.morphT/MORPH_TIME, 0, 1);
}

/* ---- the alternate form ----
   Entering it is the whole of the activation sequence past the shared
   lifecycle: the pose is taken first, before anything about the racer changes,
   because that pose is what a swapped racer is sent back to a quarter of a
   minute later. Nothing here pauses the race, freezes the car or touches the
   controls - the racer drives itself through the whole of it, at the ordinary
   double pace, as a person or as a bot. */
function beginNeelaForm(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.neelaOrigin = racerWorldPose(who);
  o.neelaForm = true;
  o.neelaSwapped = false;
  o.swapGuard = 0;
  o.trailGap = 0;
  startWhiteout(who);
  startMorph(who);
}
/* Leaving it with the flash: the meter ran out, or a racer was just swapped.
   New trail stops here; what is already behind the car is in the world and
   fades where it was laid. */
function leaveNeelaForm(who){
  const o = who === "me" ? G : who;
  if(!o || !o.neelaForm) return;
  o.neelaForm = false;
  startMorph(who);
}
/* And leaving it without one, because the car was wrecked or has crossed the
   line. Called before the ultimate is ended in both cases, so endUlt() finds
   nothing left to flash. The trail is again left to fade on its own. */
function clearNeelaState(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.neelaForm = false; o.neelaOrigin = null; o.neelaSwapped = false;
  o.swapGuard = 0; o.whiteT = 0; o.morphT = 0; o.trailGap = 0;
}

/* ---- the swap ----
   One exchange per ultimate, and only while the alternate form is up. Neela
   takes the place the other racer was standing in at the instant of contact,
   and that racer takes the place Neela fired the ultimate from. Neither is
   destroyed; the ultimate is not cut short and its meter is not reset.

   Both poses are read before anything moves. Both are absolute, so the order
   the two teleports are applied in cannot change where either racer lands -
   moving player one moves the world, and a pose in metres does not care. */
function neelaSwap(mover, other){
  const m = mover === "me" ? G : mover;
  const v = other === "me" ? G : other;
  if(!m || !v) return;
  const hit = racerWorldPose(other);
  const origin = m.neelaOrigin || racerWorldPose(mover);
  m.neelaSwapped = true;
  m.swapGuard = NEELA_SWAP_GUARD;
  v.swapGuard = NEELA_SWAP_GUARD;
  leaveNeelaForm(mover);                 /* back to the car, and the flash */
  startWhiteout(mover);
  startWhiteout(other);
  startMorph(other);
  swapFx(mover); swapFx(other);           /* sparks where each of them left */
  teleportRacerToPose(mover, hit);
  teleportRacerToPose(other, origin);
  swapFx(mover); swapFx(other);           /* and where each of them arrived */
  G.shake = Math.max(G.shake, 10);
  tone(880, .18, "sine", .09);
  later(function(){ tone(1320, .22, "sine", .07); }, 90);
}
/* White sparks where a car left and where it arrived, so the exchange reads as
   two events on the road rather than one car blinking out. */
function swapFx(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  const x = who === "me" ? G.x : o.x, y = who === "me" ? playerY : o.y;
  const d = racerDims(who);
  for(let i=0;i<16;i++){
    const a = (i/16)*6.2832;
    addFx(x + Math.cos(a)*d.w*0.45, y + Math.sin(a)*d.h*0.30,
          Math.cos(a)*190, Math.sin(a)*190, rand(.25,.55), rand(2,5),
          i % 2 ? "#FFFFFF" : "#8FD8FF");
  }
}
/* Which of two racers in contact is the one that trades places, or null for
   the ordinary rules. Two of them cancel, exactly as two ramming Flanns do:
   neither can take the other's place, so the contact falls back to the shunt
   and the barge like any other pair. */
function swapMover(a, b){
  const sa = neelaCanSwap(a), sb = neelaCanSwap(b);
  if(sa === sb) return null;
  return sa ? a : b;
}

/* ---- the long trail ----
   Nodes are world positions with an age, dropped behind the alternate form as
   it drives and scrolled with the road like everything else on it. Sampled by
   distance rather than per frame, so the line is as smooth through a fast lane
   change as it is down a straight, and capped so it can never grow without
   bound. */
function shiftTrail(o, dy){
  const t = o && o.trail;
  if(!t) return;
  for(let i=0;i<t.length;i++) t[i].y += dy;
}
function addTrailNode(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  const at = racerTailPoint(who);
  if(!at) return;
  if(!o.trail) o.trail = [];
  o.trail.push({ x:at.x, y:at.y, life:NEELA_TRAIL_LIFE, max:NEELA_TRAIL_LIFE });
  while(o.trail.length > NEELA_TRAIL_MAX) o.trail.shift();
}
/* One racer's trail, one frame: everything already laid scrolls and ages, and
   a new node is dropped only while the alternate form is actually up. Ageing
   is unconditional, which is what lets a trail finish fading after the form
   has ended, after a swap and after a wreck. */
function updateTrail(who, dt, d){
  const o = who === "me" ? G : who;
  if(!o) return;
  const t = o.trail;
  if(t && t.length){
    for(let i=t.length-1;i>=0;i--){
      t[i].y += d;
      t[i].life -= dt;
      if(t[i].life <= 0) t.splice(i, 1);
    }
  }
  if(!neelaFormActive(who) || (who === "me" ? G.dead > 0 : o.dead > 0)){
    o.trailGap = 0;
    return;
  }
  /* How far this car has travelled over the road since the last node: its own
     pace against the road's, which is the distance the trail has to cover. */
  const own = who === "me" ? G.speed*dt : (o.abs || 0)*dt;
  o.trailGap = (o.trailGap || 0) + Math.abs(own);
  if(!t || !t.length || o.trailGap >= NEELA_TRAIL_GAP){
    o.trailGap = 0;
    addTrailNode(who);
  }
}
/* ================================================================
   LOLANTHE'S ULTIMATE
   ================================================================
   The shared lifecycle starts and ends it; everything here is what Lolanthe
   does inside those fifteen seconds. All of it is advanced from update code
   and only read by the renderer, so drawing the same frame twice draws the
   same frame.

   Two things happen to every racer the aura reaches. It is Mind Controlled -
   a real debuff, with a badge, that takes its driver's controls away for three
   seconds - and, if it is standing in Lolanthe's own lane, it is pushed out of
   it. The push is Lolanthe working the victim's steering, not the victim
   driving, which is why it has a path of its own below and ignores both the
   control lock and a Skidded car's reversed steering. */

/* Where a racer is, in the master frame every racer is stored against. Player
   one is held at playerY while the road runs past underneath, so this is the
   one answer both kinds of racer can be asked for - and it does not depend on
   which split-screen column happens to be rendering. */
function racerY(who){ return who === "me" ? playerY : (who ? who.y : playerY); }
function racerLane(who){ const o = who === "me" ? G : who; return o ? o.lane : 1; }

/* Whether this racer's driver may issue commands at all. One question, asked
   by the player's steering, the pad's, the local seats', the bots' think-tick
   and every action any of them can take - so no input surface can quietly
   bypass the lock by being the one that forgot to ask.

   It is deliberately not a freeze: physics, the road, timed effects, the wreck
   lifecycle and a running ultimate's own clock all carry on. What stops is the
   driver, not the car. */
function controlsLocked(who){
  const o = who === "me" ? G : who;
  return !!o && (o.mindT || 0) > 0;
}

/* How far Lolanthe reaches, in road pixels. Measured in car lengths off the
   shared car box, so it is the same stretch of road on a phone, on a desktop
   and in one column of a four-way split rather than a number tuned for one
   viewport. */
function mindRange(){ return carH*MIND_AURA_LENGTHS; }

/* Whether Lolanthe may take this racer at all. Itself, a wreck, a finisher and
   anything refusing debuffs are all out, and so is an ulting Verdant for the
   whole of its ultimate - Lolanthe cannot command a target it cannot see, and
   the split second a collision reveals Verdant does not change that. */
function mindTakes(by, target){
  if(!target || target === by) return false;
  if(refusesDebuffs(target)) return false;
  if(verdantUltActive(target)) return false;
  return true;
}
/* Applying it. Set to three seconds, never added to: a racer held in the aura
   has its timer put back every frame and so stays controlled for as long as it
   is exposed and for three seconds after the last application. The entrance
   animation belongs to the inactive-to-active transition alone, so a timer
   that is merely being reset does not replay it. */
function applyMindControl(target){
  const o = target === "me" ? G : target;
  if(!o) return false;
  const fresh = !((o.mindT || 0) > 0);
  o.mindT = MIND_CONTROL_TIME;
  if(fresh){
    o.mindPop = MIND_POP;
    o.mindOut = 0;
    /* One coin toss per application, so a racer pushed out of the middle lane
       does not flicker between the two doors from frame to frame. */
    o.mindSide = Math.random() < 0.5 ? -1 : 1;
    /* The controls are gone, so anything the driver was holding down goes with
       them: a car must not keep burning boost because the button happened to
       be held at the moment it was taken. */
    o.boosting = false;
    if(target === "me"){ G.keyBoost = false; G.ptrBoost = false; G.padBoost = false; }
    else o.wantBoost = false;
  }
  return fresh;
}
/* One racer's Mind Control clock, one frame. The exit animation is started
   where the timer runs out rather than where the badge is drawn, so it plays
   once and from update code. */
function tickMindControl(who, dt){
  const o = who === "me" ? G : who;
  if(!o) return;
  if(o.mindPop > 0) o.mindPop = Math.max(0, o.mindPop - dt);
  if(o.mindOut > 0) o.mindOut = Math.max(0, o.mindOut - dt);
  if((o.mindT || 0) > 0){
    o.mindT = Math.max(0, o.mindT - dt);
    if(o.mindT === 0){ o.mindOut = MIND_POP; o.mindPop = 0; }
  }
}

/* ---- the forced lane change ----
   Not steering. This is Lolanthe working somebody else's car, so it goes
   nowhere near move() or rivalLaneTo(): it ignores the control lock it would
   otherwise trip over, and it ignores a Skidded car's reversed steering,
   because neither of those is a fact about the car - they are facts about the
   driver, and the driver is not the one doing this.

   From an outer lane there is one door and the victim takes it. From the
   middle it takes whichever the coin toss picked, and occupancy is not a
   reason to cancel: whatever is already in that lane is met through the
   ordinary barge, so the push can shove, wreck, ram or be swapped away with
   exactly the consequences any other lane change would have had. The victim is
   the one arriving, so it is the victim that bumpTarget is told did it - a
   crash this causes belongs to the collision system and never to a Lolanthe
   ram rule Lolanthe does not have.

   The logical lane changes at once and the car's x is left to the existing
   lateral interpolation, so the model slides across rather than teleporting. */
function mindShove(victim){
  const o = victim === "me" ? G : victim;
  if(!o || refusesDebuffs(victim)) return "none";
  const lane = o.lane;
  const dir = lane === 0 ? 1 : (lane === 2 ? -1 : (o.mindSide || 1));
  const to = clamp(lane + dir, 0, 2);
  if(to === lane) return "none";
  const sitting = carAt(to, racerY(victim), victim);
  if(sitting && laneChangeDied(bumpTarget(sitting, dir, victim))) return "stopped";
  if(victim === "me") G.lane = to;
  else { o.lane = to; o.changeT = 0.7; }
  return "moved";
}

/* One frame of one ulting Lolanthe's aura over the whole field. Every other
   racer is measured against it in the master frame, so the answer is the same
   whichever column is being drawn and whoever is driving. Lane decides only
   whether the push happens; the aura itself reaches all three. */
function lolantheAura(who){
  if(!lolantheUltActive(who)) return;
  const reach = mindRange(), y = racerY(who), lane = racerLane(who);
  const all = racers();
  for(let i=0;i<all.length;i++){
    const a = all[i];
    const t = a.me ? "me" : a.obj;
    if(a.out || !mindTakes(who, t)) continue;
    if(Math.abs(a.y - y) > reach) continue;
    applyMindControl(t);
    if(a.lane === lane) mindShove(t);
  }
}
/* Every Lolanthe on the road, once a frame, from update code. The aura is a
   question about where everybody is standing rather than about how much time
   has passed, so it takes no dt: the three seconds it hands out are counted by
   tickMindControl() on the racer that received them. */
function lolantheAuras(){
  lolantheAura("me");
  for(let i=0;i<G.rivals.length;i++) lolantheAura(G.rivals[i]);
}
/* Between races, on a wreck and at the end of an ultimate: nothing of a
   Lolanthe's note may survive into the next one. */
function clearLolantheState(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.queenPop = 0; o.queenOut = 0;
}

/* ================================================================
   VERDANT'S ULTIMATE
   ================================================================
   Fifteen seconds in which the car is still completely there - same hitbox,
   same contact tests, same place in the race - and simply cannot be seen.
   Everything below is either cosmetic state or collision priority; none of it
   touches noContact(), the hull or the race order.

   `verdantHide` is how far into hiding the car is, 0 to 1. Its own driver's
   view keeps half of it so they can still find their car; every other view
   loses it entirely. The fade is a quarter of a second in each direction, so
   the car dissolves rather than blinking out. */
function verdantHideK(who){
  const o = who === "me" ? G : who;
  return o ? clamp(o.verdantHide || 0, 0, 1) : 0;
}
/* What a view should draw this racer at. The owner test is the existing
   split-screen viewer identity, so one player's column answers for that player
   and nobody else's - and in a single-view game the one view is player one's,
   exactly as it always was. Visual only: it makes Verdant no easier and no
   harder to hit, and no easier to find. */
/* Two cars answer this with something other than 1, and they answer it for
   opposite reasons. Verdant is hidden and completely present; Rhosyn is
   absent, and the fade is only the rest of the field watching it go. Rhosyn's
   is not per-viewer: a car that has left the road has left everybody's road,
   and its own driver is being drawn by drawAeroGlowWorld() rather than by the
   shared renderer, so there is no owner's copy of it in a normal view to keep
   half of. */
function racerViewAlpha(who, viewer){
  if(rhosynCar(who)) return 1 - aeroHideK(who);
  if(!verdantCar(who)) return 1;
  const k = verdantHideK(who);
  if(k <= 0) return 1;
  const own = (viewer === undefined ? VOWN : viewer) === who;
  return 1 + ((own ? VERDANT_OWN_ALPHA : 0) - 1)*k;
}
/* The split second of full visibility a racer buys by running into it. It is
   cosmetic and nothing else: the ultimate is not cut short, the meter is not
   touched, and the immunity to Lolanthe's aura holds right through it. */
function verdantReveal(who){
  const o = who === "me" ? G : who;
  if(!o || !verdantUltActive(who)) return;
  o.verdantRevealT = VERDANT_REVEAL;
  o.verdantHide = 0;
}
/* One racer's fade, one frame. Hidden while the ultimate is running and the
   reveal is not, visible otherwise, and the ramp between them is the only
   thing that ever writes verdantHide. */
function tickVerdant(who, dt){
  const o = who === "me" ? G : who;
  if(!o) return;
  if(o.verdantRevealT > 0) o.verdantRevealT = Math.max(0, o.verdantRevealT - dt);
  const want = (verdantUltActive(who) && !(o.verdantRevealT > 0)) ? 1 : 0;
  const step = VERDANT_FADE > 0 ? dt/VERDANT_FADE : 1;
  const k = o.verdantHide || 0;
  o.verdantHide = want > k ? Math.min(want, k + step) : Math.max(want, k - step);
}
/* A wreck takes the ultimate with it, so it takes the hiding too - there is no
   ghost of a car left dissolving through somebody else's wreck animation. */
function clearVerdantState(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.verdantHide = 0; o.verdantRevealT = 0;
}

/* ================================================================
   RHOSYN'S ULTIMATE  -  AERO-GLOW
   ================================================================
   Fifteen seconds in which Rhosyn's own driver is shown a different world -
   a black and pink void with nobody else in it - while the one canonical race
   underneath carries on exactly as it would have done.

   The invariant this whole section exists to keep is that there is never a
   second race. Nothing here teleports the racer, freezes it, saves a pose to
   put it back on, advances a distance counter of its own or touches G.biome.
   The racer goes on being updated by the same shared simulation as everybody
   else: it steers, it covers ground at the shared ultimate's double pace, it
   crosses seams, it changes biome, it moves up and down the order and it can
   cross the finish line. Two things and only two things change while the phase
   below is running - which world its own view draws, and whether the shared
   road has a body at its position to interact with.

   Which is why, when the fifteen seconds are up, there is nothing to correct:
   the car is already exactly where the race put it, in whatever biome the race
   has actually reached, and the renderer simply starts drawing that again.

   The phase is a small explicit state carried by every racer, exactly as
   Neela's, Lolanthe's and Verdant's are, and it is advanced from the ordinary
   update loop so a paused race pauses it:

     "off"    on the shared road, like anybody else
     "in"     leaving: unreachable already, still drawn on the shared road
     "glow"   away: its own view is Aero-Glow, every other view has no car
     "out"    returning: still away, the shared road is fading back in

   `aeroT` is the transition clock and runs only in "in" and "out". `aeroHide`
   is the cosmetic fade the rest of the field watches it leave and arrive
   through, derived every frame from the phase exactly as Verdant's is. */

/* Firing it. The shared lifecycle in startUlt() is already running by here;
   this is the departure and nothing else. Nothing about where the racer is is
   read, saved or changed - there is deliberately no pose taken, because
   nothing is ever going to be put back on one. */
function beginAeroGlow(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.aeroPhase = "in";
  o.aeroT = AERO_SHIFT;
  startWhiteout(who);                          /* the owner's screen */
  startMorph(who);                             /* and the car itself, for everybody */
}
/* The meter ran out. The return is started here rather than in the phase tick
   so it is the end of the ultimate that begins it, which is what keeps the two
   clocks from drifting: the fifteen seconds are the shared ones and this is
   what happens when they are spent. A racer that was wrecked or has finished
   has had its phase cleared before endUlt() is reached, so this does not fire
   for it - the same order clearNeelaState() is called in. */
function beginAeroReturn(who){
  const o = who === "me" ? G : who;
  if(!o || !rhosynElsewhere(who) || o.aeroPhase === "out") return;
  o.aeroPhase = "out";
  o.aeroT = AERO_SHIFT;
  startWhiteout(who);
  startMorph(who);
}
/* Actually back on the shared road, which is the only moment the two seconds
   of protection may start. It is the existing Invulnerable Condition and
   nothing else - no second shield, no Rhosyn-only immunity and no hazard-by-
   hazard exception - and it is taken as a maximum, so a longer protection the
   racer already had is never shortened to two seconds by coming home. */
function rejoinSharedRoad(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.invuln = Math.max(o.invuln || 0, INVULNERABLE_TIME);
}
/* One racer's phase, one frame. The transition clock first, then the fade,
   which is derived from the phase rather than stored alongside it - so the
   only thing that ever writes aeroHide is this line, and a frame drawn twice
   draws the same frame. */
function tickAeroGlow(who, dt){
  const o = who === "me" ? G : who;
  if(!o) return;
  if(o.aeroPhase === "in" || o.aeroPhase === "out"){
    o.aeroT = Math.max(0, (o.aeroT || 0) - dt);
    if(o.aeroT === 0){
      if(o.aeroPhase === "in") o.aeroPhase = "glow";
      else { o.aeroPhase = "off"; rejoinSharedRoad(who); }
    }
  }
  const want = (o.aeroPhase === "in" || o.aeroPhase === "glow") ? 1 : 0;
  const step = AERO_FADE > 0 ? dt/AERO_FADE : 1;
  const k = o.aeroHide || 0;
  o.aeroHide = want > k ? Math.min(want, k + step) : Math.max(want, k - step);
}
/* Between races, on a wreck and at the flag: the car is put straight back on
   the shared road with no transition and no protection, because none of those
   is a return from Aero-Glow. Called before the ultimate is ended in every
   one of those cases, so endUlt() finds no phase left to send home - and it is
   what stops a renderer being left in the void after the race has ended. */
function clearAeroGlowState(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  o.aeroPhase = "off"; o.aeroT = 0; o.aeroHide = 0;
}

/* ---- what a driver can actually see ----
   Physically touchable and visually detectable are two different questions,
   and two racers disagree about them in opposite directions. An ulting Verdant
   is present and invisible; a Rhosyn in Aero-Glow is neither there nor to be
   seen, and is here because a driver must not be shown a marker, a badge or a
   gap reading for a car that has left the road.

   Contact, hazards and the hull go on asking noContact(); anything that is a
   driver reading the road - a bot picking a target, covering a lane or judging
   what is in the one beside it - asks this instead. A bot may still run into
   what it cannot see, exactly as a person would; there is simply nothing to
   run into where Rhosyn is concerned. */
function racerDetectable(who){
  return !verdantUltActive(who) && !rhosynElsewhere(who);
}
/* carAt(), but only for cars a driver could actually see. */
function carSeenAt(lane, y, skip){
  const a = carAt(lane, y, skip);
  if(!a) return null;
  return racerDetectable(a.me ? "me" : a.obj) ? a : null;
}

/* ---- the contact priority ----
   Every physical racer contact with an ulting Verdant on one side of it is
   settled here, and both of the places contact is detected - the rear-end and
   the lane barge - ask this first, so the two can never disagree about what a
   Verdant collision means.

   In order:

     1. an ulting Verdant and an ulting Flann destroy each other, whichever of
        them arrived, and both meters end at exactly nothing
     2. an alternate-form Neela meeting an ulting Verdant is destroyed, its
        meter emptied, with no exchange and no teleport, and Verdant reveals
     3. anything else that runs into an ulting Verdant is destroyed and
        Verdant reveals

   And nothing else. A Verdant that does the running into gets the ordinary
   rules, because its power is a defence and not a ram: it returns null and the
   shunt, the barge and the rest carry on underneath.

   Two ulting Verdants cancel, exactly as two ramming Flanns do.

   The answer names who was destroyed, because the lane barge has to know
   whether the car that asked for the lane is still there to take it. */
function specialContact(by, victim){
  const byV = verdantUltActive(by), vicV = verdantUltActive(victim);
  if(byV === vicV) return null;
  const vd = byV ? by : victim;                  /* the ulting Verdant */
  const other = byV ? victim : by;
  if(flannUltActive(other)){ mutualWreck(vd, other); return "both"; }
  if(neelaFormActive(other)){
    wreckRacer(other, vd);
    emptyUlt(other);                             /* exactly nothing, whatever the wreck left */
    verdantReveal(vd);
    return other === by ? "by" : "victim";
  }
  if(other !== by) return null;                  /* Verdant arrived: no offensive kill */
  wreckRacer(other, vd);                         /* ordinary wreck terms for the meter */
  verdantReveal(vd);
  return "by";
}
/* Both racers destroyed by one contact, and neither credited with the other.
   The wrecks run through the existing lifecycle - blame, particles, shake,
   audio - and the meters are emptied afterwards, so no reward or penalty
   sequencing can leave either above nothing. The first wreck cannot make the
   second racer unreachable, because being wrecked is a fact about the racer
   that was wrecked and not about the one still standing. */
function mutualWreck(a, b){
  wreckRacer(a);
  wreckRacer(b);
  emptyUlt(a);
  emptyUlt(b);
}
/* A meter taken to exactly nothing, whether or not an ultimate was running. */
function emptyUlt(who){
  const o = who === "me" ? G : who;
  if(!o) return;
  if(o.ultOn) endUlt(who);
  o.ult = 0;
}

/* Which of two racers in contact wins it outright, or null for the ordinary
   rules. Two ulting Flanns cancel: neither can smash the other, so the contact
   falls back to the shunt and the barge like any other pair. */
function offensiveRam(by, victim){
  return flannUltActive(by) && !flannUltActive(victim);
}
/* One destruction call that does not care which kind of racer it is handed, so
   the ram uses the existing wreck lifecycle - blame, meter penalty and reward,
   particles, shake and audio - rather than growing a second one. */
function wreckRacer(who, by){
  if(who === "me") destroyCar(by);
  else wreckRival(who, by);
}

/* Per-life durability. Only accepted ordinary hazard contacts call this;
   meteor and combat wrecks leave it untouched until the actual respawn. */
function shieldOf(who){ return (who === "me" ? G : who).shield; }
function resetShield(who){
  const o = who === "me" ? G : who;
  o.shield = SHIELD_MAX; o.shieldHitT = 0;
}
function shieldStage(halves){
  if(halves <= 0) return null;
  const bar = Math.min(SHIELD_BARS - 1, Math.ceil(halves/SHIELD_HALVES_PER_BAR) - 1);
  return {bar, fill:shieldBarFill(halves, bar)};
}
function showShieldHit(who){
  if(noContact(who)) return;
  const o = who === "me" ? G : who;
  if(o.shield > 0) o.shieldHitT = SHIELD_HIT_TIME;
}
function shieldBarFill(halves, bar){
  return clamp((halves - bar*SHIELD_HALVES_PER_BAR)/SHIELD_HALVES_PER_BAR, 0, 1);
}
/* True means this hit wrecked the racer; callers skip the debuff and trap
   penalty, since the shared wreck lifecycle already applies its own penalty. */
function hitShield(who){
  if(noContact(who)) return false;
  const o = who === "me" ? G : who;
  if(o.ultOn){ showShieldHit(who); return false; }
  o.shield = Math.max(0, shieldOf(who) - 1);
  if(o.shield > 0){ showShieldHit(who); return false; }
  wreckRacer(who);
  return true;
}

/* Rear contact shunts the front car and slows the following car. */
function rearEnd(who, victim){
  const meB = who === "me";
  const vWho = victim.me ? "me" : victim.obj;
  if(meB ? finishedMe() : finishedCar(who)) return;      /* out of play: no contact */
  if(victim.me ? finishedMe() : finishedCar(victim.obj)) return;
  if(noContact(who) || noContact(vWho)) return;
  /* A contact already dealt with this step - the two bodies a swap has just
     put down - is not a second contact. One step's worth, and no more. */
  if(swapGuarded(who) || swapGuarded(vWho)) return;

  /* An ulting Verdant settles the contact before anything else does, and it
     overrides both the exchange and the ram - see specialContact(). `who` is
     the racer that ran into the back of `victim`, which is the direction the
     asymmetric defence turns on. */
  if(specialContact(who, vWho)) return;

  /* Neela in its alternate form trades places with the first racer it meets,
     and that is the whole of the consequence: nobody is wrecked, nobody is
     slowed, nobody is shunted, and there is no second swap in this ultimate.
     Ahead of the ram on purpose - a Neela and a Flann meeting is an exchange,
     not a kill, because the form is spent by the contact either way. */
  const mover = swapMover(who, vWho);
  if(mover){ neelaSwap(mover, mover === who ? vWho : who); return; }

  /* Directional ram, after Verdant priority and Neela exchange. */
  if(offensiveRam(who, vWho)){ wreckRacer(vWho, who); return; }

  if((meB ? G.bumpCD : who.bumpCD) > 0) return;
  const vy = victim.y;
  /* Far enough back to clear both bodies, whatever size each of them is. */
  const gap = (racerDims(who).h + racerDims(vWho).h)/2*0.98;
  if(meB) G.bumpCD = 0.5; else { who.bumpCD = 0.5; who.y = vy + gap; }

  if(meB) G.slowT = Math.max(G.slowT, BUMP_SLOW*0.7);
  else who.slow = Math.max(who.slow, BUMP_SLOW*0.7);
  if(victim.me) G.shuntT = SHUNT_TIME;                 /* they get shoved along */
  else victim.obj.shuntT = SHUNT_TIME;
  for(let i=0;i<12;i++){
    const a = rand(-2.4, -0.7), sp = rand(60, 200);
    addFx((meB ? G.x : who.x), vy + carH*0.5, Math.cos(a)*sp, Math.sin(a)*sp,
          rand(.25,.5), rand(2,4), i % 2 ? "#FFE8C0" : "#B9BEC6");
  }
  G.shake = Math.max(G.shake, 7);
  noise(.14, .22);
}

/* What the barge actually did, so the caller knows whether the lane change it
   was in the middle of still happens:

   - "none"     nothing could be reached; the lane change is unaffected
   - "moved"    the ordinary barge: shoved across and left labouring
   - "wrecked"  no room left, so the hit wrecked it against the barrier
   - "rammed"   an ulting Flann destroyed it outright and takes the lane
   - "stopped"  the barger wrecked itself on an ulting Flann, and the lane
                change dies with it
   - "swapped"  an alternate-form Neela was involved and the two cars traded
                places; both are elsewhere, so the lane change dies too

   "stopped" and "swapped" stop the caller; everything else leaves the lane to
   the car that asked for it, exactly as it always did. */
function bumpTarget(victim, dir, by){
  const vWho = victim.me ? "me" : victim.obj;
  if(noContact(by) || noContact(vWho)) return "none";
  if(swapGuarded(by) || swapGuarded(vWho)) return "none";

  /* Same priority as the rear-end, out of the same function, so the two ways
     a contact is detected cannot disagree about Verdant. `by` is the racer
     that asked for the lane, which is the one that arrived. A barger that
     destroyed itself has no lane change left to finish; a barger that survived
     and emptied the lane takes it. */
  const vsp = specialContact(by, vWho);
  if(vsp === "both" || vsp === "by") return "stopped";
  if(vsp === "victim") return "rammed";

  /* An alternate-form Neela on either side of the barge trades places instead
     of taking or losing the lane, and both cars are somewhere else by the time
     this returns - so the lane change the caller was in the middle of has
     nothing left to finish. */
  const mover = swapMover(by, vWho);
  if(mover){ neelaSwap(mover, mover === by ? vWho : by); return "swapped"; }

  /* Only the arriving Flann can spend the offensive ram. */
  if(offensiveRam(by, vWho)){
    wreckRacer(vWho, by);
    return "rammed";
  }

  const to = victim.lane + dir;
  let out = "moved";
  if(victim.me){
    if(to < 0 || to > 2){ destroyCar(by); out = "wrecked"; }
    else { G.lane = to; G.slowT = Math.max(G.slowT, BUMP_SLOW); }
  } else {
    if(to < 0 || to > 2){ wreckRival(victim.obj, by); out = "wrecked"; }
    else {
      victim.obj.lane = to;
      victim.obj.x = lerp(victim.obj.x, laneCX(to), 0.35);
      victim.obj.slow = Math.max(victim.obj.slow, BUMP_SLOW);
      victim.obj.changeT = 0.7;
      botBlame(victim.obj, by);
    }
  }
  sideSwipe(victim.obj || { x:G.x, y:playerY, car:G.car });
  return out;
}

function move(dir){
  if(G.state !== "running" || G.dead > 0 || G.finished !== null) return;
  if(controlsLocked("me")) return;               /* somebody else has the wheel */
  if(G.slipT > 0) dir = -dir;                    /* no grip: the steering is reversed */
  const n = clamp(G.lane + dir, 0, 2);
  if(n === G.lane) return;

  /* Barge into the lane you want. If the other car has room it is shoved
     across and left labouring; if it is already against a barrier the hit
     wrecks it instead. Either way the lane is yours - unless what was sitting
     in it was an ulting Flann, in which case the barge wrecked you and there
     is nobody left to finish the lane change. */
  const victim = carAt(n, playerY, "me");
  if(victim && laneChangeDied(bumpTarget(victim, dir, "me"))) return;
  G.lane = n;
}

/* what the bot meant to do, after its steering is reversed */
function rivalSteer(R, lane){
  if(R.slip > 0) lane = clamp(R.lane - (lane - R.lane), 0, 2);
  rivalLaneTo(R, lane);
}

/* Wrecked on an ulting Flann, or traded away by an alternate-form Neela:
   either way there is no lane change left to make. */
function laneChangeDied(out){ return out === "stopped" || out === "swapped"; }

function rivalLaneTo(R, lane){
  const dir = lane > R.lane ? 1 : -1;
  const victim = carAt(lane, R.y, R);
  if(victim && laneChangeDied(bumpTarget(victim, dir, R))) return;
  R.lane = lane;
  R.changeT = 0.7;
}

/* paint and sparks where the two cars trade a lane */
function sideSwipe(R){
  const cx = (G.x + R.x)/2, cy = (playerY + R.y)/2;
  for(let i=0;i<14;i++){
    const a = rand(0, 6.2832), sp = rand(60, 240);
    addFx(cx, cy, Math.cos(a)*sp, Math.sin(a)*sp, rand(.25,.55), rand(2,4),
          i % 2 ? "#FFE8C0" : CARS[R.car].accent);
  }
  G.shake = Math.max(G.shake, 8);
  noise(.16, .25);
}
/* One fixed-duration speed multiplier for every driver and every car. */
function ultOwnerCar(who){ return who === "me" ? G.car : who.car; }
function ultPos(who){
  return who === "me" ? { x:G.x, y:playerY } : { x:who.x, y:who.y };
}
/* seconds left / seconds granted, for the meter */
function ultFrac(who){
  const o = who === "me" ? G : who;
  return o.ultMax > 0 ? clamp(o.ultT/o.ultMax, 0, 1) : 0;
}

function startUlt(who){
  const o = who === "me" ? G : who;
  if(o.ultOn || !ruleOn("ults")) return;
  o.ultOn = true;
  o.ultT = ULT_TIME; o.ultMax = ULT_TIME;
  o.ult = 1;
  const at = ultPos(who);
  ultBurst(ultOwnerCar(who), at.x, at.y);
  /* The shared lifecycle is running by here; this is only what each of the
     cars adds on top of it. Neela's pose is the car's from a moment ago;
     Lolanthe's note is a pop-in and nothing else. Rhosyn starts leaving the
     shared road. Verdant needs nothing: its fade is derived from the ultimate
     every frame rather than started here. */
  if(neelaCar(who)) beginNeelaForm(who);
  if(saffronCar(who)) beginSaffronFlight(who);
  if(lolantheCar(who)){ o.queenPop = QUEEN_POP; o.queenOut = 0; }
  if(rhosynCar(who)) beginAeroGlow(who);
}
function endUlt(who){
  const o = who === "me" ? G : who;
  /* Coming out of the alternate form because the meter ran out is a
     transformation and gets the flash. Coming out of it because the car was
     wrecked or has finished is not, and those callers have already cleared the
     form before getting here, so there is nothing left for this to flash. */
  if(o.neelaForm) leaveNeelaForm(who);
  if(saffronDragonActive(who)) beginSaffronDrop(who);
  o.neelaOrigin = null; o.neelaSwapped = false; o.swapGuard = 0;
  /* Lolanthe's note leaves the way it arrived. A wreck and a finish both clear
     the note state immediately after ending the ultimate, so neither of them
     leaves one popping out over a car that is no longer there. */
  if(lolantheCar(who)) o.queenOut = QUEEN_POP;
  o.queenPop = 0;
  /* Coming out of Aero-Glow because the meter ran out is the return, and gets
     the white transition and, at the end of it, the two seconds of protection.
     Coming out of it because the car was wrecked or has crossed the line is
     not, and those callers have already cleared the phase before getting here,
     so there is nothing left for this to send home. */
  if(rhosynCar(who)) beginAeroReturn(who);
  o.ultOn = false; o.ultT = 0; o.ultMax = ULT_TIME;
  o.ult = 0;
}
/* Run the clock down for whoever is holding one. */
function tickUlt(who, dt){
  const o = who === "me" ? G : who;
  if(!o.ultOn) return;
  o.ultT = Math.max(0, o.ultT - dt);
  if(o.ultT === 0){ endUlt(who); return; }
  o.ult = ultFrac(who);
}

function ultBurst(carId, x, y){
  const car = CARS[carId], d = carDims(carId);
  for(let i=0;i<26;i++){
    const a = (i/26)*6.2832;
    addFx(x + Math.cos(a)*d.w*0.7, y + Math.sin(a)*d.h*0.45,
          Math.cos(a)*210, Math.sin(a)*210, rand(.4,.8), rand(3,6),
          i % 2 ? car.flame[0] : car.flame[1]);
  }
  G.shake = Math.max(G.shake, 9);
  tone(520, .5, "sine", .1);
  later(function(){ tone(780, .45, "sine", .08); }, 120);
}

/* Anything that has taken the controls away has taken the ultimate with it. */
function canFireUlt(){
  return ruleOn("ults") && !controlsLocked("me") &&
         G.state === "running" && G.dead <= 0 && G.finished === null;
}
function fireUlt(){
  if(!canFireUlt()) return;
  if(G.ultOn || G.ult < 1) return;
  G.ultArmed = false;
  startUlt("me");
}

/* The rival side of fireUlt, gate for gate. */
function fireUltRival(R){
  if(!ruleOn("ults") || controlsLocked(R)) return;
  if(G.state !== "running" || R.dead > 0 || R.finished !== null) return;
  if(R.ultOn || R.ult < 1) return;
  startUlt(R);
}

function setBoost(){
  G.boosting = ruleOn("boost") && !controlsLocked("me")
               && (G.keyBoost || G.ptrBoost || G.padBoost) && !G.boostLock && G.charge > 0
               && G.state === "running" && G.dead <= 0 && G.finished === null;
}

function puffFx(x, y){
  for(let i=0;i<12;i++){
    const a = rand(0, 6.2832), sp = rand(50, 190);
    addFx(x, y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.3,.6), rand(2,5), "#B9BEC6");
  }
}

function wreckRival(R, by, force){
  if(!R || R.dead > 0) return;
  if(force ? (finishedCar(R) || invulnerableCar(R)) : safeCar(R)) return;
  botBlame(R, by);
  ultDelta(R, ULT_ON_WRECK);
  if(by !== undefined) ultDelta(by, ULT_ON_KILL);
  R.dead = DEAD_TIME; R.shieldHitT = 0;
  clearSaffronState(R);
  clearNeelaState(R);                          /* no alternate form on a wreck */
  clearVerdantState(R);                        /* nor a ghost dissolving through the wreck */
  clearAeroGlowState(R);                       /* nor a void to be wrecked inside */
  if(R.ultOn) endUlt(R);                       /* a running ultimate is lost outright */
  clearLolantheState(R);                       /* and no note popping out over it */
  /* The meter itself survives, exactly as the player's does: destroyCar takes
     ULT_ON_WRECK off the top and no more. Wiping it here contradicted the
     ultDelta two lines above and quietly taxed the violent difficulties
     hardest - a brutal field wrecks four times as often, so it was losing
     four times as many charged ultimates to a rule the player never met. */
  R.boosting = false;
  clearDebuffs(R);
  for(let i=0;i<30;i++){
    const a = rand(0, 6.2832), sp = rand(70, 340);
    addFx(R.x, R.y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.45,1.0), rand(2,7),
          i%3 === 0 ? "#FFD9A0" : (i%3 === 1 ? "#FF7A3A" : CARS[R.car].accent));
  }
  for(let i=0;i<10;i++)
    addFx(R.x, R.y, rand(-110,110), rand(-190,-40), rand(.6,1.2), rand(3,7), "#2A2C33");
  G.shake = Math.max(G.shake, 12);
  noise(.55, .45); tone(95, .4, "sawtooth", .14);
}
function destroyRival(){ wreckRival(G.rivals[0]); }

/* ================================================================
   TRAPS  -  one hazard per track, placed at random
   ================================================================ */
function speedMult(){
  return Math.min(1 + Math.min(G.tier, MAX_TIER)*MULT_STEP, MAX_MULT);
}

/* keep a hazard fully on the asphalt so it is always possible to avoid */
function onRoad(x, half){
  return clamp(x, roadX + 8 + half, roadX + roadW - 8 - half);
}

/* Rarer items are rarer. The seeker is pointless in the lead, so it is not
   offered to whoever is already first. */
function rollItem(leader){
  const pool = ITEM_IDS.filter(function(id){ return !(id === "seeker" && leader); });
  let total = 0;
  pool.forEach(function(id){ total += RARITY[ITEMS[id].rarity].weight; });
  let r = Math.random()*total;
  for(let i=0;i<pool.length;i++){
    r -= RARITY[ITEMS[pool[i]].rarity].weight;
    if(r <= 0) return pool[i];
  }
  return pool[0];
}
function leaderOf(who){
  const mine = who === "me" ? G.meters : metersOf(who);
  const all = [G.meters].concat(G.rivals.map(metersOf));
  return mine >= Math.max.apply(null, all) - 0.01;
}

/* Rivals live in screen space and are only pinned at 30000px, which is well over
   two kilometres either way. A row planted at the top of your screen is about
   fifty metres up the road and swept away twenty-four metres behind you, so the
   whole bubble world was an eighty metre band strapped to your car: anyone
   further ahead than that was already past the row before it existed and never
   met a bubble in their life, and anyone dropped behind lost every row before it
   reached them. The road has to be the same road for all six, so a row is now
   planted the same distance ahead of whoever leads and kept until whoever trails
   is through it. When you are the one in front both come out exactly where they
   always did. */
function fieldTopY(){
  let y = playerY;
  for(let i=0;i<G.rivals.length;i++){
    const R = G.rivals[i];
    if(R.finished === null && R.y < y) y = R.y;
  }
  return y;
}
function fieldBottomY(){
  let y = playerY;
  for(let i=0;i<G.rivals.length;i++){
    const R = G.rivals[i];
    if(R.finished === null && R.y > y) y = R.y;
  }
  return y;
}
function bubbleCullY(){ return fieldBottomY() + (H + 120 - playerY); }

function spawnBubbleRow(){
  G.boxes.push({ y:fieldTopY() - playerY - 90, gone:0, s:Math.random(),
                 life:BUBBLE_LIFE, blink:0, ph:0, doomed:false });
}

function updateBubbles(dt, d, st){
  if(st === "running" && G.finished === null && ruleOn("bubbles")){
    G.boxGap += d;
    if(G.boxGap >= G.nextRow){
      G.boxGap = 0; spawnBubbleRow();
      G.nextRow = rand(BUBBLE_GAP[0], BUBBLE_GAP[1]);
    }
  }
  const c = carHit();
  const br2 = bubbleR()*bubbleR();
  const cull = bubbleCullY();
  for(let i=G.boxes.length-1;i>=0;i--){
    const row = G.boxes[i];
    row.y += d;
    if(row.y > cull){ G.boxes.splice(i,1); continue; }
    if(row.gone === 7){ G.boxes.splice(i,1); continue; }   /* all three collected */

    /* Run the clock down, then flash, then drop it. Only while the race is
       actually live, so a row does not quietly expire behind a pause screen
       or during the run-out after the flag. A flashing bubble still counts:
       it is on the road until it is gone, so taking one is never a gamble on
       which half of the blink you arrived in. */
    if(st === "running" && G.finished === null){
      if(row.doomed){
        /* the clock ran out: flash it down and take it away */
        row.blink -= dt;
        row.ph += dt*(10 + 22*(1 - clamp(row.blink/BUBBLE_BLINK, 0, 1)));
        if(row.blink <= 0){ G.boxes.splice(i,1); continue; }
      } else {
        /* The clock is a stall-breaker now, nothing more: it only runs when the
           road has all but stopped - braking or wrecked - so a row cannot
           hang about forever with nothing moving. While the race is actually
           running a row lives until the back of the field is through it, however
           far the field is strung out. Ageing it in transit was flashing rows
           away mid-road: a leader half a kilometre up and a tail-ender half a
           kilometre back is thirty-eight seconds of travel, and thirty seconds
           of clock took the row off the road before the back half ever saw it. */
        const roadSpeed = dt > 0 ? d/dt : 0;
        if(roadSpeed < BASE_SPEED*0.15) row.life -= dt;
        if(row.life <= 0){ row.doomed = true; row.blink = BUBBLE_BLINK; }
        else {
          /* Otherwise flash only as a warning that the road is about to take
             it. Worked out fresh each frame from where it is and how fast the
             road is running, so easing off the throttle puts the bubble back
             to solid instead of losing it - a warning must never be the thing
             that removes something you could still have reached. */
          const leaveIn = roadSpeed > 1 ? (cull - row.y)/roadSpeed : 1e9;
          row.blink = leaveIn <= BUBBLE_BLINK ? leaveIn : 0;
          if(row.blink > 0)
            row.ph += dt*(10 + 22*(1 - clamp(row.blink/BUBBLE_BLINK, 0, 1)));
        }
      }
    }
    /* A row is three bubbles, not one pick. Sweep all three and you take all
       three: each rolls on its own and the newest is the one in your hand, so a
       second bubble trades the first away rather than bouncing off. The only
       lock left is the bit in `gone`, which is per bubble - that is all this
       ever needed, and it is what stopped two cars sharing a single bubble on
       the same frame. */
    for(let l=0;l<3;l++){
      if(row.gone & (1 << l)) continue;                     /* this one is already gone */
      const bx = laneCX(l), by = row.y + Math.sin(G.scroll*0.01 + l*2 + row.s*6)*6;
      /* you - unless you are not on this road at all. A racer away in
         Aero-Glow cannot see the row and does not sweep it up, so what it
         leaves behind is still there for whoever does reach it. */
      if(st === "running" && G.dead <= 0 && G.finished === null && !rhosynElsewhere("me")){
        const p = nearestOnCar(c, bx, by);
        const dx = p.x - bx, dy = p.y - by;
        if(dx*dx + dy*dy <= br2){
          row.gone |= (1 << l);
          takeBubble("me", bx, by);
          continue;                                         /* the rest of the row is still live */
        }
      }
      /* and everyone else */
      for(let n=0;n<G.rivals.length;n++){
        const R = G.rivals[n];
        if(R.dead > 0 || R.finished !== null || rhosynElsewhere(R)) continue;
        const rc = carHit(R);
        const p2 = nearestOnCar(rc, bx, by);
        const ex = p2.x - bx, ey = p2.y - by;
        if(ex*ex + ey*ey <= br2){
          row.gone |= (1 << l);
          takeBubble(R, bx, by);
          break;                                            /* one bubble, one taker */
        }
      }
    }
  }
}
/* One pickup, whoever made it. Rolling straight into `item` is the whole of the
   override: what you were holding is simply gone.

   The bot fuse needs a word. A bot arms a timer when it picks something up and
   fires when the timer runs out, and re-rolling that timer on every bubble
   meant a bot crossing a whole row kept pushing its own shot further away and
   came out the far side having fired none of three items. It now keeps whichever
   fuse is shorter, so more bubbles can only ever make a bot quicker to shoot. */
function takeBubble(who, bx, by){
  const me = who === "me";
  const holder = me ? G : who;
  ultDelta(who, ULT_ON_BUBBLE);
  /* Item rewards are switched off - see MYSTERY_ITEMS_ENABLED. The bubble is still
     swept up and still pops, but only charge is handed over: no item, no trade of
     the one already held, and no bot fuse to fire one with. The pop is drawn
     in a plain colour rather than a rarity colour, because a rarity colour
     would be claiming a reward that was never granted. */
  if(!MYSTERY_ITEMS_ENABLED){ popFx(bx, by, "#BFC6D0"); return; }
  const had = !!holder.item;
  holder.item = rollItem(leaderOf(who));
  if(had) holder.swapT = ITEM_SWAP;
  if(!me){
    const roll = rand(0.6, 2.4);
    holder.useT = had && holder.useT > 0 ? Math.min(holder.useT, roll) : roll;
    holder.itemHold = 0;                 /* a fresh item is a fresh decision */
  }
  popFx(bx, by, RARITY[ITEMS[holder.item].rarity].col);
}
function popFx(x, y, col){
  for(let i=0;i<14;i++){
    const a = rand(0, 6.2832), sp = rand(60, 210);
    addFx(x, y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.3,.6), rand(2,4), i % 2 ? col : "#FFFFFF");
  }
  tone(880, .07, "sine", .06);
  later(function(){ tone(1320, .09, "sine", .06); }, 60);
}

/* ---------------- using an item ---------------- */
function useItem(who){
  const me = who === "me";
  const holder = me ? G : who;
  const id = holder.item;
  if(!id) return false;
  /* Using what is in the box is a driver's command like any other, so a
     controlled driver cannot give it - and because this is ahead of every
     branch below, the command is refused rather than the item being quietly
     spent or dropped on the way. */
  if(controlsLocked(who)) return false;
  /* Nor can a driver that is not on this road: an item used out of Aero-Glow
     would reach into a race that cannot reach back. Refused here, ahead of
     every branch below, so the item is kept rather than spent. */
  if(rhosynElsewhere(who)) return false;
  /* Defence in depth for the reward gate above: with Mystery rewards off, a
     Can, an Oil or a Seeker must not fire even if one somehow reached a holder
     - a saved race, a console poke, a future code path. It is dropped rather
     than kept, so stale state cannot sit in a box waiting for the gate to come
     back and then go off. */
  if(!MYSTERY_ITEMS_ENABLED && mysteryItem(id)){ holder.item = null; return false; }
  if(me && (G.state !== "running" || G.dead > 0 || G.finished !== null)) return false;
  if(!me && (who.dead > 0 || who.finished !== null)) return false;
  holder.item = null;
  const x = me ? G.x : who.x, y = me ? playerY : who.y;

  if(id === "can"){
    holder.canT = CAN_TIME;
    for(let i=0;i<18;i++)
      addFx(x + rand(-carW*0.3, carW*0.3), y + carH*0.4, rand(-70,70), rand(90,260),
            rand(.3,.6), rand(2,5), i % 2 ? "#FF9A4A" : "#FFE8C0");
    tone(320, .18, "square", .09);
    later(function(){ tone(560, .22, "square", .08); }, 110);
  } else if(id === "oil"){
    const k = SLICK_KINDS[(Math.random()*SLICK_KINDS.length)|0];
    const rx = rand(k.rx[0], k.rx[1]), ry = rand(k.ry[0], k.ry[1]);
    const o = {
      x:x, y:y + carH*0.42 + ry,
      rx:rx, ry:ry, r:Math.max(rx, ry),
      rot:rand(-k.rot, k.rot), jit:k.jit, sheen:k.sheen,
      spots:Math.floor(rand(k.spots[0], k.spots[1] + 0.999)),
      s:Math.random(), life:OIL_LIFE, fade:0, owner:me ? "me" : who
    };
    /* Back it off until the collision test itself says the car that dropped it
       is clear. Rotation, the ragged edge and the shape all push the real reach
       past ry, so ask the predicate rather than guess a margin - this stays
       right even if the families are retuned later. */
    const own = carHit(who);
    for(let g=0; g<16 && slickHits(o, own); g++) o.y += 5;
    G.slicks.push(o);
    tone(150, .25, "sawtooth", .07);
  } else if(id === "seeker"){
    fireSeeker(me ? "me" : who);
  }
  return true;
}

/* the seeker: one target, the leader, and nothing survives the trip */
function seekerTarget(owner){
  const all = [{ me:true, obj:null, m:G.meters,
                 out:G.dead > 0 || finishedMe() || rhosynElsewhere("me") }].concat(
    G.rivals.map(function(R){ return { me:false, obj:R, m:metersOf(R),
                                       out:R.dead > 0 || finishedCar(R) ||
                                           rhosynElsewhere(R) }; }));
  /* A finisher is off the target list of every offensive system, this one
     included - it is out of play, and nothing may touch its result. A racer
     away in Aero-Glow is off it for the opposite reason: there is no body at
     that position to aim a missile at. */
  const others = all.filter(function(a){
    return (owner === "me" ? !a.me : a.obj !== owner) && !a.out;
  });
  if(!others.length) return null;
  others.sort(function(a, b){ return b.m - a.m; });
  return others[0];
}
/* every seeker measurement in one place, so the drawing and the collision
   never drift apart */
function missileDims(){
  const len = carH*MISSILE_LEN;
  return {
    len:  len,
    nose: len*0.58,                 /* how far the tip sits ahead of centre */
    tail: len*0.42,                 /* how far the thruster sits behind it */
    hw:   carW*MISSILE_BODY,        /* body half width */
    fin:  carW*MISSILE_FIN          /* fins reach this far from centre */
  };
}
/* it is long enough now that testing the centre alone lets the nose sail
   clean through a car, so the whole spine gets sampled */
function missileSpine(m){
  const D = missileDims();
  const len = Math.max(1, Math.sqrt(m.vx*m.vx + m.vy*m.vy));
  const ux = m.vx/len, uy = m.vy/len;
  return [
    { x:m.x + ux*D.nose,      y:m.y + uy*D.nose },
    { x:m.x + ux*D.nose*0.55, y:m.y + uy*D.nose*0.55 },
    { x:m.x,                  y:m.y },
    { x:m.x - ux*D.tail*0.6,  y:m.y - uy*D.tail*0.6 }
  ];
}
function fireSeeker(owner){
  const t = seekerTarget(owner);
  if(!t) return;
  const D = missileDims();
  const x = owner === "me" ? G.x : owner.x, y = owner === "me" ? playerY : owner.y;
  G.missiles.push({
    /* clear of the car that fired it, tail first, so nothing overlaps the bonnet */
    x:x, y:y - carH*0.5 - D.tail, vx:0, vy:-MISSILE_SPEED*0.3,
    owner:owner, mark:t.me ? "me" : t.obj, life:14, fade:0
  });
  noise(.4, .4); tone(210, .5, "sawtooth", .12);
}
function markPos(mark){
  return mark === "me" ? { x:G.x, y:playerY, gone:G.dead > 0 }
                       : { x:mark.x, y:mark.y, gone:mark.dead > 0 };
}
/* A seeker waits out temporary invulnerability, but a racer that has crossed
   the line is gone for good - so the missile loses that mark harmlessly rather
   than circling a finisher for the rest of its life.

   A mark that leaves for Aero-Glow mid-flight is waited out on exactly the
   terms invulnerability is: the missile hangs back until there is something at
   that position again. It cannot reach it in the meantime either way - the
   contact sweep below asks noContact() - but hanging back is what stops a
   seeker riding the whole fifteen seconds nose-to-tail with a car nobody can
   see. */
function markFinished(mark){ return mark === "me" ? finishedMe() : finishedCar(mark); }
function markShielded(mark){
  const shielded = mark === "me" ? invulnerableMe() : invulnerableCar(mark);
  return shielded || rhosynElsewhere(mark);
}

function updateMissiles(dt, d){
  for(let i=G.missiles.length-1;i>=0;i--){
    const m = G.missiles[i];
    m.life -= dt;
    if(m.fade > 0){                                   /* fading out */
      m.fade -= dt;
      m.x += m.vx*dt; m.y += m.vy*dt + d;
      addFx(m.x, m.y, rand(-40,40), rand(-40,40), .3, 3, "rgba(255,180,120,0.8)");
      if(m.fade <= 0 || m.life <= 0) G.missiles.splice(i,1);
      continue;
    }
    const p = markPos(m.mark);
    if(p.gone || m.life <= 0){ G.missiles.splice(i,1); continue; }
    /* Its mark has finished: the target is out of play, so the seeker gives it
       up and burns out where it is rather than following it over the line. */
    if(markFinished(m.mark)){ m.fade = 0.5; continue; }

    /* Seekers wait out temporary invulnerability. */
    if(markShielded(m.mark)){                         /* wait it out */
      m.x = lerp(m.x, p.x, 1 - Math.pow(0.2, dt));
      m.y = lerp(m.y, p.y + carH*2.2, 1 - Math.pow(0.2, dt));
      addFx(m.x, m.y, rand(-30,30), rand(20,90), .25, 2.5, "#FFB07A");
      continue;
    }
    const dx = p.x - m.x, dy = p.y - m.y;
    const len = Math.max(1, Math.sqrt(dx*dx + dy*dy));
    m.vx = lerp(m.vx, dx/len*MISSILE_SPEED, 1 - Math.pow(0.0005, dt));
    m.vy = lerp(m.vy, dy/len*MISSILE_SPEED, 1 - Math.pow(0.0005, dt));

    m.x += m.vx*dt; m.y += m.vy*dt;
    const D = missileDims(), spine = missileSpine(m);
    const back = spine[3];
    for(let f=0;f<2;f++)
      addFx(back.x + rand(-D.hw*0.6, D.hw*0.6), back.y, rand(-60,60), rand(-30,70),
            .3, rand(D.hw*0.28, D.hw*0.55), f ? "#FFC078" : "#FF8A3A");

    /* it clears everything it passes through, along its whole length */
    const sweep = D.hw*1.3, sw2 = sweep*sweep;
    for(let k=G.traps.length-1;k>=0;k--){
      const o = G.traps[k];
      for(let s=0;s<spine.length;s++){
        const ox = o.x - spine[s].x, oy = o.y - spine[s].y;
        if(ox*ox + oy*oy < sw2){ smashFx(o.x, o.y, 26, "#FFD9A0", G.car); G.traps.splice(k,1); break; }
      }
    }
    for(let k=G.slicks.length-1;k>=0;k--){
      const o = G.slicks[k];
      for(let s=0;s<spine.length;s++){
        const ox = o.x - spine[s].x, oy = o.y - spine[s].y;
        if(ox*ox + oy*oy < sw2){ G.slicks.splice(k,1); break; }
      }
    }
    const all = racers();
    const hw2 = D.hw*D.hw;
    for(let k=0;k<all.length;k++){
      const a = all[k];
      if(a.out) continue;
      if(m.owner === "me" ? a.me : a.obj === m.owner) continue;
      /* Invulnerability, a wreck and the finish flag all stop the seeker;
         speed boosts do not. */
      if(noContact(a.me ? "me" : a.obj)) continue;
      const box = carHit(a.me ? "me" : a.obj);
      let px = 0, py = 0, touch = false;
      for(let s=0;s<spine.length && !touch;s++){
        const q2 = nearestOnCar(box, spine[s].x, spine[s].y);
        const qx = q2.x - spine[s].x, qy = q2.y - spine[s].y;
        if(qx*qx + qy*qy <= hw2){ touch = true; px = q2.x; py = q2.y; }
      }
      if(!touch) continue;
      const isMark = (m.mark === "me" && a.me) || m.mark === a.obj;
      if(a.me) destroyCar(); else wreckRival(a.obj, m.owner, true);
      seekerBoom(px, py);
      if(isMark || true){ G.missiles.splice(i,1); break; }
    }
  }
}
function seekerBoom(x, y){
  for(let i=0;i<46;i++){
    const a = rand(0, 6.2832), sp = rand(110, 540);
    addFx(x, y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.45,1.05), rand(4,10),
          i%3 === 0 ? "#FFE3B0" : (i%3 === 1 ? "#FF8A2B" : "#C6482A"));
  }
  G.shake = Math.max(G.shake, 26);
  noise(.6, .5); tone(80, .45, "sawtooth", .16);
}

/* The slick catches people for fifteen seconds and then stops being a threat,
   fading out where it lies. A catch removes it on the spot - no fade, so there
   is never a frame where a spent-looking slick is still live. */
function updateSlicks(dt, d, st){
  const c = carHit();
  for(let i=G.slicks.length-1;i>=0;i--){
    const o = G.slicks[i];
    o.y += d;
    if(o.y > VW_BOT + 120){ G.slicks.splice(i,1); continue; }

    if(o.fade > 0){                              /* spent: still visible, harmless */
      o.fade -= dt;
      if(o.fade <= 0) G.slicks.splice(i,1);
      continue;
    }
    o.life -= dt;
    if(o.life <= 0){ o.fade = OIL_FADE; continue; }

    /* Oil uses the ordinary road-contact rules. */
    if(st === "running" && !noContact("me") && G.finished === null){
      if(slickHits(o, c)){
        if(!refusesDebuffs("me")) G.slipT = SLIP_TIME;
        slickSplash(o); noise(.2, .2);
        G.slicks.splice(i,1); continue;
      }
    }
    for(let n=0;n<G.rivals.length;n++){
      const R = G.rivals[n];
      if(noContact(R)) continue;
      const rc = carHit(R);
      if(slickHits(o, rc)){
        if(!refusesDebuffs(R)){ R.slip = SLIP_TIME; botBlame(R, o.owner); }
        slickSplash(o);
        G.slicks.splice(i,1);
        break;
      }
    }
  }
}
/* The outline read back as a number, so the edge you can see is the edge that
   catches you - the same trick the puddles use. */
function slickFactor(o, ang){
  const n = 9;
  const a = ((ang % 6.2832) + 6.2832) % 6.2832;
  const f = a/6.2832*n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, tt = f - Math.floor(f);
  const j0 = 1 - o.jit + ((o.s*113.3 + i0*41.17) % 1)*o.jit*2;
  const j1 = 1 - o.jit + ((o.s*113.3 + i1*41.17) % 1)*o.jit*2;
  return lerp(j0, j1, tt)*0.95;
}

/* The exact same 30-segment outline the renderer fills, including rotation.
   No expanded axis-aligned box that can catch empty corners. */
function slickOutline(o,k){
  const pts=[],ca=Math.cos(o.rot),sa=Math.sin(o.rot);
  for(let i=0;i<=30;i++){
    const a=i/30*6.2832,f=slickFactor(o,a)*k;
    const x=Math.cos(a)*o.rx*f,y=Math.sin(a)*o.ry*f;
    pts.push({x:o.x+x*ca-y*sa,y:o.y+x*sa+y*ca});
  }
  return pts;
}
function slickHits(o,box){ return hitPolygonsOverlap(box.points,slickOutline(o,1)); }

/* it leaves with whoever drove into it, so throw the oil up as it goes -
   otherwise a slick vanishing in one frame just reads as a glitch */
function slickSplash(o){
  for(let i=0;i<14;i++){
    const a = rand(0, 6.2832), sp = rand(40, 170);
    addFx(o.x + Math.cos(a)*o.r*0.5, o.y + Math.sin(a)*o.r*0.35,
          Math.cos(a)*sp, Math.sin(a)*sp*0.6 - rand(20, 90),
          rand(.25, .5), rand(2, 4.5),
          i % 3 === 0 ? "#7A5AA0" : "#14141C");
  }
}

function spawnTrap(){
  if(!ruleOn("traps")) return;             /* a race that asked for a clean road */
  if(G.seam !== null) return;              /* leave the handover clear */
  const b = G.biome, lane = randi(0, 2);
  if(b === "city"){
    const rx = rand(laneW*0.30, laneW*0.48), ry = rx*rand(0.52, 0.82);
    G.traps.push({ b:b, kind:"puddle", x:onRoad(laneCX(lane) + rand(-laneW*0.16, laneW*0.16), rx),
                   y:VW_TOP - ry - 50, rx:rx, ry:ry, s:Math.random(), hit:0, nm:0 });
  } else if(b === "space"){
    /* blast stays under three quarters of a lane so a neighbouring lane is always safe */
    /* The ring comes in above the whole field - on one screen that is just
       above the top of it - and is a spot on the road from there on. How long
       the rock has is set here, from how long the road would take to carry
       that spot down to the row it is aimed at at this pace: at a steady pace
       it lands exactly where it always did, and anything the driver does to
       the road speed afterwards moves the landing rather than the drop. */
    const y = VW_TOP - rand(300, 460);  /* warning first, then the long drop */
    const aim = VW_TOP + playerY;       /* the row it is thrown at */
    const pace = Math.max(G.speed, BASE_SPEED*speedMult()*0.75);
    const max = clamp((aim - y)/pace, METEOR_MIN_T, METEOR_MAX_T);
    G.traps.push({ b:b, kind:"meteor", x:onRoad(laneCX(lane) + rand(-laneW*0.06, laneW*0.06), 6),
                   y:y, fall:max, max:max,
                   r:laneW*rand(0.42, 0.60), mr:rand(13, 21)*SCENE,
                   s:Math.random(), phase:0, t:0, nm:0 });
  } else {
    const dir = Math.random() < 0.5 ? 1 : -1, r = rand(15, 25)*SCENE;
    G.traps.push({ b:b, kind:"weed", r:r, s:Math.random(), age:0, rot:rand(0, 6.28),
                   x: dir > 0 ? roadX - 46*SCENE : roadX + roadW + 46*SCENE,
                   y: VW_TOP - 70*SCENE, nm:0,
                   vx: dir*(roadW + 92*SCENE)/rand(2.1, 3.1),
                   fall: rand(0.48, 0.66) });
  }
}

/* --- Body hitboxes: world coordinates, independent of camera/DPR and PNG
       loading. Flann's inset hull follows its tapered body; the other cars
       keep their existing body dimensions. All hulls rotate with the car.

       The shape is in logical car units and the size it is multiplied up by is
       the racer's own, out of carDims() - so a car drawn larger on the road is
       collided larger by exactly the same factor, and there is never a big car
       carrying a small hull. Five of the six are carW/carH as they always
       were. */
function carHit(who, xAt, yAt, tiltAt){
  const me = who === undefined || who === "me", o = me ? G : who;
  const x = xAt === undefined ? o.x : xAt;
  const y = yAt === undefined ? (me ? playerY : o.y) : yAt;
  const tilt = tiltAt === undefined ? (o.tilt || 0) : tiltAt;
  /* The body this racer is wearing right now, which for a Neela in its
     alternate form is the alternate hull at the alternate size. Both come out
     of racerModel()/racerDims(), which is what the renderer is drawing from,
     so the hull switches on the same frame the sprite does and back on the
     same frame it does. */
  const shape = racerModel(who).hitShape || CAR_HIT_RECT;
  const dim = racerDims(who);
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const points = shape.map(function(p){
    const px = p[0]*dim.w, py = p[1]*dim.h;
    return { x:x + px*ca - py*sa, y:y + px*sa + py*ca };
  });
  return { x:x, y:y, points:points };
}
function nearestHitSegment(a, b, x, y){
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx*dx + dy*dy;
  const t = len2 ? clamp(((x-a.x)*dx + (y-a.y)*dy)/len2, 0, 1) : 0;
  return { x:a.x + dx*t, y:a.y + dy*t };
}
function insideHitPolygon(points, x, y){
  let inside = false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a = points[j], b = points[i];
    const p = nearestHitSegment(a, b, x, y);
    if((p.x-x)*(p.x-x) + (p.y-y)*(p.y-y) < 1e-12) return true;
    if((a.y > y) !== (b.y > y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y) + a.x) inside = !inside;
  }
  return inside;
}
function hitEdgesCross(a, b, c, d){
  const cross = function(p,q,r){ return (q.x-p.x)*(r.y-p.y) - (q.y-p.y)*(r.x-p.x); };
  const abC = cross(a,b,c), abD = cross(a,b,d), cdA = cross(c,d,a), cdB = cross(c,d,b);
  if(Math.max(a.x,b.x) < Math.min(c.x,d.x) || Math.max(c.x,d.x) < Math.min(a.x,b.x) ||
     Math.max(a.y,b.y) < Math.min(c.y,d.y) || Math.max(c.y,d.y) < Math.min(a.y,b.y)) return false;
  return abC*abD <= 0 && cdA*cdB <= 0;
}
function hitPolygonsOverlap(a, b){
  const bounds = function(pts){
    return pts.reduce(function(r,p){
      r[0]=Math.min(r[0],p.x);r[1]=Math.max(r[1],p.x);
      r[2]=Math.min(r[2],p.y);r[3]=Math.max(r[3],p.y);return r;
    },[Infinity,-Infinity,Infinity,-Infinity]);
  };
  const aa=bounds(a),bb=bounds(b);
  if(aa[1]<bb[0] || bb[1]<aa[0] || aa[3]<bb[2] || bb[3]<aa[2]) return false;
  if(insideHitPolygon(a,b[0].x,b[0].y) || insideHitPolygon(b,a[0].x,a[0].y)) return true;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    if(hitEdgesCross(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length])) return true;
  }
  return false;
}
/* Control points are shared with the drawn quadratic puddle, not an ellipse.
   Subdivide each curve to a maximum chord error of 0.15 logical pixels. */
function puddlePoints(o, k, yAt){
  const pts=[], y = yAt === undefined ? o.y : yAt;
  for(let i=0;i<11;i++){
    const a=i/11*6.2832, j=0.68 + ((o.s*131.7 + i*47.31)%1)*0.56;
    pts.push({x:o.x+Math.cos(a)*o.rx*j*k,y:y+Math.sin(a)*o.ry*j*k});
  }
  return pts;
}
function puddleHits(o, box, yAt){
  const controls=puddlePoints(o,1,yAt), points=[], n=controls.length;
  for(let i=0;i<n;i++){
    const p=controls[(i+n-1)%n],q=controls[i],r=controls[(i+1)%n];
    const a={x:(p.x+q.x)/2,y:(p.y+q.y)/2}, b={x:(q.x+r.x)/2,y:(q.y+r.y)/2};
    const bend=Math.hypot(a.x-2*q.x+b.x,a.y-2*q.y+b.y);
    const steps=Math.max(1,Math.ceil(Math.sqrt(bend/(4*0.15))));
    for(let j=0;j<steps;j++){
      const t=j/steps,u=1-t;
      points.push({x:u*u*a.x+2*u*t*q.x+t*t*b.x,y:u*u*a.y+2*u*t*q.y+t*t*b.y});
    }
  }
  return hitPolygonsOverlap(box.points,points);
}
/* the closest the hazard got to this car during the frame, not just where it ended */
function sweptY(o, moved, cy){
  const prev = o.y - moved;
  return clamp(cy, Math.min(prev, o.y), Math.max(prev, o.y));
}

/* While an ultimate is running the meter is its remaining duration, so
   rewards and penalties wait until it has finished rather than cutting it
   short or extending it. */
function ultDelta(who, amount){
  if(who === "me"){
    if(G.ultOn) return;
    G.ult = clamp(G.ult + amount, 0, 1);
  } else if(who){
    if(who.ultOn) return;
    who.ult = clamp(who.ult + amount, 0, 1);
  }
}
/* Record that a hazard has passed this car. */
function markPassed(o, box, bit){
  if(o.nm & bit) return;
  if(o.y < box.y) return;                        /* not past us yet */
  o.nm |= bit;
}

/* Perfect dodges observe the existing simulation, never resolve collisions.
   Capture before movement, settle after every racer's hazards and finish check.
   A new steering target must interrupt a path with <=120ms to real impact;
   continuing an early lane change cannot arm a later, artificial near miss. */
function beginPerfectDodges(){
  const field = ["me"].concat(G.rivals);
  return {
    speed:G.speed,
    traps:G.traps.map(function(o){ return { live:o, before:Object.assign({}, o) }; }),
    racers:field.map(function(who, i){
      const o = who === "me" ? G : who;
      return { who:who, bit:1 << i, x:o.x, y:who === "me" ? playerY : o.y,
        tilt:o.tilt || 0, lane:o.dodgeLane === undefined ? o.lane : o.dodgeLane,
        speed:who === "me" ? G.speed : o.abs,
        eligible:!noContact(who) && !controlsLocked(who) && !(o.swapGuard > 0) };
    })
  };
}

function dodgeCircleHits(box, x, y, radius){
  const p = nearestOnCar(box, x, y);
  return (p.x-x)*(p.x-x) + (p.y-y)*(p.y-y) <= radius*radius;
}

/* Predict the interrupted trajectory with the same lateral easing, measured
   hull, irregular puddle outline, weed radius and meteor clocks as gameplay.
   Substeps cover at most one logical pixel (and at most 1/240s), independently
   of rendering FPS. Only a new steering decision runs this short prediction. */
function perfectDodgeThreat(o, a, worldSpeed){
  if(o.kind === "meteor" && o.phase !== 0) return false;
  if(o.kind !== "meteor" && o.y > a.y) return false;
  const easing = a.who === "me" ? 0.00004 : 0.00006;
  const lateral = Math.abs(laneCX(a.lane) - a.x)*-Math.log(easing);
  const vertical = o.kind === "meteor" ? METEOR_ALT/rockLead(o) : 0;
  const n = Math.ceil(PERFECT_DODGE_WINDOW*Math.max(240,
    Math.abs(a.speed) + Math.abs(o.vx || 0) + lateral + vertical));
  for(let i=0;i<=n;i++){
    const t = PERFECT_DODGE_WINDOW*i/n;
    const x = lerp(a.x, laneCX(a.lane), 1 - Math.pow(easing, t));
    const y = a.y + (worldSpeed - a.speed)*t;
    const box = carHit(a.who, x, y, a.tilt);
    const hx = o.x + (o.kind === "weed" ? o.vx*t : 0);
    const hy = o.y + worldSpeed*t*(o.kind === "weed" ? o.fall : 1);
    if(o.kind === "puddle"){
      if(puddleHits(o, box, hy)) return true;
    } else if(o.kind === "weed"){
      if(dodgeCircleHits(box, hx, hy, o.r*Math.sqrt(0.86))) return true;
    } else if(o.kind === "meteor"){
      const fall = Math.max(0, o.fall - t);
      if(fall <= 0){
        // The blast exists at impact, not throughout the remaining prediction.
        const impactY = o.y + worldSpeed*o.fall;
        const impactBox = carHit(a.who,
          lerp(a.x, laneCX(a.lane), 1 - Math.pow(easing, o.fall)),
          a.y + (worldSpeed-a.speed)*o.fall, a.tilt);
        return dodgeCircleHits(impactBox, o.x, impactY, o.r);
      }
      const alt = rockAlt(Object.assign({}, o, {fall:fall}));
      // updateTraps' early roof detonation is driven by the camera racer.
      if(a.who === "me" && fall < rockLead(o) && alt < racerDims(a.who).h*0.55 &&
         dodgeCircleHits(box, hx, hy-alt, o.mr)) return true;
    }
  }
  return false;
}

function finishPerfectDodges(frame){
  for(const a of frame.racers){
    const who = a.who, racer = who === "me" ? G : who;
    const turned = racer.lane !== a.lane;
    racer.dodgeLane = racer.lane;
    const eligible = a.eligible && !noContact(who) && !controlsLocked(who) &&
                     !(racer.swapGuard > 0);
    for(const entry of frame.traps){
      const o = entry.live, bit = a.bit;
      if(!G.traps.includes(o) || (o.pdDone & bit)) continue;
      if(!eligible || (o.hit & bit) || (o.kind !== "puddle" && clearsSolidHazards(who))){
        // Protection cancels a pending dodge, not a future encounter after it ends.
        if((o.pdThreat & bit) || (o.hit & bit)) o.pdDone = (o.pdDone || 0) | bit;
        o.pdThreat = (o.pdThreat || 0) & ~bit;
        continue;
      }
      if(turned && !(o.pdThreat & bit) && perfectDodgeThreat(entry.before, a, frame.speed)){
        o.pdThreat = (o.pdThreat || 0) | bit;
        if(!o.pdOrigin) o.pdOrigin = {};
        o.pdOrigin[bit] = a.x;
      }
      if(!(o.pdThreat & bit)) continue;
      const box = carHit(who);
      const rear = Math.max.apply(null, box.points.map(function(p){ return p.y; }));
      const radius = o.kind === "puddle" ? o.ry*1.24 : o.r;
      const resolved = o.kind === "meteor" ? o.phase > 0 : o.y - radius > rear;
      if(!resolved) continue;                   /* still capable of hitting us */
      o.pdDone = (o.pdDone || 0) | bit;
      o.pdThreat &= ~bit;
      if(Math.abs(racer.x - o.pdOrigin[bit]) > Math.max(1, racerDims(who).w*0.05))
        ultDelta(who, ULT_ON_PERFECT_DODGE);
    }
  }
}

function nearestOnCar(c, px, py){
  if(insideHitPolygon(c.points,px,py)) return {x:px,y:py};
  let nearest=null, best=Infinity;
  for(let i=0;i<c.points.length;i++){
    const p=nearestHitSegment(c.points[i],c.points[(i+1)%c.points.length],px,py);
    const d=(p.x-px)*(p.x-px)+(p.y-py)*(p.y-py);
    if(d<best){best=d;nearest=p;}
  }
  return nearest;
}

function updateTraps(dt, d, st){
  /* A racer that has left the shared road for Aero-Glow is not on it to be
     hit, and a rock must not detonate because a car that is not there passed
     under it - so the departure is part of "is this car racing on this road
     right now?" rather than an extra clause bolted on to the damage test. */
  const racing = st === "running" && G.dead <= 0 && !rhosynElsewhere("me") && !saffronAirborne("me");
  const live = racing && !invulnerableMe() && !finishedMe();
  const c = carHit();
  for(let i=G.traps.length-1;i>=0;i--){
    const o = G.traps[i];
    if(o.kind === "weed"){
      o.age += dt;

      o.x += o.vx*dt;
      o.y += d*o.fall;
      o.rot += o.vx*dt/o.r;
      if(o.x < roadX-100 || o.x > roadX+roadW+100 || o.y > VW_BOT+100){ G.traps.splice(i,1); continue; }
      if(live && !(o.hit & 1)){
        const wy = sweptY(o, d*o.fall, c.y);
        const p = nearestOnCar(c, o.x, wy);
        const dx = p.x - o.x, dy = p.y - wy;
        if(dx*dx + dy*dy <= o.r*o.r*0.86){
          hitWeed(o);
          G.traps.splice(i,1); continue;
        }
      }
      continue;
    }
    if(o.kind === "meteor"){
      /* The ring scrolls with the road; the falling rock uses elapsed seconds. */

      o.y += d; o.t += dt;
      if(o.phase === 0){
        const previousAlt = rockAlt(o);
        o.fall = Math.max(0, o.fall - dt);
        if(st === "running" && interceptSaffronMeteor(o, previousAlt)){ G.traps.splice(i,1); continue; }
        if(o.fall <= 0) detonate(o, live);
        else if(racing && o.fall < rockLead(o)){
          const alt = rockAlt(o);
          if(alt < racerDims("me").h*0.55){           /* a rock straight on the roof */
            const my = o.y - alt;
            const p2 = nearestOnCar(c, o.x, my);
            const dx = p2.x - o.x, dy = p2.y - my;
            if(dx*dx + dy*dy <= o.mr*o.mr){
              /* An ultimate with the solid-hazard privilege goes through the
                 rock rather than under it: it is taken off the road here and
                 now, so it never reaches the ground and never detonates. The
                 ultimate itself is untouched. */
              if(clearsSolidHazards("me")){
                showShieldHit("me");
                smashFx(o.x, my, o.mr, "#C6482A", G.car);
                G.traps.splice(i,1); continue;
              }
              detonate(o, live);
            }
          }
        }
      } else if(o.phase === 1){
        if(o.t > 0.4){ o.phase = 2; o.t = 0; }
      } else if(o.t > 1.6){ G.traps.splice(i,1); continue; }
      if(o.y > VW_BOT + 400) G.traps.splice(i,1);
      continue;
    }

    o.y += d;                                  /* world-fixed: always scrolls with the road */
    if(o.y > VW_BOT + 260){ G.traps.splice(i,1); continue; }
    if(!live || (o.hit & 1)) continue;
    if(puddleHits(o, c, sweptY(o, d, c.y))){
      o.hit |= 1;
      hitPuddle();
    }
    markPassed(o, c, 1);
  }
}

/* The rock always reaches the ground. Anything caught in the blast goes with it. */
function detonate(o, live){
  o.phase = 1; o.t = 0;
  G.shake = 18;
  for(let i=0;i<26;i++){
    const a = rand(0, 6.2832), sp = rand(60, 300);
    addFx(o.x, o.y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.35,.85), rand(2,6),
          i%3 === 0 ? "#FFE3B0" : (i%3 === 1 ? "#FF8A2B" : "#C6482A"));
  }
  for(let i=0;i<8;i++)
    addFx(o.x, o.y, rand(-70,70), rand(-130,-20), rand(.6,1.1), rand(4,8), "#2E2A34");
  noise(.5, .5); tone(70, .4, "sawtooth", .16);
  /* The blast still happens and still looks like one; what a car with the
     solid-hazard privilege does not do is die in it. Everybody else inside the
     radius is destroyed on exactly the terms they always were. */
  if(live && !noContact("me")){
    const c2 = carHit();
    const p3 = nearestOnCar(c2, o.x, o.y);
    const dx = p3.x - o.x, dy = p3.y - o.y;
    if(dx*dx + dy*dy <= o.r*o.r){
      if(clearsSolidHazards("me")) showShieldHit("me"); else destroyCar();
    }
  }
  for(let n=0;n<G.rivals.length;n++){
    const R = G.rivals[n];
    if(safeCar(R)) continue;
    const rc = carHit(R);
    const p4 = nearestOnCar(rc, o.x, o.y);
    const rx = p4.x - o.x, ry = p4.y - o.y;
    if(rx*rx + ry*ry <= o.r*o.r){
      if(clearsSolidHazards(R)) showShieldHit(R); else wreckRival(R);
    }
  }
}

/* Water thrown over one windscreen. Every car that goes through a puddle gets
   its own, because in local play every car has a screen of its own to foul. */
function blindSpray(){
  const out = [];
  for(let i=0;i<54;i++)
    out.push({ x:rand(-0.06, 1.06), y:rand(-0.06, 1.06), r:rand(4, 26), s:Math.random() });
  return out;
}
function hitPuddle(){
  if(noContact("me")) return;
  if(hitShield("me")) return;
  ultDelta("me", ULT_ON_TRAP);
  G.blind = BLIND_TIME;
  G.blindPts = blindSpray();
  for(let i=0;i<16;i++){
    const a = rand(-2.6, -0.5);
    addFx(G.x + rand(-carW*0.4, carW*0.4), playerY, Math.cos(a)*rand(70,220), Math.sin(a)*rand(70,240),
          rand(.3,.6), rand(2,5), "#7FC2EC");
  }
  G.shake = 6;
  noise(.3, .3); tone(200, .16, "sine", .07);
}

/* being destroyed: wreck the car, then respawn it invulnerable */
function clearMyUlt(){
  if(G.ultOn) endUlt("me");
  G.ult = 0;
}
function destroyCar(by){
  clearSaffronState("me");
  clearNeelaState("me");                       /* no alternate form on a wreck */
  clearVerdantState("me");                     /* nor a ghost dissolving through the wreck */
  clearAeroGlowState("me");                    /* nor a void to be wrecked inside */
  if(G.ultOn) clearMyUlt();                    /* a running ultimate is lost outright */
  clearLolantheState("me");                    /* and no note popping out over it */
  clearDebuffs("me");
  ultDelta("me", ULT_ON_WRECK);
  if(by) ultDelta(by, ULT_ON_KILL);
  G.dead = DEAD_TIME; G.shieldHitT = 0;
  G.shake = 22;
  for(let i=0;i<30;i++){
    const a = rand(0, 6.2832), sp = rand(70, 340);
    addFx(G.x, playerY, Math.cos(a)*sp, Math.sin(a)*sp, rand(.45,1.0), rand(2,7),
          i%3 === 0 ? "#FFD9A0" : (i%3 === 1 ? "#FF7A3A" : "#E21B22"));
  }
  for(let i=0;i<10;i++)
    addFx(G.x, playerY, rand(-110,110), rand(-190,-40), rand(.6,1.2), rand(3,7), "#2A2C33");
  noise(.6, .55); tone(90, .45, "sawtooth", .17);
}

function hitWeed(o){
  /* An ultimate with the solid-hazard privilege goes straight through it. No
     Slow, no meter penalty, and the weed comes apart on the bonnet rather than
     being politely missed - the caller removes it either way. */
  if(noContact("me")) return;
  if(clearsSolidHazards("me")){ showShieldHit("me"); smashWeed(o, G.car); return; }
  if(hitShield("me")) return;
  ultDelta("me", ULT_ON_TRAP);
  G.slowT = SLOW_TIME;
  G.shake = 8;
  for(let i=0;i<14;i++){
    const a = rand(0, 6.2832), sp = rand(40, 170);
    addFx(o.x, o.y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.3,.7), rand(2,5),
          i%2 ? "#A8895C" : "#D8C49A");
  }
  noise(.24, .24); tone(170, .13, "square", .07);
}

/* A tumbleweed broken apart by an ultimate rather than survived. It throws
   the same debris the seeker's clear-out does - one destruction effect for
   "this was smashed", asked for by a car now instead of a missile - tinted with
   the weed's own colour. Player, bot and local human all come here. */
function smashWeed(o, whose){ smashFx(o.x, o.y, o.r, "#D8C49A", whose); }

/* Hazard debris, also used when a seeker clears the road. */
function smashFx(x, y, r, tint, whose){
  const car = CARS[whose || G.car];
  for(let i=0;i<20;i++){
    const a = rand(0, 6.2832), sp = rand(70, 300);
    addFx(x, y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.3,.7), rand(2,6),
          i % 3 === 0 ? tint : (i % 3 === 1 ? car.flame[0] : car.flame[1]));
  }
  G.shake = Math.max(G.shake, 7);
  noise(.22, .3);
}

function respawnFx(){
  for(let i=0;i<18;i++){
    const a = (i/18)*6.2832;
    addFx(G.x + Math.cos(a)*carW*0.6, playerY + Math.sin(a)*carH*0.4,
          Math.cos(a)*70, Math.sin(a)*70, .45, 3, "#FF7A7F");
  }
  tone(660, .1, "sine", .09);
  later(function(){ tone(990, .12, "sine", .09); }, 90);
}

function addFx(x, y, vx, vy, life, r, c){
  if(G.fx.length > 240) G.fx.shift();          /* two cars can throw a lot of sparks */
  G.fx.push({ x:x, y:y, vx:vx, vy:vy, life:life, max:life, r:r, c:c });
}
function updateFx(dt, d){
  for(let i=G.fx.length-1;i>=0;i--){
    const f = G.fx[i];
    f.life -= dt;
    if(f.life <= 0){ G.fx.splice(i,1); continue; }
    f.x += f.vx*dt;
    f.y += f.vy*dt + d*0.55;
    f.vx *= 0.94; f.vy *= 0.94;
  }
}
