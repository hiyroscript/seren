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
   invulnerability, being wrecked and having finished all say no, and every
   contact, hazard and targeting test downstream asks this rather than
   reassembling the three for itself. */
function noContact(who){
  if(who === "me") return finishedMe() || G.dead > 0 || invulnerableMe();
  return !who || finishedCar(who) || who.dead > 0 || invulnerableCar(who);
}
/* Protection is independent of the ultimate speed multiplier. */
function safeCar(R){ return !R || noContact(R); }
function playerUntouchable(){ return noContact("me"); }

/* Whatever cannot be reached cannot be debuffed either, so this is the same
   answer under the name the callers actually mean: a car that is Invulnerable,
   wrecked or finished refuses a new debuff and has any already applied cleared
   by sweepDebuffs below. */
function refusesDebuffs(who){ return noContact(who); }
function clearDebuffs(who){
  if(who === "me"){
    G.slowT = 0; G.blind = 0; G.slipT = 0;
  } else if(who){
    who.slow = 0; who.blind = 0; who.slip = 0;
  }
}
function sweepDebuffs(){
  if(invulnerableMe() || finishedMe()) clearDebuffs("me");
  for(let i=0;i<G.rivals.length;i++){
    const R = G.rivals[i];
    if(invulnerableCar(R) || finishedCar(R)) clearDebuffs(R);
  }
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
  if(id === "obscured") return (o.blind || 0) > 0;
  if(id === "skidded") return (me ? G.slipT : o.slip || 0) > 0;
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

/* Rear contact shunts the front car and slows the following car. */
function rearEnd(who, victim){
  const meB = who === "me";
  if(meB ? finishedMe() : finishedCar(who)) return;      /* out of play: no contact */
  if(victim.me ? finishedMe() : finishedCar(victim.obj)) return;
  if((meB ? G.bumpCD : who.bumpCD) > 0) return;

  if(noContact(who) || noContact(victim.me ? "me" : victim.obj)) return;
  const vy = victim.y;
  if(meB) G.bumpCD = 0.5; else { who.bumpCD = 0.5; who.y = vy + carH*0.98; }

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

function bumpTarget(victim, dir, by){
  if(noContact(by) || noContact(victim.me ? "me" : victim.obj)) return;
  const to = victim.lane + dir;
  if(victim.me){
    if(to < 0 || to > 2) destroyCar(by);
    else { G.lane = to; G.slowT = Math.max(G.slowT, BUMP_SLOW); }
  } else {
    if(to < 0 || to > 2) wreckRival(victim.obj, by);
    else {
      victim.obj.lane = to;
      victim.obj.x = lerp(victim.obj.x, laneCX(to), 0.35);
      victim.obj.slow = Math.max(victim.obj.slow, BUMP_SLOW);
      victim.obj.changeT = 0.7;
      botBlame(victim.obj, by);
    }
  }
  sideSwipe(victim.obj || { x:G.x, y:playerY, car:G.car });
}

function move(dir){
  if(G.state !== "running" || G.dead > 0 || G.finished !== null) return;
  if(G.slipT > 0) dir = -dir;                    /* no grip: the steering is reversed */
  const n = clamp(G.lane + dir, 0, 2);
  if(n === G.lane) return;

  /* Barge into the lane you want. If the other car has room it is shoved
     across and left labouring; if it is already against a barrier the hit
     wrecks it instead. Either way the lane is yours. */
  const victim = carAt(n, playerY, "me");
  if(victim) bumpTarget(victim, dir, "me");
  G.lane = n;
}

/* what the bot meant to do, after its steering is reversed */
function rivalSteer(R, lane){
  if(R.slip > 0) lane = clamp(R.lane - (lane - R.lane), 0, 2);
  rivalLaneTo(R, lane);
}

function rivalLaneTo(R, lane){
  const dir = lane > R.lane ? 1 : -1;
  const victim = carAt(lane, R.y, R);
  if(victim) bumpTarget(victim, dir, R);
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
}
function endUlt(who){
  const o = who === "me" ? G : who;
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
  const car = CARS[carId];
  for(let i=0;i<26;i++){
    const a = (i/26)*6.2832;
    addFx(x + Math.cos(a)*carW*0.7, y + Math.sin(a)*carH*0.45,
          Math.cos(a)*210, Math.sin(a)*210, rand(.4,.8), rand(3,6),
          i % 2 ? car.flame[0] : car.flame[1]);
  }
  G.shake = Math.max(G.shake, 9);
  tone(520, .5, "sine", .1);
  later(function(){ tone(780, .45, "sine", .08); }, 120);
}

/* Anything that has taken the controls away has taken the ultimate with it. */
function canFireUlt(){
  return ruleOn("ults") &&
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
  if(!ruleOn("ults")) return;
  if(G.state !== "running" || R.dead > 0 || R.finished !== null) return;
  if(R.ultOn || R.ult < 1) return;
  startUlt(R);
}

function setBoost(){
  G.boosting = ruleOn("boost")
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
  R.dead = DEAD_TIME;
  if(R.ultOn) endUlt(R);                       /* a running ultimate is lost outright */
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
      /* you */
      if(st === "running" && G.dead <= 0 && G.finished === null){
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
        if(R.dead > 0 || R.finished !== null) continue;
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
  const all = [{ me:true, obj:null, m:G.meters, out:G.dead > 0 || finishedMe() }].concat(
    G.rivals.map(function(R){ return { me:false, obj:R, m:metersOf(R),
                                       out:R.dead > 0 || finishedCar(R) }; }));
  /* A finisher is off the target list of every offensive system, this one
     included - it is out of play, and nothing may touch its result. */
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
   than circling a finisher for the rest of its life. */
function markFinished(mark){ return mark === "me" ? finishedMe() : finishedCar(mark); }
function markShielded(mark){ return mark === "me" ? invulnerableMe() : invulnerableCar(mark); }

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
       keep their existing body dimensions. All hulls rotate with the car. */
function carHit(who, xAt, yAt, tiltAt){
  const me = who === undefined || who === "me", o = me ? G : who;
  const x = xAt === undefined ? o.x : xAt;
  const y = yAt === undefined ? (me ? playerY : o.y) : yAt;
  const tilt = tiltAt === undefined ? (o.tilt || 0) : tiltAt;
  const shape = CARS[o.car].hitShape || CAR_HIT_RECT;
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const points = shape.map(function(p){
    const px = p[0]*carW, py = p[1]*carH;
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
/* did this hazard slip past close enough to count as a dodge? */
/* Credit for getting out of the way at the last moment: either you squeezed
   past it, or you swerved out of the lane it was about to take you in. */
/* Record that a hazard has passed this car. */
function markPassed(o, box, bit){
  if(o.nm & bit) return;
  if(o.y < box.y) return;                        /* not past us yet */
  o.nm |= bit;
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
  const racing = st === "running" && G.dead <= 0;
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
        o.fall = Math.max(0, o.fall - dt);
        if(o.fall <= 0) detonate(o, live);
        else if(racing && o.fall < rockLead(o)){
          const alt = rockAlt(o);
          if(alt < carH*0.55){                       /* a rock straight on the roof */
            const my = o.y - alt;
            const p2 = nearestOnCar(c, o.x, my);
            const dx = p2.x - o.x, dy = p2.y - my;
            if(dx*dx + dy*dy <= o.mr*o.mr) detonate(o, live);
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
  if(live){
    const c2 = carHit();
    const p3 = nearestOnCar(c2, o.x, o.y);
    const dx = p3.x - o.x, dy = p3.y - o.y;
    if(dx*dx + dy*dy <= o.r*o.r) destroyCar();
  }
  for(let n=0;n<G.rivals.length;n++){
    const R = G.rivals[n];
    if(safeCar(R)) continue;
    const rc = carHit(R);
    const p4 = nearestOnCar(rc, o.x, o.y);
    const rx = p4.x - o.x, ry = p4.y - o.y;
    if(rx*rx + ry*ry <= o.r*o.r) wreckRival(R);
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
  ultDelta("me", ULT_ON_TRAP);
  if(refusesDebuffs("me")) return;
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
  if(G.ultOn) clearMyUlt();                    /* a running ultimate is lost outright */
  clearDebuffs("me");
  ultDelta("me", ULT_ON_WRECK);
  if(by) ultDelta(by, ULT_ON_KILL);
  G.dead = DEAD_TIME;
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
  ultDelta("me", ULT_ON_TRAP);
  if(refusesDebuffs("me")) return;
  G.slowT = SLOW_TIME;
  G.shake = 8;
  for(let i=0;i<14;i++){
    const a = rand(0, 6.2832), sp = rand(40, 170);
    addFx(o.x, o.y, Math.cos(a)*sp, Math.sin(a)*sp, rand(.3,.7), rand(2,5),
          i%2 ? "#A8895C" : "#D8C49A");
  }
  noise(.24, .24); tone(170, .13, "square", .07);
}

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
