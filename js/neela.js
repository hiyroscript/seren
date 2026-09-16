"use strict";

/* SEREN - Neela compatibility layer.

   Phantom stays the internal slot so saved picks, grid ordering and existing
   markup remain compatible, but everything the player sees and everything the
   race draws is Neela. The installer runs after the rest of the deferred game
   scripts have declared their systems. */
function installNeela(){
  if(typeof CARS === "undefined" || !CARS.phantom || installNeela.done) return;
  installNeela.done = true;

  const NEELA_ID = "phantom";
  const WHITE_TIME = 0.78;
  const WHITE_HOLD = 0.32;
  const FADE_TIME = 0.62;
  const TRAIL_TIME = 3.2;
  const TRAIL_STEP = 0.018;
  const CAR_FALLBACK_HIT = [
    [-0.23,-0.45],[0.23,-0.45],[0.34,-0.31],[0.36,0.25],
    [0.27,0.45],[-0.27,0.45],[-0.36,0.25],[-0.34,-0.31]
  ];
  const MISSILE_FALLBACK_HIT = [
    [-0.13,-0.48],[0.13,-0.48],[0.20,-0.31],[0.20,0.37],
    [0.11,0.48],[-0.11,0.48],[-0.20,0.37],[-0.20,-0.31]
  ];
  let neelaCarHit = CAR_FALLBACK_HIT;
  let neelaMissileHit = MISSILE_FALLBACK_HIT;
  let missileBounds = [0.12, 0.04, 0.76, 0.92];
  const trail = [];
  let trailClock = 0;

  /* Visible copy. Keep the internal id stable, but no interface says Phantom. */
  if(typeof STR !== "undefined"){
    STR.phantom = {en:"Neela", fr:"Neela"};
    STR.phantomUlt = {
      en:"Transforms into a controllable heat-seeking form at double pace. Solid hazards are destroyed on contact, puddles still Obscure you, and striking a racer swaps their position with Neela's launch point before Neela returns to car form. The speed and hazard-breaking effect last until the meter empties.",
      fr:"Se transforme en forme autoguidée contrôlable à double allure. Les obstacles solides sont détruits au contact, les flaques vous Obscurcissent toujours, et percuter un concurrent échange sa position avec le point de lancement de Neela avant son retour en voiture. La vitesse et l'effet destructeur restent actifs jusqu'à l'épuisement de la jauge."
    };
  }

  const NP = CARS[NEELA_ID];
  NP.style = "sprite";
  NP.sprite = "v_neela.PNG";
  NP.spriteBounds = [0.12, 0.04, 0.76, 0.92];
  NP.exhaust = [[0.50, 0.93]];
  NP.hitShape = neelaCarHit;
  NP.flame = ["#39BFFF", "#E7FBFF"];
  NP.accent = "#48C9FF";

  function objOf(who){ return who === "me" ? G : who; }
  function neelaOwnerObj(){
    if(G.car === NEELA_ID) return G;
    for(let i=0;i<G.rivals.length;i++) if(G.rivals[i].car === NEELA_ID) return G.rivals[i];
    return null;
  }
  function neelaActive(who){
    const o = objOf(who);
    return !!o && o.car === NEELA_ID && !!o.ultOn;
  }
  function neelaMissile(who){
    const o = objOf(who);
    return neelaActive(who) && !!o.neelaMissile;
  }
  function posOf(who){
    const o = objOf(who);
    return {lane:o.lane, x:o.x, y:who === "me" ? playerY : o.y};
  }
  function setPos(who, p){
    const o = objOf(who);
    o.lane = clamp(p.lane, 0, 2);
    o.x = isFinite(p.x) ? p.x : laneCX(o.lane);
    if(who !== "me" && isFinite(p.y)) o.y = p.y;
    o.tilt = 0;
    o.bumpCD = Math.max(o.bumpCD || 0, 0.65);
    o.changeT = Math.max(o.changeT || 0, 0.28);
  }
  function flashWho(who){
    const o = objOf(who);
    o.neelaWhite = WHITE_TIME;
    o.neelaFade = FADE_TIME;
  }

  /* Load both vehicle images into the same cache the renderer already uses. */
  function ensureSprite(src, onload){
    let img = CAR_SPRITES[src];
    if(!img){
      img = new Image();
      CAR_SPRITES[src] = img;
      img.src = src;
    }
    const ready = function(){
      if(onload) onload(img);
      if(typeof paintCarIcons === "function") paintCarIcons();
    };
    if(img.complete && img.naturalWidth) ready();
    else img.addEventListener("load", ready, {once:true});
    return img;
  }

  /* Measure the real transparent PNG. The alpha scan supplies both the crop and
     a collision hull, keeping the visual model and contact geometry aligned. */
  function measureSprite(img){
    try{
      const maxW = 160, scale = Math.min(1, maxW/img.naturalWidth);
      const w = Math.max(4, Math.round(img.naturalWidth*scale));
      const h = Math.max(4, Math.round(img.naturalHeight*scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d", {willReadFrequently:true});
      x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let minX=w, minY=h, maxX=-1, maxY=-1;
      const alphaAt = function(px,py){ return d[(py*w+px)*4+3]; };
      for(let py=0;py<h;py++) for(let px=0;px<w;px++) if(alphaAt(px,py)>18){
        if(px<minX) minX=px; if(px>maxX) maxX=px;
        if(py<minY) minY=py; if(py>maxY) maxY=py;
      }
      if(maxX<minX || maxY<minY) return null;
      const bw=maxX-minX+1, bh=maxY-minY+1;
      const ys=[0.04,0.18,0.36,0.60,0.80,0.96];
      const left=[], right=[];
      for(let i=0;i<ys.length;i++){
        const cy = Math.round(minY + ys[i]*(bh-1));
        let lx=maxX, rx=minX, found=false;
        for(let by=Math.max(minY,cy-2);by<=Math.min(maxY,cy+2);by++){
          for(let px=minX;px<=maxX;px++) if(alphaAt(px,by)>40){
            lx=Math.min(lx,px); rx=Math.max(rx,px); found=true;
          }
        }
        if(!found){ lx=minX+bw*0.28; rx=maxX-bw*0.28; }
        const ny = (cy-(minY+bh/2))/bh;
        left.push([(lx-(minX+bw/2))/bw, ny]);
        right.push([(rx-(minX+bw/2))/bw, ny]);
      }
      return {
        bounds:[minX/w, minY/h, bw/w, bh/h],
        hit:left.concat(right.reverse())
      };
    }catch(e){ return null; }
  }

  const carImg = ensureSprite("v_neela.PNG", function(img){
    const m = measureSprite(img);
    if(!m) return;
    NP.spriteBounds = m.bounds;
    neelaCarHit = m.hit;
    const owner = neelaOwnerObj();
    if(!owner || !owner.neelaMissile) NP.hitShape = neelaCarHit;
    /* A single blue-energy outlet, centered just inside the measured rear edge. */
    NP.exhaust = [[m.bounds[0] + m.bounds[2]*0.50, m.bounds[1] + m.bounds[3]*0.965]];
  });
  const missileImg = ensureSprite("vtm_neela.PNG", function(img){
    const m = measureSprite(img);
    if(m){ missileBounds = m.bounds; neelaMissileHit = m.hit; }
  });

  function enterMissile(who){
    const o = objOf(who);
    o.neelaOrigin = posOf(who);
    o.neelaMissile = true;
    NP.hitShape = neelaMissileHit;
    flashWho(who);
  }
  function leaveMissile(who, white){
    const o = objOf(who);
    if(!o || o.car !== NEELA_ID) return;
    o.neelaMissile = false;
    NP.hitShape = neelaCarHit;
    o.neelaFade = FADE_TIME;
    if(white) o.neelaWhite = WHITE_TIME;
  }

  /* Neela inherits Flann's solid-hazard priority for the whole active meter,
     including after returning to car form. Racer-vs-racer priority stays
     Flann-only, so Neela never wrecks another racer through this path. */
  const trueFlannUltActive = flannUltActive;
  flannUltActive = function(who){ return trueFlannUltActive(who) || neelaActive(who); };
  ramWinner = function(a,b){
    const ao=objOf(a), bo=objOf(b);
    const aa=!!ao && ao.car === "flann" && !!ao.ultOn;
    const bb=!!bo && bo.car === "flann" && !!bo.ultOn;
    if(aa === bb) return null;
    return aa ? a : b;
  };

  const baseStartUlt = startUlt;
  startUlt = function(who){
    const o = objOf(who), was = !!o.ultOn;
    baseStartUlt(who);
    if(!was && o.ultOn && o.car === NEELA_ID) enterMissile(who);
  };
  const baseEndUlt = endUlt;
  endUlt = function(who){
    const o = objOf(who), wasMissile = !!(o && o.neelaMissile);
    baseEndUlt(who);
    if(o && o.car === NEELA_ID){
      if(wasMissile) leaveMissile(who, false);
      else NP.hitShape = neelaCarHit;
    }
  };

  /* Missile contact swaps positions instead of causing damage. The struck
     racer returns to Neela's launch state; Neela takes the contact position
     and returns to car form while the rest of the ultimate keeps running. */
  function neelaImpact(a,b){
    let n=null, victim=null;
    if(neelaMissile(a)){ n=a; victim=b; }
    else if(neelaMissile(b)){ n=b; victim=a; }
    else return false;
    if(noContact(n) || noContact(victim)) return false;
    const no=objOf(n), vo=objOf(victim);
    if(!no || !vo || !no.neelaOrigin) return false;
    const contact = posOf(victim);
    const launch = no.neelaOrigin;
    setPos(n, contact);
    setPos(victim, launch);
    leaveMissile(n, true);
    flashWho(victim);
    no.neelaImpactCD = 0.72;
    vo.neelaImpactCD = 0.72;
    G.shake = Math.max(G.shake, 10);
    tone(930, .12, "sine", .09);
    later(function(){ tone(520, .16, "sine", .07); }, 80);
    return true;
  }
  const baseRearEnd = rearEnd;
  rearEnd = function(who, victim){
    const other = victim.me ? "me" : victim.obj;
    if(neelaImpact(who, other)) return;
    return baseRearEnd(who, victim);
  };
  const baseBumpTarget = bumpTarget;
  bumpTarget = function(victim, dir, by){
    const other = victim.me ? "me" : victim.obj;
    if(neelaImpact(by, other)) return "stopped";
    return baseBumpTarget(victim, dir, by);
  };

  /* The white transformation sequence reports through the existing Obscured
     Condition, without reusing the puddle-water timer or its blue overlay. */
  const baseConditionOn = conditionOn;
  conditionOn = function(who, id){
    if(id === "obscured"){
      const o = objOf(who);
      if(o && (o.neelaWhite || 0) > 0) return true;
    }
    return baseConditionOn(who, id);
  };

  /* Blue energy, not flame, from Neela's measured tail outlet. */
  const baseSpriteExhaust = drawSpriteExhaust;
  drawSpriteExhaust = function(p, left, top, sw, sh, vw, vh){
    if(p !== NP){ baseSpriteExhaust(p,left,top,sw,sh,vw,vh); return; }
    const a = p.exhaust && p.exhaust[0] ? p.exhaust[0] : [0.5,0.94];
    const x = left + a[0]*sw, y = top + a[1]*sh;
    const reduced = motionReduced();
    const pulse = reduced ? 0 : Math.sin(performance.now()*0.012)*0.06;
    const len = vh*(0.34 + pulse), half = Math.max(2, vw*0.055);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(x,y,0,x,y,half*3.4);
    halo.addColorStop(0,"rgba(225,251,255,0.85)");
    halo.addColorStop(0.35,"rgba(62,200,255,0.45)");
    halo.addColorStop(1,"rgba(40,145,255,0)");
    ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(x,y,half*3.4,0,6.2832); ctx.fill();
    const g = ctx.createLinearGradient(x,y,x,y+len);
    g.addColorStop(0,"rgba(235,253,255,0.98)");
    g.addColorStop(0.22,"rgba(83,213,255,0.90)");
    g.addColorStop(0.68,"rgba(56,134,255,0.34)");
    g.addColorStop(1,"rgba(40,100,255,0)");
    ctx.strokeStyle=g; ctx.lineCap="round"; ctx.lineWidth=half*1.55;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x-half*0.30,y+len*0.48,x,y+len); ctx.stroke();
    ctx.strokeStyle="rgba(232,252,255,0.9)"; ctx.lineWidth=Math.max(1,half*0.46);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+len*0.58); ctx.stroke();
    ctx.restore();
  };

  function drawMissileModel(x,y,w,h,tilt){
    if(!missileImg || !missileImg.complete || !missileImg.naturalWidth) return;
    const b=missileBounds;
    const scale=Math.min(w/(missileImg.naturalWidth*b[2]),h/(missileImg.naturalHeight*b[3]));
    const sw=missileImg.naturalWidth*scale, sh=missileImg.naturalHeight*scale;
    const left=-(b[0]+b[2]/2)*sw, top=-(b[1]+b[3]/2)*sh;
    const vw=b[2]*sw, vh=b[3]*sh;
    ctx.save(); ctx.translate(x,y); if(tilt) ctx.rotate(tilt);
    fillRR(-vw/2+w*0.035,-vh/2+h*0.04,vw,vh,vw*0.18,"rgba(0,0,0,0.30)");
    ctx.drawImage(missileImg,left,top,sw,sh);
    ctx.restore();
  }

  function fadeForCar(p){
    if(G.state === "idle") return 0;
    if(p === NP){ const o=neelaOwnerObj(); return o ? (o.neelaFade||0) : 0; }
    if(G.car && CARS[G.car] === p) return G.neelaFade||0;
    for(let i=0;i<G.rivals.length;i++) if(CARS[G.rivals[i].car] === p) return G.rivals[i].neelaFade||0;
    return 0;
  }

  const baseDrawCar = drawCar;
  drawCar = function(x,y,w,h,p,tilt,isPlayer,boosting,ulting){
    const owner = p === NP ? neelaOwnerObj() : null;
    const missile = !!(owner && owner.neelaMissile && owner.ultOn && G.state !== "idle");
    const paint = function(){
      if(missile) drawMissileModel(x,y,w,h,tilt);
      else baseDrawCar(x,y,w,h,p,tilt,isPlayer,boosting,ulting);
    };
    paint();
    const left=fadeForCar(p);
    if(left>0){
      const a=clamp(left/FADE_TIME,0,1)*0.88;
      ctx.save();
      ctx.globalAlpha=a;
      ctx.globalCompositeOperation="screen";
      ctx.filter="brightness(0) invert(1)";
      paint();
      ctx.restore();
    }
  };

  function tailPoint(o){
    const who = o === G ? "me" : o;
    const p = posOf(who), d = racerDims(who), t=o.tilt||0;
    const off=d.h*0.43;
    return {x:p.x-Math.sin(t)*off, y:p.y+Math.cos(t)*off};
  }
  function emitTrail(dt){
    const o=neelaOwnerObj();
    if(!o || !o.ultOn || !o.neelaMissile || G.state !== "running") return;
    trailClock += dt;
    while(trailClock >= TRAIL_STEP){
      trailClock -= TRAIL_STEP;
      const p=tailPoint(o);
      trail.push({x:p.x+rand(-1.5,1.5),y:p.y+rand(-1.5,1.5),life:TRAIL_TIME,max:TRAIL_TIME});
    }
  }
  function tickTrail(dt){
    const roadMove = G.speed*dt;
    for(let i=trail.length-1;i>=0;i--){
      const q=trail[i]; q.life-=dt; q.y+=roadMove;
      if(q.life<=0) trail.splice(i,1);
    }
  }
  function drawTrail(){
    if(trail.length<2) return;
    ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.lineCap="round";
    for(let i=1;i<trail.length;i++){
      const a=trail[i-1], b=trail[i];
      const life=Math.min(a.life/a.max,b.life/b.max);
      if(life<=0) continue;
      const alpha=Math.pow(life,1.35);
      ctx.strokeStyle="rgba(49,158,255,"+(0.20+alpha*0.48).toFixed(3)+")";
      ctx.lineWidth=(2+7*alpha);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.strokeStyle="rgba(211,249,255,"+(0.10+alpha*0.38).toFixed(3)+")";
      ctx.lineWidth=Math.max(1,1.2+2.2*alpha);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    ctx.restore();
  }
  const baseWorldLayer = drawWorldLayer;
  drawWorldLayer = function(id, mode){
    baseWorldLayer(id, mode);
    /* During a seam two world layers are drawn; paint the persistent trail once. */
    if(mode !== "above") drawTrail();
  };

  const baseUpdate = update;
  update = function(dt){
    baseUpdate(dt);
    const all=[G].concat(G.rivals);
    for(let i=0;i<all.length;i++){
      const o=all[i];
      if((o.neelaWhite||0)>0) o.neelaWhite=Math.max(0,o.neelaWhite-dt);
      if((o.neelaFade||0)>0) o.neelaFade=Math.max(0,o.neelaFade-dt);
      if((o.neelaImpactCD||0)>0) o.neelaImpactCD=Math.max(0,o.neelaImpactCD-dt);
    }
    tickTrail(dt);
    emitTrail(dt);
  };

  /* Full-screen white sequence. In split screen each human gets only their own
     column, so Neela and an impacted human can be obscured independently. */
  const whiteRoot=document.createElement("div");
  whiteRoot.setAttribute("aria-hidden","true");
  whiteRoot.style.cssText="position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;display:none";
  document.body.appendChild(whiteRoot);
  function whiteAlpha(t){
    if(t<=0) return 0;
    const elapsed=WHITE_TIME-t;
    if(elapsed<WHITE_HOLD) return 1;
    return clamp(t/(WHITE_TIME-WHITE_HOLD),0,1);
  }
  function paintWhiteouts(){
    if(!cv || !$("#race").classList.contains("on")){ whiteRoot.style.display="none"; return; }
    const rect=cv.getBoundingClientRect();
    const views=G.local && G.humans.length ? G.humans : ["me"];
    let html="", any=false;
    for(let i=0;i<views.length;i++){
      const o=objOf(views[i]), a=whiteAlpha(o.neelaWhite||0);
      if(a<=0) continue;
      any=true;
      const left=rect.left + rect.width*(i/views.length), width=rect.width/views.length;
      html += '<div style="position:absolute;left:'+left.toFixed(2)+'px;top:'+rect.top.toFixed(2)+'px;width:'+width.toFixed(2)+'px;height:'+rect.height.toFixed(2)+'px;background:#fff;opacity:'+a.toFixed(3)+'"></div>';
    }
    whiteRoot.innerHTML=html; whiteRoot.style.display=any?"block":"none";
  }
  const baseRender = render;
  render = function(){ baseRender(); paintWhiteouts(); };

  const baseStartRace = startRace;
  startRace = function(){
    trail.length=0; trailClock=0;
    G.neelaWhite=0; G.neelaFade=0; G.neelaMissile=false; G.neelaOrigin=null;
    NP.hitShape=neelaCarHit;
    return baseStartRace();
  };
  const baseLeave = leave;
  leave = function(){ whiteRoot.style.display="none"; trail.length=0; return baseLeave(); };

  /* main.js already ran applyLang() before DOMContentLoaded. Re-run the cheap
     painters now that Phantom's visible copy and model have become Neela. */
  if(typeof applyLang === "function") applyLang();
  if(typeof paintCarIcons === "function") paintCarIcons();
}

if(document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", installNeela, {once:true});
else installNeela();
