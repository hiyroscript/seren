"use strict";

/* SEREN - Canvas 2D drawing. Cars, tracks, scenery, hazards, particles and
   the Conditions that sit over them. Draw order here is behaviour: it is what
   decides what covers what. This file reads game state and never changes
   it. */

/* ---------------- drawing helpers -------------------------------- */
function rr(x,y,w,h,r){
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(x,y,w,h,r); return; }
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
function fillRR(x,y,w,h,r,c){ rr(x,y,w,h,r); ctx.fillStyle=c; ctx.fill(); }

/* One image per sprite, shared by showroom, garage and every race view. A car
   with an alternate form contributes both of its sheets, so vtm_neela.PNG is
   fetched, decoded and cached exactly once alongside v_neela.PNG rather than
   being built the first time an ultimate is pressed.
   onload also repaints canvases that were painted before the asset arrived.
   The Node fixture need only supply Image; no browser decoder is required. */
const CAR_SPRITES = {};
(function(){
  const models = [];
  CAR_IDS.forEach(function(id){
    const p = CARS[id];
    if(!p) return;
    models.push(p);
    if(p.altForm) models.push(p.altForm);
  });
  models.forEach(function(p){
    if(!p.sprite || CAR_SPRITES[p.sprite]) return;
    const img = new Image();
    CAR_SPRITES[p.sprite] = img;
    img.onload = function(){ requestAnimationFrame(paintCarIcons); };
    img.src = p.sprite;
  });
})();

/* ---- the two note images ----------------------------------------
   World artwork rather than car artwork: one floats above an ulting Lolanthe
   and three orbit every racer it has taken. Fetched, decoded and cached here
   exactly once, alongside the car sheets and by the same rule - a renderer
   never builds an Image, it asks for one that already exists. A frame drawn
   before the image arrives simply draws no note; nothing waits on it and
   nothing is created per frame. */
const FX_SPRITES = {};
(function(){
  [QUEEN_NOTE_IMG, MIND_NOTE_IMG].forEach(function(src){
    if(!src || FX_SPRITES[src]) return;
    const img = new Image();
    FX_SPRITES[src] = img;
    img.src = src;
  });
})();
function fxImage(src){
  const img = FX_SPRITES[src];
  return img && img.complete && img.naturalWidth && img.naturalHeight ? img : null;
}

/* ---- where the artwork sits inside a car box --------------------
   The full PNG is drawn, padding and all, scaled and centred so its measured
   visible bounds fill the w x h box. This is that placement, worked out once
   and returned rather than recomputed by everything that needs a point on the
   artwork - which is what keeps an effect pinned to a tailpipe instead of
   drifting off it at another size.

   Null until the image has arrived, because none of it can be known without
   the source dimensions. */
function spriteFrame(model, w, h){
  const img = model && model.sprite ? CAR_SPRITES[model.sprite] : null;
  if(!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const b = model.spriteBounds;
  const scale = Math.min(w/(img.naturalWidth*b[2]), h/(img.naturalHeight*b[3]));
  const sw = img.naturalWidth*scale, sh = img.naturalHeight*scale;
  return { img:img, sw:sw, sh:sh,
           left:-(b[0] + b[2]/2)*sw, top:-(b[1] + b[3]/2)*sh,
           vw:b[2]*sw, vh:b[3]*sh };
}
/* An image-space anchor as a point in the car's own unrotated space. */
function spriteAnchor(fr, a){
  return { x:fr.left + a[0]*fr.sw, y:fr.top + a[1]*fr.sh };
}
/* And the same anchor as a point in the world, for a racer that is actually on
   the road: its own model, its own size, its own tilt. Effects that have to be
   laid down in the world rather than drawn in the car's space - the alternate
   form's trail - come through here, so a node is dropped exactly where the
   renderer would have drawn the emitter. Read-only; it is called from update
   code and changes nothing. */
function racerTailPoint(who){
  const model = racerModel(who);
  const root = model.trailRoot || (model.exhaust && model.exhaust[0]);
  if(!root) return null;
  const d = racerDims(who);
  const fr = spriteFrame(model, d.w, d.h);
  if(!fr) return null;
  const a = spriteAnchor(fr, root);
  const o = who === "me" ? G : who;
  if(!o) return null;
  const cx = who === "me" ? G.x : o.x, cy = who === "me" ? playerY : o.y;
  const t = o.tilt || 0, ca = Math.cos(t), sa = Math.sin(t);
  return { x:cx + a.x*ca - a.y*sa, y:cy + a.x*sa + a.y*ca };
}

/* ---- one view's opacity on one car ------------------------------
   An ulting Verdant is drawn at half in its own driver's column and at nothing
   in everybody else's, and everything that hangs off the car - the shadow, the
   plume out of its pipe, the flash on its body - has to go with it, or the
   invisible car is outlined by its own exhaust.

   So the car's opacity is a scale rather than a value: CAR_A is what drawCar
   was handed, and the handful of places inside it that set an absolute alpha
   ask carAlpha() instead of writing ctx.globalAlpha themselves. Every one of
   them is inside drawCar's own save/restore, so nothing leaks past the car
   being drawn and the next car starts from a clean canvas whatever this one
   was. */
let CAR_A = 1;
function carAlpha(v){ ctx.globalAlpha = clamp(v, 0, 1)*CAR_A; }

function drawSpriteCar(w, h, p, boosting, ulting, lifted){
  const fr = spriteFrame(p, w, h);
  if(!fr) return;
  if(!lifted) fillRR(-fr.vw/2 + w*0.04, -fr.vh/2 + h*0.04, fr.vw, fr.vh, fr.vw*0.26, "rgba(0,0,0,0.35)");
  if(boosting) drawSpriteExhaust(p, fr);
  /* Full source rectangle: preserve padding and every tire/spoiler detail. */
  ctx.drawImage(fr.img, fr.left, fr.top, fr.sw, fr.sh);
  /* Over the body, not under it: the fire wraps the car rather than glowing
     behind it. `ulting` is its own flag and never the boost one, so an
     ordinary boost and a boost can leave the paint alone. */
  if(ulting) drawFlannUltFire(w, h, p);
}

/* ---- the ultimate fire ------------------------------------------
   Flann's ultimate is an offensive one - see flannUltActive() in mechanics.js
   - and this is what it looks like. Only Flann, only while ultOn is true;
   ordinary boost and the boost can are the rear plumes above and nothing more.

   Each tongue is x and y on the car in fractions of its own width and height,
   a length in fractions of its height, and a phase offset so the flicker does
   not beat in unison. They run down both sills, close off behind the rear
   wheels and lick over the shoulders, which reads as a car alight while
   leaving the middle of the body - the part that says which car it is -
   clear. */
const FLANN_FIRE = [
  [-0.30, -0.26, 0.30, 0.0], [-0.32, -0.02, 0.36, 1.1], [-0.30,  0.22, 0.34, 2.2],
  [ 0.30, -0.26, 0.30, 0.6], [ 0.32, -0.02, 0.36, 1.7], [ 0.30,  0.22, 0.34, 2.8],
  [-0.27,  0.33, 0.34, 3.3], [ 0.27,  0.33, 0.34, 4.0],
  [-0.18, -0.35, 0.24, 4.6], [ 0.18, -0.35, 0.24, 5.2]
];
/* Drawn in the car's own translated and rotated space, so the whole fire leans
   with it through a lane change without a transform of its own.

   The only thing that moves is read off the clock, exactly as the exhaust
   pulse is: nothing is stored, nothing is seeded and no race state is touched,
   so drawing the same frame twice draws the same fire. Reduced motion pins the
   phase at zero, which leaves the flames sitting still rather than taking them
   away - a car on fire must still look like a car on fire. */
function drawFlannUltFire(w, h, p){
  const reduced = motionReduced();
  const phase = reduced ? 0 : performance.now()*0.007;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Internal engine pockets clipped to the measured collision body.
  ctx.save();
  ctx.beginPath();
  p.hitShape.forEach(function(q,i){ if(i) ctx.lineTo(q[0]*w,q[1]*h); else ctx.moveTo(q[0]*w,q[1]*h); });
  ctx.closePath(); ctx.clip();
  for(let i=0;i<7;i++){
    const x=(i%2 ? -.15 : .15)*w, y=(-.30+i*.10)*h;
    const heat=.38+(reduced ? 0 : Math.sin(phase+i*1.7)*.07);
    const core=ctx.createRadialGradient(x,y,0,x,y,w*.29);
    core.addColorStop(0,"rgba(255,255,220,"+heat+")");
    core.addColorStop(.22,"rgba(255,210,65,.32)");
    core.addColorStop(.65,"rgba(255,75,10,.16)");
    core.addColorStop(1,"rgba(225,30,0,0)");
    ctx.fillStyle=core; ctx.fillRect(x-w*.29,y-w*.29,w*.58,w*.58);
  }
  ctx.restore();
  /* the heat the body sits in, so the tongues read as one fire and not ten */
  const halo = ctx.createRadialGradient(0, h*0.06, w*0.22, 0, h*0.06, w*1.05);
  halo.addColorStop(0,    withA(p.flame[1], 0.20));
  halo.addColorStop(0.45, withA(p.flame[0], 0.16));
  halo.addColorStop(1,    withA(p.flame[0], 0));
  ctx.fillStyle = halo;
  ctx.fillRect(-w*1.05, h*0.06 - w*1.05, w*2.1, w*2.1);

  for(let i=0;i<FLANN_FIRE.length;i++){
    const f = FLANN_FIRE[i];
    const flick = reduced ? 0 : Math.sin(phase + f[3]);
    const x = w*f[0], y = h*f[1];
    const len = h*f[2]*(0.86 + flick*0.14);
    const half = w*0.085*(0.92 + flick*0.08);
    /* Hot where it meets the paint and gone by the tip, so a tongue fades into
       the air rather than ending on a line. */
    const g = ctx.createRadialGradient(x, y, half*0.2, x, y, len);
    g.addColorStop(0,    withA(p.flame[1], 0.95));
    g.addColorStop(0.24, withA(p.flame[0], 0.82));
    g.addColorStop(0.62, withA(p.flame[0], 0.34));
    g.addColorStop(1,    withA(p.flame[0], 0));
    ctx.fillStyle = g;
    /* Wide on the body, drawn out to a point behind it, and leaning back down
       the car because the car is going forwards. */
    ctx.beginPath();
    ctx.moveTo(x - half, y - len*0.10);
    ctx.bezierCurveTo(x - half*1.25, y + len*0.34, x - half*0.55, y + len*0.72,
                      x + half*0.10, y + len);
    ctx.bezierCurveTo(x + half*0.30, y + len*0.62, x + half*1.25, y + len*0.30,
                      x + half, y - len*0.10);
    ctx.quadraticCurveTo(x, y - len*0.26, x - half, y - len*0.10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ---- what comes out of the pipes --------------------------------
   Both plumes are built in image space and drawn in the car's own translated
   and rotated space: the root is the measured anchor put through the same
   placement the artwork was, so resizing the car, tilting it through a lane
   change, scaling it for the race or drawing it into one column of four can
   never slide the effect off the outlet it belongs to.

   Which one a car gets is data, not a name: CARS.<id>.exhaustStyle. */
function drawSpriteExhaust(p, fr){
  if(p.exhaustStyle === "energy") drawSpriteEnergy(p, fr);
  else drawSpriteFlame(p, fr);
}

function drawSpriteFlame(p, fr){
  const reduced = motionReduced();
  const phase = reduced ? 0 : performance.now()*0.009;
  ctx.save();
  for(let i=0;i<p.exhaust.length;i++){
    const a = spriteAnchor(fr, p.exhaust[i]);
    const x = a.x, y = a.y;
    const pulse = reduced ? 0 : Math.sin(phase + i*0.7);
    const len = fr.vh*(0.23 + pulse*0.016), half = fr.vw*(0.059 + pulse*0.003);
    const glow = ctx.createLinearGradient(x, y, x, y + len);
    glow.addColorStop(0, p.flame[1]);
    glow.addColorStop(0.3, p.flame[0]);
    glow.addColorStop(1, withA(p.flame[0], 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.bezierCurveTo(x - half*1.2, y + len*0.35, x - half*0.35, y + len*0.82, x, y + len);
    ctx.bezierCurveTo(x + half*0.35, y + len*0.82, x + half*1.2, y + len*0.35, x + half, y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.flame[1];
    ctx.beginPath();
    ctx.moveTo(x - half*0.45, y);
    ctx.quadraticCurveTo(x - half*0.35, y + len*0.30, x, y + len*0.56);
    ctx.quadraticCurveTo(x + half*0.35, y + len*0.30, x + half*0.45, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* Neela's, and not a flame. Concentrated blue energy: white-hot where it
   leaves the outlet, electric blue through the body of it, and drawn out into
   a clean transparent streak rather than tapering to an orange point. Drawn
   lightened, so two of them crossing brighten instead of stacking up muddy.

   Every gradient is linear, exactly as the flame's is, so nothing here can be
   mistaken for the radial body fire that belongs to Flann's ultimate alone.
   Reduced motion takes the pulse out and leaves the energy: the plume is what
   says the car is going faster, and that has to stay visible. */
function drawSpriteEnergy(p, fr){
  const reduced = motionReduced();
  const phase = reduced ? 0 : performance.now()*0.009;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for(let i=0;i<p.exhaust.length;i++){
    const a = spriteAnchor(fr, p.exhaust[i]);
    const x = a.x, y = a.y;
    const pulse = reduced ? 0 : Math.sin(phase + i*0.7);
    const len = fr.vh*(0.30 + pulse*0.020), half = fr.vw*(0.052 + pulse*0.002);

    /* Every gradient starts on the anchor itself rather than a little above or
       below it, so the root of the effect is the measured outlet exactly, at
       every size, every tilt and every point of the pulse. */
    /* the soft outer glow the streak sits in */
    const haze = ctx.createLinearGradient(x, y, x, y + len);
    haze.addColorStop(0,    withA(p.flame[0], 0.42));
    haze.addColorStop(0.35, withA(p.flame[0], 0.26));
    haze.addColorStop(1,    withA(p.flame[0], 0));
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.moveTo(x - half*1.9, y - len*0.06);
    ctx.quadraticCurveTo(x - half*1.5, y + len*0.55, x, y + len);
    ctx.quadraticCurveTo(x + half*1.5, y + len*0.55, x + half*1.9, y - len*0.06);
    ctx.closePath(); ctx.fill();

    /* the streak itself: parallel-sided for most of its length, then gone */
    const body = ctx.createLinearGradient(x, y, x, y + len);
    body.addColorStop(0,    withA(p.flame[1], 0.95));
    body.addColorStop(0.18, withA(p.flame[0], 0.90));
    body.addColorStop(0.60, withA(p.flame[0], 0.45));
    body.addColorStop(1,    withA(p.flame[0], 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x - half*0.72, y + len*0.62);
    ctx.quadraticCurveTo(x - half*0.30, y + len*0.90, x, y + len);
    ctx.quadraticCurveTo(x + half*0.30, y + len*0.90, x + half*0.72, y + len*0.62);
    ctx.lineTo(x + half, y);
    ctx.closePath(); ctx.fill();

    /* and a white core right at the outlet, which is what reads as heat */
    const core = ctx.createLinearGradient(x, y, x, y + len*0.52);
    core.addColorStop(0,   "rgba(255,255,255,0.95)");
    core.addColorStop(0.4, withA(p.flame[1], 0.70));
    core.addColorStop(1,   withA(p.flame[1], 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(x - half*0.40, y - len*0.04);
    ctx.lineTo(x - half*0.26, y + len*0.34);
    ctx.quadraticCurveTo(x, y + len*0.52, x + half*0.26, y + len*0.34);
    ctx.lineTo(x + half*0.40, y - len*0.04);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* ---- the transformation flash -----------------------------------
   A car turning into something else, or arriving somewhere it was not a moment
   ago, fades through white. It is drawn from the model's own hull, so it is
   the car's silhouette that goes white rather than a disc over the top of it -
   and because every model has a hull, the same code does it for whichever of
   the seven was the one teleported.

   Purely cosmetic: it reads morphT and changes nothing. There is no clock in
   it and no oscillation to take away, so reduced motion gets the same clean
   ramp everybody else does. */
function drawMorphFlash(w, h, p, k){
  if(!(k > 0)) return;
  const shape = p.hitShape || CAR_HIT_RECT;
  /* A halo around the body, then the body itself. Flat fills rather than
     gradients on purpose: a gradient here would be indistinguishable from an
     exhaust plume or a body fire to anything watching what the renderer asks
     the canvas for, and this is neither of those things. */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  carAlpha(0.16*k);
  ctx.fillStyle = "#BFE6FF";
  ctx.fillRect(-w*0.72, -h*0.62, w*1.44, h*1.24);
  carAlpha(0.20*k);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(-w*0.46, -h*0.54, w*0.92, h*1.08);
  ctx.restore();

  ctx.save();
  carAlpha(k);
  ctx.beginPath();
  for(let i=0;i<shape.length;i++){
    const px = shape[i][0]*w, py = shape[i][1]*h;
    if(i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();
}

/* `boosting` is the ordinary exhaust flag every model has always had - the
   boost meter, a boost can or a running ultimate, anything that makes the car
   faster. `ulting` is separate and narrower: this racer's ultimate is running
   right now. Keeping them apart is what lets Flann's body fire appear for the
   ultimate alone while an ordinary boost still only lights the pipes - and it
   is why Neela's boost plume never transforms anything: the plume is the boost
   flag, the alternate body is its own state, and they are not the same
   question. `white` is the transformation flash, 0 unless this car has just
   changed shape or been put down somewhere else.

   Menus pass none of the three, so a preview is never on fire, never white,
   and always wearing its own car model. */
function drawCar(x, y, w, h, p, tilt, isPlayer, boosting, ulting, white, alpha, lifted){
  const a = alpha === undefined ? 1 : clamp(alpha, 0, 1);
  if(a <= 0) return;
  const was = CAR_A;
  ctx.save();
  CAR_A = a;
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  if(tilt) ctx.rotate(tilt);
  /* Body fire belongs only to Flann; exhaust comes from each active model. */
  if(p.style === "sprite") drawSpriteCar(w, h, p, boosting, !!ulting && p.key === "flann", lifted);
  if(white) drawMorphFlash(w, h, p, white);
  ctx.restore();
  CAR_A = was;
}

const ROOF = ["#22242A", "#1A1C21", "#2B2E35"];
const ROCK = ["#B08A5E", "#9C7550", "#C4A277"];

/* ---- side scenery: one silhouette per track ---- */
function roofBlock(b, x0, bw){
  ctx.fillStyle = ROOF[b.tone];
  ctx.fillRect(x0, b.y, bw, b.h);
  ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x0, b.y, bw, 3);
  ctx.fillStyle = "rgba(0,0,0,0.35)";       ctx.fillRect(x0, b.y + b.h - 4, bw, 4);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for(let v=0; v<3; v++){
    const vy = b.y + 16 + v*(b.h-32)/3 + b.s*10;
    if(vy > b.y+6 && vy < b.y+b.h-14) ctx.fillRect(x0+bw*0.18, vy, bw*0.28, 8);
  }
  const cx = x0 + bw/2;
  if(b.tank && b.h > 110){
    ctx.beginPath(); ctx.arc(cx + bw*0.18, b.y + b.h*0.62, Math.min(bw*0.16, 13), 0, 6.2832);
    ctx.fillStyle = "#3A3D44"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2; ctx.stroke();
  }
  if(b.extra && b.h > 150){
    ctx.beginPath(); ctx.arc(cx, b.y + b.h*0.4, Math.min(bw*0.3, 20), 0, 6.2832);
    ctx.strokeStyle = "rgba(226,27,34,0.75)"; ctx.lineWidth = 3; ctx.stroke();
  }
}

function rockBlock(b, x0, bw){
  const pad = bw*0.05, r = Math.min(bw*0.34, 26);
  fillRR(x0+pad+3, b.y+9, bw-pad*2, b.h-14, r, "rgba(120,92,58,0.35)");
  fillRR(x0+pad,   b.y,   bw-pad*2, b.h-10, r, ROCK[b.tone]);
  fillRR(x0+pad+bw*0.10, b.y + b.h*0.10, (bw-pad*2)*0.52, (b.h-10)*0.38, r*0.7, "rgba(255,255,255,0.12)");
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for(let i=0;i<2;i++){
    const yy = b.y + b.h*(0.42 + i*0.26) + b.s*10;
    if(yy > b.y+8 && yy < b.y+b.h-16) ctx.fillRect(x0+pad+bw*0.16, yy, (bw-pad*2)*0.58, 3);
  }
  if(b.tank && b.h > 120){
    ctx.beginPath(); ctx.arc(x0+bw*0.5, b.y+b.h*0.72, Math.min(bw*0.14, 9), 0, 6.2832);
    ctx.fillStyle = "#8A6A46"; ctx.fill();
  }
}

function starBlock(b, x0, bw){
  for(let i=0;i<9;i++){
    const f = (b.s*97.3 + i*37.77) % 1, g2 = (b.s*53.1 + i*61.31) % 1;
    const x = x0 + 3 + f*(bw-6), y = b.y + g2*b.h;
    if(y < CT-4 || y > CB+4) continue;
    ctx.beginPath(); ctx.arc(x, y, 0.7 + ((f*g2*7) % 1)*1.5, 0, 6.2832);
    ctx.fillStyle = i % 4 === 0 ? "rgba(178,200,255,0.9)" : "rgba(255,255,255," + (0.32 + f*0.5).toFixed(2) + ")";
    ctx.fill();
  }
}

function drawSide(s, id){
  const arr = G.build[s];
  const x0 = s === 0 ? 0 : roadX + roadW + sideW;
  const bw = s === 0 ? roadX - sideW : W - x0;
  if(bw <= 2) return;
  for(let i=0;i<arr.length;i++){
    const b = arr[i];
    if(b.b !== id || b.y > CB+10 || b.y + b.h < CT-10) continue;
    if(id === "city") roofBlock(b, x0, bw);
    else if(id === "desert") rockBlock(b, x0, bw);
    else starBlock(b, x0, bw);
  }
}

/* ---- roadside props ---- */
function drawProps(id){
  if(id === "space") return;          /* the void stays empty apart from stars */
  for(let i=0;i<G.props.length;i++){
    const p = G.props[i];
    if(p.b !== id || p.y < CT-30 || p.y > CB+30) continue;
    const cx = p.side === 0 ? roadX - sideW/2 : roadX + roadW + sideW/2;
    const rad = Math.min(sideW*0.38, 11);
    if(id === "city"){
      if(p.kind === 0){
        fillRR(cx-3, p.y-6, 6, 12, 3, "#E21B22");
        fillRR(cx-5, p.y-2, 10, 3, 1.5, "#B3151B");
      } else if(p.kind === 1){
        ctx.beginPath(); ctx.arc(cx, p.y, rad, 0, 6.2832); ctx.fillStyle = "#5C6B58"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx-2, p.y-2, rad*0.45, 0, 6.2832); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(cx, p.y, rad*0.7, 0, 6.2832); ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fill();
      }
    } else if(id === "desert"){
      if(p.kind === 0){                                   /* cactus */
        fillRR(cx-3.5, p.y-10, 7, 20, 3.5, "#5F7A55");
        fillRR(cx-9, p.y-3, 5.5, 10, 2.7, "#546D4B");
        fillRR(cx+3.5, p.y-7, 5.5, 11, 2.7, "#546D4B");
      } else if(p.kind === 1){                            /* shoulder marker */
        fillRR(cx-2, p.y-7, 4, 14, 2, "#EDEEF1");
        fillRR(cx-2, p.y-7, 4, 5, 2, "#E21B22");
      } else {                                            /* scrub */
        ctx.fillStyle = "rgba(120,96,60,0.5)";
        for(let k=0;k<4;k++){
          const a = p.s*6.28 + k*1.57;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a)*5, p.y + Math.sin(a)*5, 2.6, 0, 6.2832); ctx.fill();
        }
      }
    }
  }
}

/* ---- road surface, markings, crossings ---- */
function drawRoad(id, T){
  ctx.fillStyle = T.road; ctx.fillRect(roadX, CT, roadW, CB - CT);
  if(id === "space"){
    const bh = 58, per = bh*RAINBOW.length, base = perTop(-(G.scroll % per), per) - per;
    ctx.globalAlpha = 0.52;
    for(let i=0; base + i*bh < CB; i++){
      const y = base + i*bh;
      if(y + bh < CT) continue;
      ctx.fillStyle = RAINBOW[((i % RAINBOW.length) + RAINBOW.length) % RAINBOW.length];
      ctx.fillRect(roadX, y, roadW, bh+1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(6,6,14,0.36)"; ctx.fillRect(roadX, CT, roadW, CB - CT);
    return;
  }
  const gap = 190, off = G.scroll % gap;
  ctx.fillStyle = id === "desert" ? "rgba(216,190,146,0.06)" : "rgba(255,255,255,0.028)";
  for(let y = perTop(off, gap) - gap; y < CB; y += gap) ctx.fillRect(roadX, y, roadW, 2);
  if(id === "desert"){
    const p = 330, o2 = G.scroll % p;
    ctx.fillStyle = "rgba(214,188,144,0.14)";
    for(let y = perTop(o2, p) - p; y < CB; y += p){
      ctx.fillRect(roadX, y, roadW*0.2, 58);
      ctx.fillRect(roadX + roadW*0.74, y + 150, roadW*0.26, 42);
    }
  }
}

function drawEdges(id, T){
  if(id === "space"){
    const vh = CB - CT;
    ctx.fillStyle = "rgba(92,225,230,0.16)";
    ctx.fillRect(roadX-10, CT, 10, vh); ctx.fillRect(roadX+roadW, CT, 10, vh);
    ctx.fillStyle = T.shoulder;
    ctx.fillRect(roadX-4, CT, 4, vh); ctx.fillRect(roadX+roadW, CT, 4, vh);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(roadX-2.5, CT, 1.5, vh); ctx.fillRect(roadX+roadW+1, CT, 1.5, vh);
  } else {
    ctx.fillStyle = T.shoulder;
    ctx.fillRect(roadX-4, CT, 4, CB - CT); ctx.fillRect(roadX+roadW, CT, 4, CB - CT);
  }
}

function drawMarks(id, T){
  const dash = 46, gap = 44, per = dash+gap, d0 = G.scroll % per;
  ctx.fillStyle = T.mark;
  for(let l=1;l<3;l++){
    const lx = roadX + laneW*l - 2.5;
    for(let y = perTop(d0, per) - per; y < CB; y += per) ctx.fillRect(lx, y, 5, dash);
  }
  if(id !== "space"){
    ctx.fillStyle = T.edge;
    ctx.fillRect(roadX + 7, CT, 3, CB - CT);
    ctx.fillRect(roadX + roadW - 10, CT, 3, CB - CT);
  }
}

/* only the city has anything crossing the road */
function drawFeatures(id){
  if(id !== "city") return;
  for(let i=0;i<G.walks.length;i++){
    const f = G.walks[i];
    if(f.b !== id || f.y < CT-70 || f.y > CB+10) continue;
    ctx.fillStyle = "rgba(237,238,241,0.82)";
    const n = 7, sw2 = roadW/(n*2-1);
    for(let k=0;k<n;k++) ctx.fillRect(roadX + k*sw2*2, f.y, sw2, 46);
  }
}

/* ---- how each hazard looks ---- */
function smoothPath(pts){
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0].x + pts[n-1].x)/2, (pts[0].y + pts[n-1].y)/2);
  for(let i=0;i<n;i++){
    const a = pts[i], b = pts[(i+1) % n];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x)/2, (a.y + b.y)/2);
  }
  ctx.closePath();
}
function puddlePath(p, k){ smoothPath(puddlePoints(p,k)); }
function drawPuddle(p){
  ctx.save();
  puddlePath(p, 1.0);
  ctx.fillStyle = "rgba(28,86,150,0.66)"; ctx.fill();
  puddlePath(p, 0.66);
  ctx.fillStyle = "rgba(16,54,104,0.58)"; ctx.fill();
  ctx.beginPath();
  if(ctx.ellipse) ctx.ellipse(p.x - p.rx*0.24, p.y - p.ry*0.28, p.rx*0.36, p.ry*0.19, -0.35, 0, 6.2832);
  else ctx.arc(p.x - p.rx*0.24, p.y - p.ry*0.28, p.rx*0.28, 0, 6.2832);
  ctx.fillStyle = "rgba(150,208,246,0.42)"; ctx.fill();
  ctx.beginPath();
  if(ctx.ellipse) ctx.ellipse(p.x + p.rx*0.30, p.y + p.ry*0.24, p.rx*0.17, p.ry*0.10, 0.4, 0, 6.2832);
  else ctx.arc(p.x + p.rx*0.30, p.y + p.ry*0.24, p.rx*0.12, 0, 6.2832);
  ctx.fillStyle = "rgba(150,208,246,0.24)"; ctx.fill();
  puddlePath(p, 1.0);
  ctx.strokeStyle = "rgba(126,196,244,0.5)"; ctx.lineWidth = 1.6; ctx.stroke();
  for(let i=0;i<2;i++){
    const a = p.s*6.28 + i*2.4;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(a)*p.rx*1.35, p.y + Math.sin(a)*p.ry*1.4, 2.4 + ((p.s*17 + i) % 1)*2.6, 0, 6.2832);
    ctx.fillStyle = "rgba(28,86,150,0.55)"; ctx.fill();
  }
  ctx.restore();
}

/* A rock on the way down, the ground it is aimed at, and the crater after. */
function drawMeteor(o){
  if(o.phase === 0){
    const prog = clamp(1 - o.fall/Math.max(0.01, o.max), 0, 1);
    const per = lerp(0.46, 0.13, prog);
    const on = (o.t % per) < per*0.55;

    ctx.save();
    ctx.globalAlpha = on ? 0.30 : 0.12;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832);
    ctx.fillStyle = "#E21B22"; ctx.fill();
    ctx.globalAlpha = on ? 0.95 : 0.38;
    ctx.strokeStyle = "#E21B22"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 0.8;                                   /* ring closing on impact */
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(o.x, o.y, 3 + o.r*(1 - prog)*0.9, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    if(o.fall < rockLead(o)){
      const k = clamp(o.fall/rockLead(o), 0, 1);
      const alt = rockAlt(o), sc = 1 + k*0.5;
      const mx = o.x, my = o.y - alt, mr = o.mr*sc;

      ctx.save();
      ctx.globalAlpha = 0.14 + (1-k)*0.3;                    /* shadow closing in */
      ctx.beginPath();
      if(ctx.ellipse) ctx.ellipse(o.x, o.y, o.mr*(0.45 + (1-k)*0.6), o.mr*(0.3 + (1-k)*0.4), 0, 0, 6.2832);
      else ctx.arc(o.x, o.y, o.mr*(0.45 + (1-k)*0.6), 0, 6.2832);
      ctx.fillStyle = "#000"; ctx.fill();
      ctx.globalAlpha = 1;

      const len = 95 + 80*k;                                 /* fire trail */
      const g2 = ctx.createLinearGradient(mx, my - len, mx, my);
      g2.addColorStop(0, "rgba(255,120,40,0)");
      g2.addColorStop(1, "rgba(255,176,74,0.8)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(mx - mr*0.8, my); ctx.lineTo(mx, my - len); ctx.lineTo(mx + mr*0.8, my);
      ctx.closePath(); ctx.fill();

      ctx.beginPath();                                       /* glow */
      ctx.arc(mx, my, mr*1.7, 0, 6.2832);
      ctx.fillStyle = "rgba(255,140,50,0.22)"; ctx.fill();

      ctx.beginPath();                                       /* the rock */
      for(let i=0;i<9;i++){
        const a = (i/9)*6.2832;
        const rr = mr*(0.72 + ((o.s*83.1 + i*37.7) % 1)*0.5);
        const px = mx + Math.cos(a)*rr, py = my + Math.sin(a)*rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#2B2530"; ctx.fill();
      ctx.strokeStyle = "rgba(255,150,60,0.75)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx - mr*0.15, my - mr*0.1, mr*0.42, 0, 6.2832);
      ctx.fillStyle = "#FFCE86"; ctx.fill();
      ctx.restore();
    }
    return;
  }

  if(o.phase === 1){
    const k = clamp(o.t/0.4, 0, 1), rr = o.r*(0.4 + k*1.1);
    ctx.save();
    ctx.globalAlpha = (1-k)*0.8;
    ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, 6.2832);
    ctx.fillStyle = "#FFA24E"; ctx.fill();
    ctx.globalAlpha = 1-k;
    ctx.strokeStyle = "#FFE7C0"; ctx.lineWidth = 3 + (1-k)*6;
    ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = Math.max(0, 1 - k*2.3);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r*0.55*(1 - k*0.5), 0, 6.2832);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  const k = clamp(o.t/1.6, 0, 1);                            /* scorched ground */
  ctx.save();
  ctx.globalAlpha = 0.6*(1-k);
  ctx.fillStyle = "#0E0A12"; blob(o.x, o.y, o.r*0.78, o.s);
  ctx.globalAlpha = 0.32*(1-k);
  ctx.fillStyle = "#C6482A"; blob(o.x, o.y, o.r*0.4, o.s + 0.3);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawWeed(o){
  const a = Math.min(1, o.age/0.45);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath();
  if(ctx.ellipse) ctx.ellipse(o.x + 3, o.y + o.r*0.55, o.r*0.92, o.r*0.34, 0, 0, 6.2832);
  else ctx.arc(o.x + 3, o.y + o.r*0.55, o.r*0.6, 0, 6.2832);
  ctx.fillStyle = "rgba(60,44,22,0.24)"; ctx.fill();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#8E7043"; ctx.lineWidth = 2.1;
  for(let i=0;i<9;i++){
    const ang = (i/9)*6.2832 + ((o.s*77.3 + i*13.71) % 1)*0.55;
    const rr = o.r*(0.5 + ((o.s*41.1 + i*29.13) % 1)*0.52);
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang)*rr*0.12, Math.sin(ang)*rr*0.12);
    ctx.lineTo(Math.cos(ang)*rr, Math.sin(ang)*rr);
    ctx.lineTo(Math.cos(ang + 0.75)*rr*0.72, Math.sin(ang + 0.75)*rr*0.72);
    ctx.stroke();
  }
  ctx.strokeStyle = "#C2A067"; ctx.lineWidth = 1.4;
  for(let i=0;i<3;i++){
    ctx.beginPath(); ctx.arc(0, 0, o.r*(0.62 + i*0.16), i*1.7, i*1.7 + 4.2); ctx.stroke();
  }
  ctx.restore();
}

/* How far above its own mark a trap actually puts ink on the screen. Only the
   meteor reaches: the rock comes in three hundred pixels up with a fire trail
   above that again, so a cull that read the ring alone threw the rock away on
   any screen whose window the landing spot had already left. That is never
   player one - the mark is always at or above their row - which is the whole
   reason this only ever showed up on somebody else's half of the split. */
function trapReach(o){
  return o.kind === "meteor" ? METEOR_ALT + 190 + o.mr*1.6 : 40;
}
function drawTraps(id){
  for(let i=0;i<G.traps.length;i++){
    const o = G.traps[i];
    if(o.b !== id) continue;
    const up = trapReach(o), down = (o.r || o.ry || 0) + 60;
    if(o.y - up > CB || o.y + down < CT) continue;
    if(o.kind === "puddle") drawPuddle(o);
    else if(o.kind === "meteor") drawMeteor(o);
    else drawWeed(o);
  }
}

/* ---- the meeting point of two tracks ---- */
function seamClip(above){
  const p = G.seamPts;
  if(!p.length) buildSeamShape();
  const n = G.seamPts.length, y = G.seam, far = above ? CT - 900 : CB + 900;
  ctx.beginPath();
  ctx.moveTo(0, far);
  ctx.lineTo(0, y + G.seamPts[0].o);
  for(let i=0;i<n-1;i++){
    const mx = (G.seamPts[i].x + G.seamPts[i+1].x)/2;
    const my = y + (G.seamPts[i].o + G.seamPts[i+1].o)/2;
    ctx.quadraticCurveTo(G.seamPts[i].x, y + G.seamPts[i].o, mx, my);
  }
  ctx.lineTo(W, y + G.seamPts[n-1].o);
  ctx.lineTo(W, far);
  ctx.closePath();
  ctx.clip();
}

function drawGroundLayer(id, mode){
  ctx.save();
  if(mode) seamClip(mode === "above");
  ctx.fillStyle = TRACKS[id].ground;
  ctx.fillRect(0, CT, W, CB - CT);
  ctx.restore();
}

function drawWorldLayer(id, mode){
  const T = TRACKS[id];
  ctx.save();
  if(mode) seamClip(mode === "above");
  drawSide(0, id); drawSide(1, id);
  drawRoad(id, T);
  drawEdges(id, T);
  drawMarks(id, T);
  drawFeatures(id);
  drawFinish();
  drawTraps(id);
  drawProps(id);
  ctx.restore();
}

function blob(x, y, r, s){
  ctx.beginPath();
  for(let i=0;i<7;i++){
    const a = (i/7)*6.2832;
    const rr2 = r*(0.6 + ((s*97.1 + i*29.37) % 1)*0.66);
    const px = x + Math.cos(a)*rr2, py = y + Math.sin(a)*rr2*0.7;
    if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* each ground creeps into the other before giving way completely */
function drawBlend(){
  const oldG = TRACKS[G.biome].ground, newG = TRACKS[G.next].ground;
  for(let i=0;i<G.seamBits.length;i++){
    const b = G.seamBits[i];
    const y = G.seam + b.dy;
    if(y < CT-50 || y > CB+50) continue;
    const f = 1 - Math.abs(b.dy)/190;
    if(f <= 0.02) continue;
    ctx.globalAlpha = 0.1 + f*0.85;
    ctx.fillStyle = b.dy < 0 ? oldG : newG;
    blob(b.x, y, b.r*(0.4 + f*0.8), b.s);
  }
  ctx.globalAlpha = 1;
}

/* the driving surface changes over a stretch rather than at a step */
function drawRoadFade(){
  const oldR = TRACKS[G.biome].road, newR = TRACKS[G.next].road, y = G.seam, d = 84;
  const down = ctx.createLinearGradient(0, y, 0, y + d);
  down.addColorStop(0, withA(newR, 0.5)); down.addColorStop(1, withA(newR, 0));
  ctx.fillStyle = down; ctx.fillRect(roadX, y, roadW, d);
  const up = ctx.createLinearGradient(0, y, 0, y - d);
  up.addColorStop(0, withA(oldR, 0.5)); up.addColorStop(1, withA(oldR, 0));
  ctx.fillStyle = up; ctx.fillRect(roadX, y - d, roadW, d);
}


/* ---- the alternate form's trail ---------------------------------
   Nodes are world positions dropped behind the craft by update code and aged
   there; this only looks at them. The line is drawn oldest-first so newer
   sections lie over older ones, and each segment is faded and narrowed by the
   age of the node it ends at - so what is left behind thins out and goes
   rather than being cut off at a hard edge.

   Drawn lightened, in three passes from a wide soft cyan haze down to a
   white-hot core, which is what makes it read as energy rather than as paint.
   Nothing here is on a clock, so reduced motion keeps the whole trail: it is
   where the car has been, and that is information, not decoration. */
const TRAIL_PASSES = [
  { w:2.30, a:0.16, hot:false },   /* outer haze, in the car's own cyan */
  { w:1.00, a:0.46, hot:false },   /* the electric blue body of it */
  { w:0.30, a:0.80, hot:true }     /* and the white-hot core */
];
function drawRacerTrail(who){
  const o = who === "me" ? G : who;
  const t = o && o.trail;
  if(!t || t.length < 2) return;
  const model = CARS[o.car];
  if(!model) return;
  const cool = model.flame ? model.flame[0] : "#2E9BFF";
  const hot = model.flame ? model.flame[1] : "#FFFFFF";
  const wide = racerDims(who).w*0.17;
  /* While the craft is still laying it, the line runs all the way to the
     emitter rather than stopping at the last node it dropped - otherwise the
     trail is a hand's width behind the tail at racing speed. */
  const live = neelaFormActive(who) ? racerTailPoint(who) : null;
  const n = t.length + (live ? 1 : 0);
  const at = function(i){ return i < t.length ? t[i] : live; };
  const ageOf = function(i){
    return i < t.length ? clamp(t[i].life/t[i].max, 0, 1) : 1;
  };
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  /* Butt caps, not round: every segment already ends where the next begins, so
     a cap on each one only stacks discs along the line and scallops it. */
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  for(let pass=0;pass<TRAIL_PASSES.length;pass++){
    const P = TRAIL_PASSES[pass];
    ctx.strokeStyle = P.hot ? hot : cool;
    for(let i=1;i<n;i++){
      const a = at(i-1), b = at(i);
      if(!a || !b) continue;
      if((a.y < CT - 140 && b.y < CT - 140) || (a.y > CB + 140 && b.y > CB + 140)) continue;
      /* How much of this node is left, and how far down the line it is: the
         first fades it out, the second draws it to a point at the old end. */
      const k = ageOf(i);
      const wk = (0.30 + (i/n)*0.70)*k;
      if(wk <= 0.02) continue;
      ctx.globalAlpha = P.a*k*k;
      ctx.lineWidth = Math.max(0.6, wide*P.w*wk);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
/* Every trail on the road, under the cars that are laying them. */
function drawTrails(){
  drawRacerTrail("me");
  for(let i=0;i<G.rivals.length;i++) drawRacerTrail(G.rivals[i]);
}

/* ================================================================
   THE NOTES
   ================================================================
   Two world effects out of two images, and between them the whole of what
   Lolanthe's ultimate looks like: one note above the car that is doing it, and
   three around every car it has taken.

   Everything moving in here is read off the clock or off a timer the update
   code advances, exactly as the exhaust pulse and Flann's body fire are.
   Nothing is stored, nothing is seeded and no race state is touched, so
   drawing the same frame twice draws the same notes - and none of it is
   collision geometry: the hull a racer is collided at is racerModel()'s and is
   not affected by anything below.

   Reduced motion keeps both effects on screen and takes the movement out of
   them: the queen note stops rising and falling and the three stop turning.
   The pops are ramps rather than oscillations, so they are the same either
   way - an effect appearing is not motion anybody asked to be spared. */

/* How far in these notes are: the entrance ramping up, a flat 1 while they are
   simply there, and the exit ramping back down. Derived from the two timers
   and the state that owns them, so a timer merely being reset - which is what
   a racer held inside the aura gets every frame - leaves this sitting at 1
   rather than replaying the entrance. */
function noteFade(on, popT, outT, span){
  if(on) return span > 0 ? clamp(1 - (popT || 0)/span, 0, 1) : 1;
  return span > 0 ? clamp((outT || 0)/span, 0, 1) : 0;
}
/* A pop rather than a fade-up: it comes in small, swells a shade past its size
   and settles on it. On the way out it simply shrinks back, because a note
   going away should not draw attention to itself on the way. */
function popScale(k, entering){
  return 0.30 + 0.70*k + (entering ? 0.28*Math.sin(k*Math.PI) : 0);
}
/* One note, upright, centred on a point in the world. Square artwork, drawn at
   one size, with its own save/restore so nothing it does reaches the next
   thing drawn. */
function drawNoteImg(img, x, y, size, alpha){
  if(!img || !(size > 0) || alpha <= 0.004) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(img, x - size/2, y - size/2, size, size);
  ctx.restore();
}

/* Lolanthe's own note. Anchored off racerDims() rather than off carW, so it
   sits the same distance above a Lolanthe at any viewport size and in any
   split-screen column - and drawn in the world rather than in the car's
   rotated space, so it stays upright through a lane change instead of leaning
   with the steering. */
function drawQueenNote(who, cx, cy, alpha){
  const o = who === "me" ? G : who;
  if(!o) return;
  const on = lolantheUltActive(who);
  const k = noteFade(on, o.queenPop, o.queenOut, QUEEN_POP);
  if(k <= 0) return;
  const img = fxImage(QUEEN_NOTE_IMG);
  if(!img) return;
  const d = racerDims(who);
  const bob = motionReduced() ? 0
            : Math.sin(performance.now()/1000*6.2832/QUEEN_BOB_RATE)*d.h*QUEEN_BOB;
  drawNoteImg(img, cx, cy - d.h*QUEEN_LIFT + bob,
              d.h*QUEEN_NOTE_K*popScale(k, on), k*(alpha === undefined ? 1 : alpha));
}
/* And the three around a Mind Controlled racer. A third of a turn apart on a
   ring measured off that racer's own box, so they surround a Lolanthe, a
   Neela, a Flann, a Verdant, a Rhosyn and a Saffron alike. No rise and fall: that
   belongs to the queen note and is what tells the two effects apart at a
   glance. */
function drawMindNotes(who, cx, cy, alpha){
  const o = who === "me" ? G : who;
  if(!o) return;
  const on = (o.mindT || 0) > 0;
  const k = noteFade(on, o.mindPop, o.mindOut, MIND_POP);
  if(k <= 0) return;
  const img = fxImage(MIND_NOTE_IMG);
  if(!img) return;
  const d = racerDims(who);
  const rx = d.w*MIND_ORBIT_X, ry = d.h*MIND_ORBIT_Y;
  const size = d.h*MIND_NOTE_K*popScale(k, on);
  const spin = motionReduced() ? 0 : performance.now()/1000*MIND_ORBIT*6.2832;
  const a = k*(alpha === undefined ? 1 : alpha);
  /* An exact third of a turn each, so the ring is even rather than nearly
     even - the rounded tau the rest of the file spells its circles with is a
     hundredth of a degree out, which shows up as a lopsided triangle. */
  for(let i=0;i<3;i++){
    const t = spin + i*(Math.PI*2/3);
    drawNoteImg(img, cx + Math.cos(t)*rx, cy + Math.sin(t)*ry, size, a);
  }
}
/* Both of them, in the order the car effects are drawn: over the body and
   under the seat flag and the Condition badges. A racer can wear both at once
   - a Lolanthe taken by another Lolanthe is a note above and three around. */
function drawRacerNotes(who, cx, cy, alpha){
  drawQueenNote(who, cx, cy, alpha);
  drawMindNotes(who, cx, cy, alpha);
}

/* ================================================================
   AERO-GLOW  -  one racer's private world
   ================================================================
   What Rhosyn's own driver is shown while its ultimate is running. It is a
   view and nothing else: everything below reads canonical race state and
   writes none of it, so drawing this frame twice draws the same frame and the
   race underneath is entirely unaware of it.

   In particular it is not a track. G.biome, G.next, G.seam and G.trackT are
   untouched and go on meaning what they always meant - which is the whole
   reason the driver can come out of here into whichever biome the race has
   actually reached rather than the one it left.

   Everything that moves is derived from how far the owner has itself travelled
   down the canonical road, so the void runs past at exactly the pace the racer
   is really covering ground: double, under the ultimate, and faster again on a
   boost. There is no clock in it, which is what keeps it deterministic.

   The palette is deliberately nothing the shared world has: near-total black,
   with hot magenta as the only light in it. */
const AERO_VOID = "#04010A";              /* the black the whole world sits on */
const AERO_PINK = "#FF2E9E";              /* the one colour in it */
const AERO_PALE = "#FFA8DA";              /* and its highlight */
const AERO_HORIZON = 0.13;                /* where the vanishing point sits, in view heights */
const AERO_RIBBON = 190;                  /* px of travel between two route markers */
const AERO_MOTES = 34;                    /* luminous specks adrift in the void */

/* How far this racer has travelled down the canonical road, in road pixels.
   Read straight off the one distance the race keeps for it, so a metre covered
   in here is the same metre everybody else's world moved by. */
function aeroTravel(who){
  return (who === "me" ? G.meters : metersOf(who))/0.075;
}
/* Its canonical pace, for how hard the void streaks. */
function aeroPace(who){
  const o = who === "me" ? G : who;
  return who === "me" ? G.speed : Math.abs(o.abs || 0);
}
/* One deterministic number per index, so the motes and the distant shapes are
   scattered rather than ruled and are in the same places every time. */
function aeroSeed(i, salt){
  const v = Math.sin(i*12.9898 + salt*78.233)*43758.5453;
  return v - Math.floor(v);
}

/* The void itself: black everywhere, with a band of magenta bleeding off the
   horizon and nothing else. The band is deliberately tight - the world has to
   read as near-total black with one light in it, so a wash over half the view
   would make it a purple sky rather than a void. */
function aeroBackdrop(top, height, horizon){
  ctx.fillStyle = AERO_VOID;
  ctx.fillRect(0, top, W, height);
  const haze = ctx.createLinearGradient(0, horizon - height*0.20, 0, horizon + height*0.13);
  haze.addColorStop(0,    withA(AERO_PINK, 0));
  haze.addColorStop(0.46, withA(AERO_PINK, 0.10));
  haze.addColorStop(0.62, withA(AERO_PINK, 0.24));
  haze.addColorStop(0.72, withA(AERO_PALE, 0.15));
  haze.addColorStop(1,    withA(AERO_PINK, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, top, W, height);
  /* and the foreground sunk back into the black it came out of */
  const sink = ctx.createLinearGradient(0, horizon + height*0.30, 0, top + height);
  sink.addColorStop(0, "rgba(0,0,0,0)");
  sink.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = sink;
  ctx.fillRect(0, horizon, W, top + height - horizon);
  /* the line the whole world converges on */
  ctx.fillStyle = withA(AERO_PALE, 0.5);
  ctx.fillRect(0, horizon, W, 1);
}

/* Perspective traces: straight lines out of the vanishing point, sweeping
   outward as the racer advances. They are what says "forward" in a world with
   no scenery to pass. */
function aeroTraces(top, height, horizon, travel){
  const n = 16;
  ctx.save();
  ctx.lineCap = "round";
  for(let i=0;i<n;i++){
    /* Each trace walks from the vanishing point to the bottom of the view and
       starts again, offset so the sixteen of them are spread through the
       cycle rather than arriving together. */
    const k = ((travel/1400 + i/n) % 1 + 1) % 1;
    const reach = k*k;                        /* accelerating out of the distance */
    const spread = (aeroSeed(i, 3) - 0.5)*2.6;
    const y0 = horizon + (top + height - horizon)*reach*0.24;
    const y1 = horizon + (top + height - horizon)*Math.min(1, reach*1.15 + 0.06);
    const x0 = W/2 + spread*W*reach*0.24;
    const x1 = W/2 + spread*W*Math.min(1.4, reach*1.15 + 0.06);
    ctx.strokeStyle = withA(i % 3 ? AERO_PINK : AERO_PALE, 0.10 + (1 - reach)*0.30);
    ctx.lineWidth = Math.max(1, SCENE*(0.6 + reach*2.6));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}

/* The route. Not a road - there is no tarmac in here - but the three lanes
   the racer is genuinely still steering between, drawn as glowing ribbons so
   the controls keep meaning what they mean on the shared road. */
/* Adapted from Ponu js/14-rendering.js: 3.4m rungs, 2.2m divider rhythm.
   Canonical metres drive every world mark; rendering never advances a clock. */
const AERO_RUNG_M = 3.4, AERO_DASH_M = 2.2;
function aeroEachRung(stepM, top, height, travel, draw){
  const gap = stepM/.075, bottom = top+height;
  const origin = racerY(VOWN) + travel;
  const first = Math.floor((origin-bottom)/gap);
  const last = Math.ceil((origin-top)/gap);
  for(let k=first;k<=last;k++) draw(origin-k*gap, k);
}
function aeroRoute(top, height, horizon, travel){
  const lw = Math.max(1, SCENE*1.2);
  const pace = clamp((aeroPace(VOWN)-260)/900,0,1);
  const o = VOWN === "me" ? G : VOWN;
  ctx.save();
  ctx.beginPath(); ctx.rect(roadX,top,roadW,height); ctx.clip();
  ctx.fillStyle = "#100610"; ctx.fillRect(roadX,top,roadW,height);
  ctx.fillStyle = withA(AERO_PINK,.09);
  ctx.fillRect(o.x-laneW/2,top,laneW,height);
  aeroEachRung(AERO_RUNG_M,top,height,travel,function(y,k){
    const strong = k%4 === 0;
    ctx.fillStyle = withA(AERO_PALE,strong ? .30 : .11);
    for(let c=0;c<3;c++) ctx.fillRect(roadX+c*laneW+laneW*.16,y,laneW*.68,strong ? lw*1.5 : lw);
  });
  ctx.strokeStyle = withA(AERO_PINK,.22); ctx.lineWidth = lw;
  for(let c=1;c<3;c++){
    const x=roadX+c*laneW;
    ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,top+height); ctx.stroke();
  }
  aeroEachRung(AERO_DASH_M,top,height,travel,function(y){
    ctx.fillStyle = withA(AERO_PALE,.70);
    for(let c=1;c<3;c++) ctx.fillRect(roadX+c*laneW-lw/2,y,lw,AERO_DASH_M/.075*.55);
  });
  // Pink specks and speed streaks inherit world motion, with no random flicker.
  aeroMotes(top,height,top,travel,motionReduced() ? 0 : pace*46*SCENE);
  for(let side=0;side<2;side++){
    const x=roadX+side*roadW, width=roadW*(.06+.05*pace);
    const g=ctx.createLinearGradient(x,0,x+(side ? -width : width),0);
    g.addColorStop(0,withA(AERO_PINK,.14+.18*pace)); g.addColorStop(1,withA(AERO_PINK,0));
    ctx.fillStyle=g; ctx.fillRect(side ? x-width : x,top,width,height);
  }
  const fade=ctx.createLinearGradient(0,top,0,top+height*.22);
  fade.addColorStop(0,AERO_VOID); fade.addColorStop(.5,withA(AERO_PINK,.08)); fade.addColorStop(1,"rgba(4,1,10,0)");
  ctx.fillStyle=fade; ctx.fillRect(roadX,top,roadW,height*.22);
  ctx.restore();
}

/* Sparse luminous specks adrift in the void, and a few distant bars that pass
   far out to the sides. Both scroll off the same travel figure, so nothing in
   here moves on a clock. */
function aeroMotes(top, height, horizon, travel, streak){
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const span = height + 200;
  for(let i=0;i<AERO_MOTES;i++){
    const depth = 0.25 + aeroSeed(i, 1)*0.75;
    const y = top - 100 + (((travel*depth*0.55 + aeroSeed(i, 2)*span) % span) + span) % span;
    if(y < horizon) continue;
    const x = aeroSeed(i, 5)*W;
    const r = SCENE*(0.7 + depth*2.2);
    const len = depth*streak;
    ctx.fillStyle = withA(i % 4 ? AERO_PINK : AERO_PALE, 0.22 + depth*0.5);
    ctx.fillRect(x - r*0.5, y - len, r, r + len);
  }
  ctx.restore();
}

/* The world's name, low-key and inside the view it belongs to. Deliberately
   drawn here rather than written into #trackName: that element is the page's
   single HUD, and in split-screen it belongs to whoever is not in here. */
function aeroName(top, horizon){
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "600 " + Math.round(clamp(13*SCENE, 10, 20)) + "px " + HUD_DISPLAY;
  ctx.fillStyle = withA(AERO_PALE, 0.62);
  trackText(t("aeroGlow").toUpperCase(), W/2, horizon - 18*SCENE, 4, "center");
  ctx.restore();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

/* One frame of Aero-Glow, for the one racer it belongs to. Called instead of
   the shared world's layers, so none of the shared world's contents - other
   racers, their exhaust, their Conditions, their notes, scenery, tumbleweeds,
   meteors, puddles, bubbles, oil, seekers, collision sparks - is drawn here at
   all. The only body in this world is the one driving through it. */
function drawAeroGlowWorld(){
  const who = VOWN;
  const o = who === "me" ? G : who;
  if(!o) return;
  const top = CT, height = CB - CT;
  const horizon = top + height*AERO_HORIZON;
  const travel = aeroTravel(who);
  /* how far a speck smears, off the owner's canonical pace */
  const streak = clamp((aeroPace(who) - 260)/900, 0, 1)*46*SCENE;

  aeroBackdrop(top, height, horizon);
  aeroRoute(top, height, horizon, travel);
  aeroName(top, horizon);

  /* And the car, at its canonical lane, x and tilt - the same numbers the
     shared renderer would have drawn it at, because they are the same numbers.
     Its own view draws it whole: the fade the rest of the field watched it
     leave through is theirs, not its driver's. */
  const model = racerModel(who);
  const d = racerDims(who);
  const x = who === "me" ? G.x : o.x, y = who === "me" ? playerY : o.y;
  drawCar(x, y, d.w, d.h, model, o.tilt, true,
          o.boosting || o.ultOn, false, morphFlash(who), 1);
  ctx.globalAlpha = 1;
}

/* ---- the white transition ---------------------------------------
   Belongs to a view, not to the canvas: it is drawn over one column, after
   that column's road and after that column's instruments, so the whole of one
   person's game disappears and nobody else's does. On one screen the
   instruments are in the page rather than on the canvas, so the shell hides
   them for as long as this is running - see paintHUD().

   It comes up fast and goes out over the tail of the timer, which reads as a
   flash rather than as a curtain. */
function whiteoutAlpha(who){
  const o = who === "me" ? G : who;
  if(!o || !(o.whiteT > 0)) return 0;
  const k = clamp(o.whiteT/WHITEOUT_TIME, 0, 1);
  /* full white for the first half, then out */
  return k > 0.5 ? 1 : k*2;
}
function drawWhiteout(who){
  const a = whiteoutAlpha(who);
  if(a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* One frame. In a normal game that is one view of the world; in local play it
   is one view per person, cut into equal columns and each shifted so its own
   car sits where player one's sits in theirs. */
let shakeX = 0, shakeY = 0;
function render(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, FULLW || W, H);
  if(G.shake > 0.2){
    shakeX = rand(-G.shake, G.shake)*0.5;
    shakeY = rand(-G.shake, G.shake)*0.5;
  } else shakeX = shakeY = 0;
  if(!G.local || G.humans.length < 2){
    VOWN = "me";
    renderView(camDy("me"));
    /* One screen, one owner: the white goes over the road here and the page's
       own instruments are taken out of the way by paintHUD(). */
    drawWhiteout("me");
    return;
  }
  for(let i=0;i<G.humans.length;i++){
    const who = G.humans[i];
    ctx.save();
    ctx.beginPath(); ctx.rect(i*W, 0, W, H); ctx.clip();
    ctx.translate(i*W, 0);
    VOWN = who;
    renderView(camDy(who));
    drawSeatHud(who, i);
    /* After this column's road AND this column's instruments, so the whole of
       one person's game goes white - and inside the clip, so nobody else's
       column is touched by it. */
    drawWhiteout(who);
    ctx.restore();
  }
  VOWN = "me"; CAMDY = 0; CT = 0; CB = H;
  drawSplitEdges();
}

/* Draw flight after every road object. Shadows retain canonical lane position. */
function drawAirborneRacers(){
  for(const a of racers()){
    const who = a.me ? "me" : a.obj, o = a.me ? G : a.obj;
    if(!saffronAirborne(who) || o.dead > 0 || o.finished !== null) continue;
    const d = racerDims(who), altitude = saffronAltitude(who);
    const y = racerY(who), alpha = racerViewAlpha(who);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + (.32-.12*o.saffronLift) + ")";
    ctx.beginPath(); ctx.ellipse(o.x, y, d.w*.42, carH*.20, o.tilt || 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#FFBA62"; ctx.lineWidth = Math.max(1, SCENE);
    ctx.beginPath(); ctx.ellipse(o.x, y, carW*.27, carH*.10, 0, 0, Math.PI*2); ctx.stroke();
    drawCar(o.x, y-altitude, d.w, d.h, racerModel(who), o.tilt, true,
            o.boosting || o.ultOn, false, morphFlash(who), alpha, true);
    drawRacerNotes(who, o.x, y-altitude, alpha);
    if(G.local && (a.me || o.human)) drawSeatMark(who, o.x, y-altitude, alpha);
    if(VOWN !== who) drawConditionStack(who, o.x, y-altitude, alpha);
    drawShieldHit(who, o.x, y-altitude, alpha);
    ctx.restore();
  }
}

function renderView(dy){
  CAMDY = dy; CT = -dy; CB = -dy + H;
  ctx.save();
  if(shakeX || shakeY) ctx.translate(shakeX, shakeY);
  ctx.save();
  ctx.translate(0, dy);          /* out of the master frame and into this one */

  /* One view of the world, or the other. The owner of a Rhosyn that is away in
     Aero-Glow is shown its private world in place of the shared one - and this
     is the whole of the difference, per view: the biome, the seam, the field
     and the race itself are all exactly where they were and go on exactly as
     they were, which is why the branch below can simply be taken again the
     other way when the fifteen seconds are up. Every other column carries on
     drawing the real race at the same time. */
  if(aeroGlowViewActive(VOWN)){
    drawAeroGlowWorld();
    ctx.restore();
    drawGlassLayer();
    ctx.restore();
    return;
  }

  if(G.seam === null){
    drawGroundLayer(G.biome, null);
    drawWorldLayer(G.biome, null);
  } else {
    drawGroundLayer(G.next, "above");
    drawGroundLayer(G.biome, "below");
    drawBlend();
    drawWorldLayer(G.next, "above");
    drawWorldLayer(G.biome, "below");
    drawRoadFade();
  }

  /* Laid on the road and under everything that is standing on it, so a car
     is never drawn behind its own trail. */
  drawTrails();

  /* Every car that is not this view's owner wears its Conditions beside it;
     the owner's own go in the corner of the view's HUD instead, so nobody has
     badges floating over the car they are actually driving. The badges are
     drawn after the blink test rather than inside it, because a blinking car
     must not take its Invulnerable badge off the screen nine times a second. */
  for(let n=0;n<G.rivals.length;n++){
    const RV = G.rivals[n];
    if(G.state === "idle" || RV.dead > 0 || saffronAirborne(RV)) continue;
    const rc = racerModel(RV);
    const rblink = RV.invuln > 0 && Math.floor(RV.invuln*9) % 2 === 0;
    /* How much of this car this particular view is allowed to see. It is 1 for
       every racer and every view but one: an ulting Verdant, which its own
       driver's column draws at half and every other column draws at nothing.
       Everything pinned to the car reads the same number, so an invisible car
       cannot be given away by its own exhaust, its seat flag or its badges. */
    const ra = racerViewAlpha(RV);
    if(!rblink && ra > 0.004){
      const rd = racerDims(RV);
      drawCar(RV.x, RV.y, rd.w, rd.h, rc, RV.tilt, true,
              RV.boosting || RV.ultOn, flannUltActive(RV), morphFlash(RV), ra);
      ctx.globalAlpha = 1;
      drawRacerNotes(RV, RV.x, RV.y, ra);
      if(G.local && RV.human) drawSeatMark(RV, RV.x, RV.y, ra);
    }
    if(VOWN !== RV && ra > 0.004) drawConditionStack(RV, RV.x, RV.y, ra);
    drawShieldHit(RV, RV.x, RV.y, ra);
  }

  const blink = G.invuln > 0 && Math.floor(G.invuln*9) % 2 === 0;
  const meSeen = !G.local || (playerY >= CT - carH*2 && playerY <= CB + carH*2);
  if(G.state !== "idle" && G.dead <= 0 && meSeen && !saffronAirborne("me")){
    const car = racerModel("me");
    const ma = racerViewAlpha("me");
    if(!blink && ma > 0.004){
      const cd = racerDims("me");
      drawCar(G.x, playerY, cd.w, cd.h, car, G.tilt, true,
              G.boosting || G.ultOn, flannUltActive("me"), morphFlash("me"), ma);
      ctx.globalAlpha = 1;
      drawRacerNotes("me", G.x, playerY, ma);
      if(G.local) drawSeatMark("me", G.x, playerY, ma);
    }
    if(VOWN !== "me" && ma > 0.004) drawConditionStack("me", G.x, playerY, ma);
    drawShieldHit("me", G.x, playerY, ma);
  }

  for(let i=0;i<G.fx.length;i++){
    const f = G.fx[i];
    ctx.globalAlpha = clamp(f.life/f.max, 0, 1);
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832);
    ctx.fillStyle = f.c; ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* the faster the road, the harder it streaks - and it flares for a moment
     each time the pace steps up, so the change is felt as well as measured */
  const flare = clamp(G.stepFlash, 0, 1);
  const sr = clamp((G.speed - BASE_SPEED)/(BASE_SPEED*(MAX_MULT - 1)), 0, 1) + flare*0.5;
  if(sr > 0.02){
    ctx.strokeStyle = "rgba(255,255,255," + Math.min(0.42, 0.05 + sr*0.2).toFixed(3) + ")";
    ctx.lineWidth = 2;
    const streaks = 9 + Math.round(sr*10);
    for(let i=0;i<streaks;i++){
      const x = roadX + ((i*137 + (G.scroll*0.5)) % roadW);
      const y = (i*211 + G.scroll*1.6) % (H+240) - 120;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40 + sr*120); ctx.stroke();
    }
  }

  drawSlicks();
  drawBubbles();
  drawMissiles();
  drawAirborneRacers();
  ctx.restore();                 /* back to the screen this view is drawn on */
  drawGlassLayer();
  ctx.restore();
}

/* Everything on the glass rather than on the road, so it does not move with
   the camera - and it belongs to whoever is looking through this particular
   window. Both worlds end with it: the instruments, the running order and the
   water on the screen are facts about the driver rather than about which world
   that driver is being shown, and the ultimate meter counting Aero-Glow down is
   the clearest of them. */
/* One deterministic light, computed from simulation age and a fixed spatial sequence.
   Earlier circles keep their trajectory at higher severity: count, radius and
   opacity can then increase coverage without rearranging the whole effect.
   No persistent allocation, wall clock, random draws or gameplay writes. */
function dhavalLight(who, i, level, width, height, reduced){
  const o = who === "me" ? G : who;
  const spec = DHAVAL_LIGHT_LEVELS[level - 1];
  const seed = .137; // identical coverage for every car; age belongs to the victim
  const time = reduced ? 3 : (o.dhavalObscureAge || 0);
  const phase = i*2.399963 + seed*6.2832;
  const bx = ((i*.618034 + seed) % 1), by = ((i*.754878 + seed*.7) % 1);
  const drift = .065;
  const cycle = .5 + .5*Math.sin(time*.85 + phase);
  let pop = .90 + .10*Math.pow(cycle, 3);
  /* One in four lights actually appears and retires. Staggered multi-second
     lives, eased growth and a gentle exit avoid a synchronized flash. */
  if(i%4 === 3){
    const life = 6 + (i%3), age = (time + i*.83)%life;
    const enter = clamp(age/.45, 0, 1), leave = clamp((life-age)/.8, 0, 1);
    pop *= enter*enter*(3-2*enter)*leave*leave*(3-2*leave);
  }
  return {
    x:(bx + Math.sin(time*.28 + phase)*drift)*width,
    y:(by + Math.cos(time*.24 + phase)*drift)*height,
    r:Math.sqrt(width*height)*spec.radius*(.88 + .24*((i*.414214)%1))*pop,
    angle:phase + time*(i%2 ? .32 : -.28),
    alpha:spec.opacity,
    color:DHAVAL_LIGHT_COLORS[i%DHAVAL_LIGHT_COLORS.length]
  };
}
function drawDhavalObscurity(who){
  const level = dhavalObscureLevel(who);
  if(!level || rhosynUltActive(who) || rhosynElsewhere(who)) return;
  const reduced = motionReduced(), spec = DHAVAL_LIGHT_LEVELS[level - 1];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  for(let i=0;i<spec.count;i++){
    const p = dhavalLight(who, i, level, W, H, reduced);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.globalAlpha = p.alpha;
    /* A broad opaque core and short feather retain legibility as circles.
       The sweeping arc makes rotation visible even though the core is round. */
    const light = ctx.createRadialGradient(0,0,p.r*.65,0,0,p.r);
    light.addColorStop(0,p.color); light.addColorStop(.72,p.color);
    light.addColorStop(1,p.color + "00");
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = p.alpha*.48;
    ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = p.r*.045;
    ctx.beginPath(); ctx.arc(0,0,p.r*.77,-.8,.9); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawGlassLayer(){
  const o = VOWN === "me" ? G : VOWN;
  ctx.fillStyle = vign; ctx.fillRect(0,0,W,H);
  const blind = o.blind || 0;
  if(blind > 0) drawBlind(blind, o.blindPts);
  drawDhavalObscurity(VOWN);
  drawLadder();
}

function bubbleFlash(row){
  return row.blink > 0 && Math.sin(row.ph) <= -0.2 ? 0.14 : 1;
}
/* and it draws itself in a little as it goes */
function bubbleShrink(row){
  return row.blink > 0 ? 1 - (1 - clamp(row.blink/BUBBLE_BLINK, 0, 1))*0.18 : 1;
}
function drawBubbles(){
  for(let n=0;n<G.boxes.length;n++){
    const row = G.boxes[n];
    if(row.y < CT-80 || row.y > CB+80) continue;
    for(let l=0;l<3;l++){
      if(row.gone & (1 << l)) continue;                  /* collected: it is gone */
      const x = laneCX(l);
      const t = G.scroll*0.01 + l*2 + row.s*6;
      const y = row.y + Math.sin(t)*7;
      const r = bubbleR()*(1 + Math.sin(t*1.3)*0.045)*bubbleShrink(row);  /* breathes, then shrinks away */

      /* Every bubble still on the road is one you can still take, so none of
         them are drawn faded any more. They used to dim once you had taken one
         from the row, which was honest then and would be a lie now. */
      ctx.save();
      ctx.globalAlpha = bubbleFlash(row);

      const glow = ctx.createRadialGradient(x, y, r*0.6, x, y, r*1.6);
      glow.addColorStop(0, "rgba(180,225,255,0.30)");
      glow.addColorStop(1, "rgba(180,225,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - r*1.7, y - r*1.7, r*3.4, r*3.4);

      /* soap film: clear in the middle, bright at the edge */
      const film = ctx.createRadialGradient(x, y, r*0.2, x, y, r);
      film.addColorStop(0,    "rgba(255,255,255,0.05)");
      film.addColorStop(0.62, "rgba(190,230,255,0.14)");
      film.addColorStop(0.88, "rgba(255,255,255,0.42)");
      film.addColorStop(1,    "rgba(255,255,255,0.08)");
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = film; ctx.fill();

      /* thin-film colour sliding around the rim */
      ctx.lineWidth = 2.4;
      const tints = [withA(BUBBLE_TINTS.cyan, 0.85), withA(BUBBLE_TINTS.pink, 0.7), withA(BUBBLE_TINTS.yellow, 0.7)];
      for(let k=0;k<3;k++){
        ctx.beginPath();
        ctx.arc(x, y, r - 1, t*0.6 + k*2.1, t*0.6 + k*2.1 + 1.5);
        ctx.strokeStyle = tints[k]; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();

      /* highlights */
      ctx.beginPath();
      if(ctx.ellipse) ctx.ellipse(x - r*0.34, y - r*0.40, r*0.26, r*0.16, -0.7, 0, 6.2832);
      else ctx.arc(x - r*0.34, y - r*0.40, r*0.2, 0, 6.2832);
      ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill();
      ctx.beginPath(); ctx.arc(x + r*0.42, y + r*0.34, r*0.1, 0, 6.2832);
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();

      /* the question mark, readable over any track */
      ctx.font = "700 " + Math.round(r*1.15) + "px Archivo, Arial Narrow, Helvetica, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 3.5; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(11,11,12,0.72)";
      ctx.strokeText("?", x, y + 1);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("?", x, y + 1);
      ctx.restore();
    }
  }
}

function slickPath(o, k){
  const pts=slickOutline(o,k);
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){
    if(i === 0) ctx.moveTo(pts[i].x,pts[i].y); else ctx.lineTo(pts[i].x,pts[i].y);
  }
  ctx.closePath();
}

/* Tarmac is near enough black on all three tracks - city 16171B, space 0D0D15 -
   and the slick used to be painted black on top of it, so there was barely a
   pixel of difference to see. It is lit rather than darkened now: the body stays
   dark, but a full oil-film rainbow and a bright wet edge do the reading, and
   light on dark works whatever the road under it is doing. The rim is stroked on
   the k=1 outline, which is the same curve slickHits tests, so the bright line
   you swerve around is exactly the line that catches you. */
function drawSlicks(){
  for(let i=0;i<G.slicks.length;i++){
    const o = G.slicks[i];
    if(o.y < CT-90 || o.y > CB+90) continue;
    const a = o.fade > 0 ? clamp(o.fade/OIL_FADE, 0, 1) : 1;
    /* a slow flare across the film, run off the slick's own clock and seed so
       no two pools shimmer together. It parks once the slick is spent, which is
       fine - by then the whole thing is fading out anyway. */
    const shim = 0.85 + 0.15*Math.sin(o.life*3.1 + o.s*6.2832);
    ctx.save();

    /* a soft shadow just proud of the pool, so the bright edge has something to
       sit against and the pale desert road still separates from it */
    ctx.globalAlpha = a*0.45;
    slickPath(o, 1.1);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill();

    /* body, then a darker pool inside it so the edge does not read flat */
    ctx.globalAlpha = a;
    slickPath(o, 1);
    ctx.fillStyle = "rgba(12,12,17,0.94)"; ctx.fill();
    slickPath(o, 0.6);
    ctx.fillStyle = "rgba(3,3,6,0.72)"; ctx.fill();

    /* the film: oil on wet tarmac throws a whole rainbow, violet through cyan
       and green into gold. This is the layer that actually carries the slick on
       a black road, so it is worth the extra stops. Thrown off-centre by the
       seed and clipped to the outline. */
    const ga = o.s*6.2832;
    const gx = o.x + Math.cos(ga)*o.rx*0.3, gy = o.y + Math.sin(ga)*o.ry*0.28;
    const gr = Math.max(o.rx, o.ry)*1.02;
    const sh = o.sheen*shim;
    const gl = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
    gl.addColorStop(0,    "rgba(232,186,255," + (0.66*sh).toFixed(3) + ")");
    gl.addColorStop(0.26, "rgba(126,192,255," + (0.54*sh).toFixed(3) + ")");
    gl.addColorStop(0.50, "rgba(112,236,192," + (0.42*sh).toFixed(3) + ")");
    gl.addColorStop(0.74, "rgba(244,206,116," + (0.32*sh).toFixed(3) + ")");
    gl.addColorStop(1,    "rgba(150,110,190,0)");
    slickPath(o, 0.98);
    ctx.fillStyle = gl; ctx.fill();

    /* the wet edge, right on the outline - what you catch out of the corner of
       your eye at racing speed, and a fainter one inside it for depth */
    ctx.lineJoin = "round";
    ctx.globalAlpha = a*0.72*shim;
    slickPath(o, 1);
    ctx.strokeStyle = "rgba(206,222,255,0.9)"; ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.globalAlpha = a*0.3;
    slickPath(o, 0.78);
    ctx.strokeStyle = "rgba(180,214,255,0.7)"; ctx.lineWidth = 1.1;
    ctx.stroke();

    /* droplets flung clear of the main body. The highlight is a crescent on the
       lit side, not a ring all the way round - a full outline at this size read
       as a little hollow bubble rather than a spot of oil. */
    for(let n=0;n<o.spots;n++){
      const ang = ((o.s*53.7 + n*39.13) % 1)*6.2832;
      const far = 1.2 + ((o.s*29.3 + n*17.71) % 1)*0.46;
      const rr  = 1.7 + ((o.s*71.9 + n*23.3) % 1)*3.2;
      const px = Math.cos(ang)*o.rx*far, py = Math.sin(ang)*o.ry*far;
      const ca = Math.cos(o.rot), sa2 = Math.sin(o.rot);
      const dx = o.x + px*ca - py*sa2, dy = o.y + px*sa2 + py*ca;
      ctx.globalAlpha = a*0.85;
      ctx.beginPath(); ctx.arc(dx, dy, rr, 0, 6.2832);
      ctx.fillStyle = "rgba(16,15,22,0.9)"; ctx.fill();
      ctx.globalAlpha = a*0.7*shim;
      ctx.beginPath(); ctx.arc(dx, dy, rr*0.86, ga - 1.15, ga + 1.15);
      ctx.strokeStyle = "rgba(198,216,255,0.9)"; ctx.lineWidth = 1.1;
      ctx.lineCap = "round"; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawMissiles(){
  const D = missileDims();
  const nose = -D.nose, tail = D.tail, hw = D.hw, fin = D.fin;
  for(let i=0;i<G.missiles.length;i++){
    const m = G.missiles[i];
    const a = m.fade > 0 ? clamp(m.fade/1.2, 0, 1) : 1;
    const ang = Math.atan2(m.vy, m.vx) + 1.5708;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(m.x, m.y); ctx.rotate(ang);

    /* the burn behind it */
    const gl = ctx.createRadialGradient(0, tail*1.05, hw*0.25, 0, tail*1.05, hw*2.6);
    gl.addColorStop(0, "rgba(255,196,120,0.55)");
    gl.addColorStop(1, "rgba(255,138,42,0)");
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, tail*1.05, hw*2.6, 0, 6.2832); ctx.fill();

    /* a shadow so it sits above the road rather than on it */
    ctx.globalAlpha = a*0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    if(ctx.ellipse) ctx.ellipse(hw*0.35, tail*0.30, hw*1.05, D.len*0.42, 0, 0, 6.2832);
    else ctx.arc(hw*0.35, tail*0.30, hw*1.05, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = a;

    /* fins under the body */
    ctx.fillStyle = "#5A6472";
    ctx.beginPath();
    ctx.moveTo(-hw*0.94, tail*0.02); ctx.lineTo(-fin, tail*0.96);
    ctx.lineTo(-hw*0.94, tail*0.88); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hw*0.94, tail*0.02); ctx.lineTo(fin, tail*0.96);
    ctx.lineTo(hw*0.94, tail*0.88); ctx.closePath(); ctx.fill();
    /* small forward canards, for the length */
    ctx.beginPath();
    ctx.moveTo(-hw*0.94, nose*0.44); ctx.lineTo(-fin*0.60, nose*0.18);
    ctx.lineTo(-hw*0.94, nose*0.10); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hw*0.94, nose*0.44); ctx.lineTo(fin*0.60, nose*0.18);
    ctx.lineTo(hw*0.94, nose*0.10); ctx.closePath(); ctx.fill();

    /* body */
    ctx.beginPath();
    ctx.moveTo(0, nose);
    ctx.lineTo(hw*0.62, nose*0.72);
    ctx.lineTo(hw, nose*0.40);
    ctx.lineTo(hw, tail);
    ctx.lineTo(-hw, tail);
    ctx.lineTo(-hw, nose*0.40);
    ctx.lineTo(-hw*0.62, nose*0.72);
    ctx.closePath();
    ctx.fillStyle = "#D8DEE6"; ctx.fill();

    /* red warhead */
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#E21B22";
    ctx.beginPath();
    ctx.moveTo(-hw*1.2, nose*1.1); ctx.lineTo(hw*1.2, nose*1.1);
    ctx.lineTo(hw*1.2, nose*0.22); ctx.lineTo(-hw*1.2, nose*0.22);
    ctx.closePath(); ctx.fill();
    /* a darker flank so the cylinder reads round */
    ctx.fillStyle = "rgba(16,17,22,0.16)";
    ctx.beginPath();
    ctx.moveTo(hw*0.42, nose*1.1); ctx.lineTo(hw*1.2, nose*1.1);
    ctx.lineTo(hw*1.2, tail); ctx.lineTo(hw*0.42, tail);
    ctx.closePath(); ctx.fill();
    /* panel lines */
    ctx.strokeStyle = "rgba(90,100,114,0.5)";
    ctx.lineWidth = Math.max(1.4, hw*0.10);
    ctx.beginPath(); ctx.moveTo(-hw, nose*0.06); ctx.lineTo(hw, nose*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hw, tail*0.44); ctx.lineTo(hw, tail*0.44); ctx.stroke();
    ctx.restore();

    /* thruster mouth */
    ctx.fillStyle = "#101116";
    ctx.beginPath();
    ctx.moveTo(-hw*0.74, tail); ctx.lineTo(hw*0.74, tail);
    ctx.lineTo(hw*0.54, tail - hw*0.40); ctx.lineTo(-hw*0.54, tail - hw*0.40);
    ctx.closePath(); ctx.fill();

    /* outline last, so the silhouette stays clean */
    ctx.beginPath();
    ctx.moveTo(0, nose);
    ctx.lineTo(hw*0.62, nose*0.72);
    ctx.lineTo(hw, nose*0.40);
    ctx.lineTo(hw, tail);
    ctx.lineTo(-hw, tail);
    ctx.lineTo(-hw, nose*0.40);
    ctx.lineTo(-hw*0.62, nose*0.72);
    ctx.closePath();
    ctx.strokeStyle = "#5A6472"; ctx.lineWidth = Math.max(2, hw*0.13); ctx.stroke();

    ctx.restore();
  }
}

function drawFinish(){
  if(!G.finishAt || !toFlag()) return;
  const y = playerY - (G.finishAt - G.meters)/0.075;
  if(y < CT-80 || y > CB+40) return;
  const n = 8, cw = roadW/n, rows = 3;
  for(let r=0;r<rows;r++)
    for(let c=0;c<n;c++){
      ctx.fillStyle = (r + c) % 2 ? "#F4F4F6" : "#0B0B0C";
      ctx.fillRect(roadX + c*cw, y + r*13, cw, 13);
    }
  ctx.fillStyle = "rgba(226,27,34,0.9)";
  ctx.fillRect(roadX, y - 5, roadW, 5);
}

/* Water thrown over the view, running off as it clears. */
function drawBlind(left, pts){
  const hold = BLIND_TIME - 0.55;
  const a = left > hold ? 1 : clamp(left/hold, 0, 1);
  pts = pts || [];
  ctx.globalAlpha = a*0.6;
  ctx.fillStyle = "#A8CDEA"; ctx.fillRect(0, 0, W, H);
  for(let i=0;i<pts.length;i++){
    const p = pts[i];
    const x = p.x*W, y = p.y*H, r = p.r*(0.75 + a*0.35);
    ctx.globalAlpha = a*0.85;
    ctx.beginPath();
    if(ctx.ellipse) ctx.ellipse(x, y, r, r*(0.6 + p.s*0.7), p.s*3, 0, 6.2832);
    else ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = "rgba(206,232,250,0.9)"; ctx.fill();
    ctx.globalAlpha = a*0.55;
    ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.34, r*0.34, 0, 6.2832);
    ctx.fillStyle = "#FFFFFF"; ctx.fill();
  }
  ctx.globalAlpha = 1;
}
