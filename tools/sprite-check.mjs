#!/usr/bin/env node
/* Sprite lifecycle and geometry checks against the actual shared renderer.
   No decoder needed: rendering calls record transforms and plume roots. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f = fixture(), {run, ctx} = f;
let checks=0, calls=[], matrix=[1,0,0,1,0,0], stack=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const point=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
ctx.save=()=>stack.push(matrix.slice());
ctx.restore=()=>{matrix=stack.pop();};
ctx.setTransform=(...m)=>{matrix=m;};
ctx.translate=(x,y)=>{[matrix[4],matrix[5]]=point(x,y);};
ctx.rotate=a=>{const [a0,b,c,d,e,g]=matrix,s=Math.sin(a),co=Math.cos(a);matrix=[a0*co+c*s,b*co+d*s,c*co-a0*s,d*co-b*s,e,g];};
ctx.drawImage=(image,x,y,w,h)=>calls.push({type:'image',image,x,y,w,h,m:matrix.slice()});
ctx.createLinearGradient=(x,y,x2,y2)=>{calls.push({type:'plume',root:point(x,y),tip:point(x2,y2),x,y});return {addColorStop(){}};};
/* The rear exhaust is the only thing that builds a linear gradient, and the
   ultimate body fire is the only thing that builds a radial one inside a car,
   so the two effects can be told apart by which primitive they reach for. */
ctx.createRadialGradient=(x,y,r,x2,y2,r2)=>{calls.push({type:'fire',root:point(x,y),r,r2});return {addColorStop(){}};};
/* The transformation flash reaches for neither gradient - deliberately, so it
   can never be counted as a plume or as a body fire. It is a pair of flat
   rectangles and a filled silhouette, so those are what is recorded for it.
   rr() takes the roundRect path in this fixture, so a straight lineTo can only
   have come from a hand-built outline. */
ctx.fillRect=(x,y,w,h)=>calls.push({type:'rect',x,y,w,h,m:matrix.slice()});
ctx.lineTo=(x,y)=>calls.push({type:'line',p:point(x,y)});
function test(name,fn){fn();checks++;console.log('  ok  '+name);}
function draw(boost=true,tilt=0,w=60,h=111.6,ult=false,car='flann',white=0,alt=false){
  calls=[];matrix=[1,0,0,1,0,0];stack=[];
  const model = alt ? `CARS.${car}.altForm` : `CARS.${car}`;
  run(`drawCar(140,220,${w},${h},${model},${tilt},true,${boost},${ult},${white});`);
  assert.equal(stack.length,0);assert.deepEqual(matrix,[1,0,0,1,0,0]);
  return calls;
}
function images(){return calls.filter(c=>c.type==='image');}
/* Images narrowed to one sheet, so a count can say which body was drawn rather
   than only how many were. */
function sheet(src){return images().filter(c=>c.image && c.image.src===src);}
function rects(){return calls.filter(c=>c.type==='rect');}
function lines(){return calls.filter(c=>c.type==='line');}
function plumes(){return calls.filter(c=>c.type==='plume');}
function fires(){return calls.filter(c=>c.type==='fire');}
/* Clear everything else on the road that draws a radial gradient of its own,
   so a `fire` recorded during a full render can only have come from a car. */
const clearWorld=()=>run('G.traps=[];G.boxes=[];G.slicks=[];G.missiles=[];G.fx=[];');
/* Eight images between them: five car sheets, Neela's alternate form, and the
   two note PNGs the world effects are drawn from. Each fetched exactly once,
   each spelled exactly as the file on disk is, and none of them drawn before it
   has arrived. The casing matters: the repository serves these straight off a
   case-sensitive host.

   The two notes are in a cache of their own rather than in CAR_SPRITES,
   because they are not a body anybody drives - but they are loaded on the same
   terms, and a renderer that built an Image per frame would show up here as a
   count that climbs. */
const CAR_SHEETS=['v_flann.PNG','v_neela.PNG','vtm_neela.PNG','v_lolanthe.PNG',
                  'v_verdant.PNG','v_rhosyn.PNG'];
const FX_SHEETS=['queen_note.PNG','pion_note.PNG'];
test('eight cached images, exact case, unloaded and failed assets safely skip drawing',()=>{
  assert.equal(f.images.length,8);
  assert.deepEqual(f.images.map(i=>i.src),CAR_SHEETS.concat(FX_SHEETS));
  assert.equal(new Set(f.images.map(i=>i.src)).size,8,'no sheet is fetched twice');
  /* and each cache is keyed by that same exact name */
  for(const src of CAR_SHEETS)
    assert.equal(run(`!!CAR_SPRITES[${JSON.stringify(src)}]`),true,src+' is cached');
  for(const src of FX_SHEETS)
    assert.equal(run(`!!FX_SPRITES[${JSON.stringify(src)}]`),true,src+' is cached');
  assert.equal(run('Object.keys(CAR_SPRITES).length'),6);
  assert.equal(run('Object.keys(FX_SPRITES).length'),2);
  /* The two names the game asks for are the two that were fetched. */
  assert.equal(run('QUEEN_NOTE_IMG'),'queen_note.PNG');
  assert.equal(run('MIND_NOTE_IMG'),'pion_note.PNG');
  /* An image that has not arrived is simply not drawn - by either cache. */
  assert.equal(run('fxImage(QUEEN_NOTE_IMG)'),null);
  draw();assert.equal(calls.length,0);f.images[0].complete=true;draw();assert.equal(calls.length,0);
});
test('every late load schedules a menu repaint through the common renderer',()=>{
  for(const image of f.images.slice(0,CAR_SHEETS.length)){
    f.frames.length=0;image.load();assert.equal(f.frames.length,1,image.src+' repaints');
  }
  calls=[];f.frames.shift()();assert.ok(images().length>=2);assert.equal(plumes().length,0);
});
test('the full image keeps aspect ratio and centres its visible bounds',()=>{
  draw(false);assert.equal(images().length,1);assert.equal(plumes().length,0);
  const d=images()[0];near(d.w/d.h,1024/1536);
  near(d.x+d.w*(512/1024),0);near(d.y+d.h*(740.5/1536),0);
  assert.ok(d.x<0 && d.y<0);near(d.h*1337/1536,111.6);
});
test('both plumes share image anchors, tilt and scale with no canvas transform leak',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(true,tilt,size,size*1.86);const d=images()[0],p=plumes();assert.equal(p.length,2);
    assert.ok(calls.indexOf(p[1])<calls.indexOf(d));
    for(const [i,px] of [355,669].entries()){
      const x=d.x+d.w*px/1024,y=d.y+d.h*1377/1536;
      near(p[i].root[0],d.m[0]*x+d.m[2]*y+d.m[4]);
      near(p[i].root[1],d.m[1]*x+d.m[3]*y+d.m[5]);
      assert.ok(p[i].tip[1]>p[i].root[1]);
    }
  }
});
test('animation keeps roots pinned, repeats deterministically and varies continuously',()=>{
  run('motionPref="full";');f.setNow(1000);const a=structuredClone(plumesFromDraw());
  f.setNow(1001);const b=draw().filter(c=>c.type==='plume');
  for(let i=0;i<2;i++){assert.deepEqual(a[i].root,b[i].root);assert.ok(Math.abs(a[i].tip[1]-b[i].tip[1])<0.1);}
  f.setNow(1000);assert.deepEqual(plumesFromDraw(),a);
});
function plumesFromDraw(){return draw().filter(c=>c.type==='plume');}
test('reduced motion is static and switching boost off removes every plume',()=>{
  run('motionPref="reduced";');f.setNow(100);const a=structuredClone(plumesFromDraw());
  f.setNow(5700);assert.deepEqual(plumesFromDraw(),a);draw(false);assert.equal(plumes().length,0);
});
test('rendering never changes race state or allocates additional images',()=>{
  const before=run('JSON.stringify(G)');
  for(let i=0;i<100;i++){
    f.setNow(i*16);draw();draw(true,0.12,60,111.6,true);
    /* Neela's two bodies through the same loop: an energy plume and an
       alternate-form trail root are no more allowed to allocate an Image or
       touch race state than Flann's fire is. */
    draw(true,0.12,60,111.6,false,'neela');
    draw(true,-0.12,60,111.6,false,'neela',0.5,true);
    /* And the two new sprite cars through the same loop, for the same reason. */
    draw(true,0.12,60,111.6,false,'lolanthe');
    draw(true,-0.12,60,111.6,false,'verdant');
  }
  assert.equal(run('JSON.stringify(G)'),before);assert.equal(f.images.length,8);
});

/* ---- the ultimate body fire -------------------------------------
   Flann's ultimate is an offensive power now, and this is the part of it the
   player can see. The renderer takes the ultimate as its own flag rather than
   folding it into the boost one, so these two must never be confused: boost
   lights the pipes, the ultimate sets the car alight. */
test('the ultimate sets the body alight and ordinary boost never does',()=>{
  run('motionPref="full";');f.setNow(1000);
  draw(true,0,60,111.6,false);                       /* boost, no ultimate */
  assert.equal(plumes().length,2);assert.equal(fires().length,0);
  draw(false,0,60,111.6,true);                       /* ultimate, no boost */
  assert.ok(fires().length>=6,'the fire is several tongues, not one overlay');
  assert.equal(plumes().length,0,'no exhaust without the boost flag');
  draw(true,0,60,111.6,true);                        /* both, as a race has it */
  assert.equal(plumes().length,2);assert.ok(fires().length>=6);
  /* Over the body: the image goes down first and the flames wrap it. */
  const d=images()[0];
  assert.ok(fires().every(c=>calls.indexOf(c)>calls.indexOf(d)));
});
test('only Flann catches fire, and never in a menu preview',()=>{
  for(const car of ['neela','lolanthe','verdant','rhosyn','siren']){
    draw(true,0,60,111.6,true,car);
    assert.equal(fires().length,0,car+' must not catch fire');
  }
  draw(false,0,60,111.6,false);assert.equal(fires().length,0);
});
test('the fire sits on the body, leans with the tilt and scales with the car',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(false,tilt,size,size*1.86,true);
    const roots=fires().map(c=>c.root);
    assert.ok(roots.length>=6);
    for(const [rx,ry] of roots){
      /* Within about a car of the centre it is drawn around: a wrap, not a
         screen-wide glow, and it has moved with the rotation rather than
         staying axis-aligned. */
      assert.ok(Math.hypot(rx-140,ry-220)<=size*1.86,'root inside the car');
    }
    if(tilt) assert.ok(roots.some(([rx])=>Math.abs(rx-140)>1e-9),'leans with tilt');
  }
});
test('the fire flickers on full motion and holds still on reduced motion',()=>{
  run('motionPref="full";');
  f.setNow(2000);const a=structuredClone(draw(false,0,60,111.6,true).filter(c=>c.type==='fire'));
  f.setNow(2400);const b=draw(false,0,60,111.6,true).filter(c=>c.type==='fire');
  assert.equal(a.length,b.length);
  assert.ok(a.some((c,i)=>Math.abs(c.r2-b[i].r2)>1e-9),'full motion flickers');
  f.setNow(2000);assert.deepEqual(draw(false,0,60,111.6,true).filter(c=>c.type==='fire'),a);
  run('motionPref="reduced";');
  f.setNow(100);const r=structuredClone(draw(false,0,60,111.6,true).filter(c=>c.type==='fire'));
  f.setNow(5700);assert.deepEqual(draw(false,0,60,111.6,true).filter(c=>c.type==='fire'),r);
  assert.ok(r.length>=6,'reduced motion keeps the flames, it only stops them moving');
  run('motionPref="full";');
});
f.boot();
run('G.local=false;G.car="flann";G.mode="endless";G.rules=defaultRules();startRace();clearTimers();G.state="running";');
test('ordinary boost, ultimate, player blink and rival sprite use existing visual flags',()=>{
  clearWorld();
  /* This one is about the player's own visual flags, so the rest of the grid is
     put in procedural cars: a second sprite car on the road would add its own
     image and its own plume to every count below without saying anything about
     the flags being checked. The rival case has its own sprite further down. */
  run('G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;});');
  run('G.invuln=0;G.boosting=true;');calls=[];run('render();');
  assert.equal(images().length,1);assert.equal(plumes().length,2);
  assert.equal(fires().length,0,'a boosting Flann is not on fire');
  run('G.boosting=false;G.ult=1;startUlt("me");');calls=[];run('render();');
  assert.equal(plumes().length,2);assert.ok(fires().length>=6,'an ulting Flann is');
  run('G.invuln=2;');calls=[];run('render();');
  assert.equal(images().length,0);assert.equal(plumes().length,0);
  assert.equal(fires().length,0,'a blinked-out car draws nothing at all');
  /* Ending it puts the fire out on the very next frame. */
  run('G.invuln=0;endUlt("me");');calls=[];run('render();');assert.equal(fires().length,0);
  run('G.car="siren";G.rivals[0].car="flann";G.rivals[0].y=playerY-150;G.rivals[0].invuln=0;G.rivals[0].boosting=true;');
  calls=[];run('render();');assert.equal(images().length,1);assert.equal(plumes().length,2);
  assert.equal(fires().length,0);
  /* A rival Flann gets the identical treatment - the effect is per racer, not
     a property of being the person holding the controller. */
  run('G.rivals[0].ult=1;startUlt(G.rivals[0]);');calls=[];run('render();');
  assert.ok(fires().length>=6);
  run('endUlt(G.rivals[0]);G.car="flann";G.rivals[0].car="siren";');
});

/* Sizes as the road actually asks for them, straight off the shared entry
   point every racer, bot and menu preview is drawn through. */
function sizedDraws(code){
  run(`globalThis.sizes=[];globalThis.realDrawCar=drawCar;
       drawCar=function(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha){
         sizes.push({car:p.key,w:w,h:h,boost:!!boosting,ult:!!ulting,
                     alpha:alpha===undefined?1:alpha});
         return realDrawCar(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha);};`);
  try { run(code); return run('JSON.stringify(sizes)'); }
  finally { run('drawCar=realDrawCar;'); }
}
test('three sprite cars are drawn larger on the road; the other three keep their size',()=>{
  clearWorld();
  run(`G.local=false;G.car="flann";G.rules=defaultRules();startRace();clearTimers();
       G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach((r,i)=>{r.car=CAR_IDS[i+1];r.invuln=0;r.dead=0;r.y=playerY-140*(i+1);});`);
  const drawn=JSON.parse(sizedDraws('render();'));
  const [base,tall]=[run('carW'),run('carH')];
  assert.equal(drawn.length,6);
  const SCALES={flann:1.12,neela:1.18,verdant:1.10};
  for(const d of drawn){
    const k=SCALES[d.car]||1;
    near(d.w,base*k);near(d.h,tall*k);
    near(d.h/d.w,tall/base);                          /* aspect ratio preserved */
  }
  for(const car of ['flann','neela','verdant']){
    const sprite=drawn.find(d=>d.car===car);
    assert.ok(sprite.w>base && sprite.h>tall,car+' is larger than the shared car box');
  }
  /* Lolanthe and Rhosyn are sprite cars with no race scale at all - their
     artwork already fills the box across - so both must sit on the shared
     numbers exactly as Siren does. */
  for(const car of ['lolanthe','rhosyn','siren']){
    const d=drawn.find(x=>x.car===car);
    near(d.w,base);near(d.h,tall);
  }
  /* The garage and select-screen previews are sized by their own canvas and
     are deliberately untouched by the race scale. */
  const menu=JSON.parse(sizedDraws('paintCarIcons();'));
  assert.ok(menu.length>=6);
  const w=Math.min(100*0.78,120*0.43);
  for(const d of menu){
    near(d.w,w);near(d.h,w*1.86);
    assert.equal(d.boost,false);assert.equal(d.ult,false);
  }
});
test('every local viewport carries the fire for whichever seats are ulting',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.picks=CAR_IDS.slice(0,${seats});G.car=G.picks[0];
         G.rules=defaultRules();startRace();clearTimers();G.state="running";G.invuln=0;`);
    clearWorld();
    run('G.rivals.forEach(r=>{r.invuln=0;r.dead=0;});');
    calls=[];run('render();');assert.equal(fires().length,0);
    /* Seat one is Flann in every arrangement, and it is drawn once per column. */
    run('G.ult=1;startUlt("me");');calls=[];run('render();');
    const one=fires().length;
    assert.ok(one>=6*seats,`${seats} columns each draw the fire`);
    /* A second Flann, driven by a bot, adds its own and nobody else's. */
    run(`G.rivals[0].car="flann";G.rivals[0].ult=1;startUlt(G.rivals[0]);`);
    calls=[];run('render();');
    assert.ok(fires().length>=one+6*seats);
    run('endUlt("me");endUlt(G.rivals[0]);');calls=[];run('render();');
    assert.equal(fires().length,0,'both fires out the frame the ultimates end');
  }
});
test('two, three and four local columns render the same Flann image and exhaust',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.picks=CAR_IDS.slice(0,${seats});G.car=G.picks[0];G.rules=defaultRules();startRace();clearTimers();G.state="running";G.invuln=0;G.boosting=true;
         G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;r.boosting=false;});`);
    calls=[];run('render();');
    /* Seat one is Flann in every arrangement: its sheet and its two plumes are
       drawn once per column and the count is by sheet, so another sprite car on
       the grid could never be mistaken for it. */
    assert.equal(sheet('v_flann.PNG').length,seats);
    assert.equal(plumes().length,2*seats);
    assert.equal(run('G.rivals.length'),5);
  }
});
test('a full render of a burning car still changes no race state',()=>{
  run(`G.local=false;G.car="flann";G.rules=defaultRules();startRace();clearTimers();
       G.state="running";G.invuln=0;G.dead=0;G.ult=1;startUlt("me");
       G.rivals[0].car="flann";G.rivals[0].invuln=0;G.rivals[0].ult=1;startUlt(G.rivals[0]);`);
  clearWorld();
  const before=run('JSON.stringify(G)');
  for(let i=0;i<60;i++){f.setNow(20000+i*16);run('render();');}
  assert.equal(run('JSON.stringify(G)'),before);
  run('endUlt("me");endUlt(G.rivals[0]);');
});
test('three minutes of Endless preserve the full racer field and running lifecycle',()=>{
  run('G.local=false;G.car="flann";G.mode="endless";G.rules=defaultRules();startRace();clearTimers();G.state="running";for(let i=0;i<10800;i++)update(1/60);');
  assert.equal(run('G.state'),'running');assert.equal(run('G.rivals.length'),5);assert.ok(run('G.meters')>0);
});

/* ================================================================
   NEELA  -  two sheets, two emitters, one car
   ================================================================
   The measured numbers, restated here so the check fails if either the data or
   the placement moves without the other. v_neela's body is (220,25)-(803,1422)
   of a 1024x1536 sheet and its outlets are at (352,1355) and (671,1355);
   vtm_neela's craft is (228,22)-(795,1506) and its thruster is at (512,1306). */
const N_BOUNDS = {x:220, y:25, w:584, h:1398};
const N_PIPES = [[352,1355],[671,1355]];
const A_BOUNDS = {x:228, y:22, w:568, h:1485};
const A_TAIL = [512,1306];
/* Where the placement puts an image-space point, worked out from the recorded
   drawImage rather than from a second copy of the renderer's arithmetic. */
function anchorOn(d, px, py){
  const x = d.x + d.w*px/1024, y = d.y + d.h*py/1536;
  return [d.m[0]*x + d.m[2]*y + d.m[4], d.m[1]*x + d.m[3]*y + d.m[5]];
}
test('the normal Neela sheet is centred from its own measured bounds',()=>{
  const c = draw(false,0,60,111.6,false,'neela');
  assert.equal(images().length,1);assert.equal(plumes().length,0);
  const d = images()[0];
  assert.equal(d.image.src,'v_neela.PNG');
  near(d.w/d.h,1024/1536);                                  /* the whole sheet, padding and all */
  /* the measured body's centre lands on the car's centre */
  near(d.x + d.w*((N_BOUNDS.x + N_BOUNDS.w/2)/1024), 0);
  near(d.y + d.h*((N_BOUNDS.y + N_BOUNDS.h/2)/1536), 0);
  assert.ok(d.x < 0 && d.y < 0, 'the transparent padding is drawn, not cropped');
  near(d.h*N_BOUNDS.h/1536, 111.6);                         /* and the body fills the box height */
});
test('the alternate sheet is centred from its own bounds, not the car ones',()=>{
  const c = draw(false,0,60,111.6,false,'neela',0,true);
  assert.equal(images().length,1);
  const d = images()[0];
  assert.equal(d.image.src,'vtm_neela.PNG');
  near(d.w/d.h,1024/1536);
  near(d.x + d.w*((A_BOUNDS.x + A_BOUNDS.w/2)/1024), 0);
  near(d.y + d.h*((A_BOUNDS.y + A_BOUNDS.h/2)/1536), 0);
  near(d.h*A_BOUNDS.h/1536, 111.6);
  /* Measured separately and genuinely different: the craft is narrower than
     the car in the same box, which is why its own bounds have to be used. */
  const car = draw(false,0,60,111.6,false,'neela');
  assert.ok(Math.abs(images()[0].w - d.w) > 1, 'the two sheets are not sized alike');
});
test('the normal energy root is exactly the measured outlet, at every size and tilt',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(true,tilt,size,size*1.86,false,'neela');
    const d = images()[0], p = plumes();
    assert.ok(p.length >= 2, 'a plume per outlet at least');
    assert.ok(calls.indexOf(p[0]) < calls.indexOf(d), 'the energy goes under the body');
    for(const [px,py] of N_PIPES){
      const want = anchorOn(d, px, py);
      assert.ok(p.some(g => Math.abs(g.root[0]-want[0]) < 1e-8 &&
                            Math.abs(g.root[1]-want[1]) < 1e-8),
                `an energy root sits exactly on (${px},${py}) at ${size}/${tilt}`);
    }
    /* and it runs out behind the car, not in front of it */
    assert.ok(p.every(g => g.tip[1] >= g.root[1] - 1e-8));
  }
});
test('the alternate energy root is exactly the measured thruster, pinned the same way',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(true,tilt,size,size*1.86,false,'neela',0,true);
    const d = images()[0], p = plumes();
    assert.ok(p.length >= 1);
    const want = anchorOn(d, A_TAIL[0], A_TAIL[1]);
    assert.ok(p.some(g => Math.abs(g.root[0]-want[0]) < 1e-8 &&
                          Math.abs(g.root[1]-want[1]) < 1e-8),
              `the thruster root sits exactly on (512,1306) at ${size}/${tilt}`);
  }
  /* A tilt genuinely moves it: the root rotates with the craft rather than
     staying on the screen axis. */
  draw(true,0,60,111.6,false,'neela',0,true);
  const flat = plumes()[0].root;
  draw(true,0.24,60,111.6,false,'neela',0,true);
  assert.ok(Math.abs(plumes()[0].root[0]-flat[0]) > 1e-6, 'the root leans with the tilt');
});
test('Neela never catches fire and the alternate body never does either',()=>{
  for(const alt of [false,true]){
    draw(true,0,60,111.6,true,'neela',0,alt);
    assert.equal(fires().length,0,'the body fire belongs to Flann alone');
    assert.ok(plumes().length >= 1,'but the energy is still there');
  }
});
test('the transformation flash is on the body, deterministic and motion-safe',()=>{
  run('motionPref="full";');
  f.setNow(1000);
  draw(false,0,60,111.6,false,'neela',0);
  const coldRects = rects().length, coldLines = lines().length;
  draw(false,0,60,111.6,false,'neela',0.8);
  assert.ok(rects().length > coldRects, 'a flash adds a halo of its own');
  /* And the shape it fills is the model's own hull, so it is the car's
     silhouette going white rather than a disc dropped over the top of it. */
  const hull = run('CARS.neela.hitShape.length');
  assert.equal(lines().length - coldLines, hull - 1, 'the flash traces the hull');
  /* It reads a timer and no clock, so the same value draws the same frame
     however much time has passed - and reduced motion gets the same one. */
  f.setNow(1000);const a = JSON.stringify(draw(false,0,60,111.6,false,'neela',0.8));
  f.setNow(9000);assert.equal(JSON.stringify(draw(false,0,60,111.6,false,'neela',0.8)),a);
  run('motionPref="reduced";');
  f.setNow(4200);assert.equal(JSON.stringify(draw(false,0,60,111.6,false,'neela',0.8)),a);
  run('motionPref="full";');
  /* And it is neither an exhaust plume nor a body fire, so neither of those
     can be mistaken for it or it for them. */
  draw(false,0,60,111.6,false,'neela',1);
  assert.equal(plumes().length,0);assert.equal(fires().length,0);
  /* It works on a car that has no sprite at all, because the victim of a
     teleport can be any of the six - and on the one that has a sprite and a
     traced hull of its own, because Rhosyn flashes through this on the way
     into Aero-Glow and on the way back out. */
  draw(false,0,60,111.6,false,'siren',0);
  const sirenOff = lines().length;
  draw(false,0,60,111.6,false,'siren',0.8);
  /* Siren has no hull of its own, so the flash falls back to the shared body
     rectangle - which is still its silhouette, not a circle. */
  assert.equal(lines().length - sirenOff, run('CAR_HIT_RECT.length') - 1,
               'siren flashes white on its own outline');
  draw(false,0,60,111.6,false,'rhosyn',0);
  const rhosynOff = lines().length;
  draw(false,0,60,111.6,false,'rhosyn',0.8);
  assert.equal(lines().length - rhosynOff, run('CARS.rhosyn.hitShape.length') - 1,
               'rhosyn flashes white on its own traced outline, forked nose and all');
});
test('reduced motion keeps the energy and only stops it moving',()=>{
  run('motionPref="reduced";');
  f.setNow(100);const a = structuredClone(draw(true,0,60,111.6,false,'neela').filter(c=>c.type==='plume'));
  f.setNow(5700);assert.deepEqual(draw(true,0,60,111.6,false,'neela').filter(c=>c.type==='plume'),a);
  assert.ok(a.length >= 2,'the plumes are still drawn, they only hold still');
  draw(false,0,60,111.6,false,'neela');assert.equal(plumes().length,0);
  run('motionPref="full";');
  f.setNow(3000);const b = draw(true,0,60,111.6,false,'neela').filter(c=>c.type==='plume');
  f.setNow(3400);const c = draw(true,0,60,111.6,false,'neela').filter(c=>c.type==='plume');
  assert.ok(b.some((g,i)=>Math.abs(g.tip[1]-c[i].tip[1])>1e-9),'full motion pulses');
  for(let i=0;i<b.length;i++) assert.deepEqual(b[i].root,c[i].root,'the roots never move');
});

/* ---- and the same again through the real render path ------------ */
f.boot();
test('the road shows the car until the ultimate, the craft during it, and back after',()=>{
  run(`G.local=false;G.car="neela";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;r.trail=[];});`);
  clearWorld();
  /* Ordinary driving, and ordinary boost, never transform anything. */
  run('G.boosting=true;');calls=[];run('render();');
  assert.equal(sheet('v_neela.PNG').length,1);
  assert.equal(sheet('vtm_neela.PNG').length,0,'boost is not a transformation');
  assert.equal(run('neelaFormActive("me")'),false);
  assert.ok(plumes().length >= 2,'the outlets are lit, though');
  /* Nor does a boost can, nor the speed an ultimate grants by itself. */
  run('G.boosting=false;G.canT=2;');calls=[];run('render();');
  assert.equal(sheet('vtm_neela.PNG').length,0);
  run('G.canT=0;');
  /* The ultimate does. */
  run('G.ult=1;startUlt("me");');calls=[];run('render();');
  assert.equal(sheet('vtm_neela.PNG').length,1);
  assert.equal(sheet('v_neela.PNG').length,0,'one body at a time');
  assert.equal(fires().length,0,'and it is still not on fire');
  /* Running it out puts the car back on the very next frame. */
  run('tickUlt("me",ULT_TIME);');calls=[];run('render();');
  assert.equal(sheet('v_neela.PNG').length,1);
  assert.equal(sheet('vtm_neela.PNG').length,0);
  /* A rival Neela gets the identical treatment. */
  run(`G.car="siren";G.rivals[0].car="neela";G.rivals[0].y=playerY-150;
       G.rivals[0].invuln=0;G.rivals[0].dead=0;`);
  calls=[];run('render();');
  assert.equal(sheet('v_neela.PNG').length,1);
  run('G.rivals[0].ult=1;startUlt(G.rivals[0]);');calls=[];run('render();');
  assert.equal(sheet('vtm_neela.PNG').length,1);
  assert.equal(sheet('v_neela.PNG').length,0);
  run('endUlt(G.rivals[0]);');
});
test('a full render of a transforming Neela changes no race state',()=>{
  run(`G.local=false;G.car="neela";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;});
       G.rivals[0].car="neela";G.rivals[0].invuln=0;G.rivals[0].y=playerY-160;
       G.ult=1;startUlt("me");G.rivals[0].ult=1;startUlt(G.rivals[0]);
       G.speed=BASE_SPEED;G.rivals[0].abs=BASE_SPEED;
       /* Trail laid by the update path itself rather than by a whole frame:
          a bot's picture of the race carries references back to the racers and
          cannot be serialised, and it is the trail this test needs. */
       for(let i=0;i<40;i++){updateTrail("me",1/60,G.speed/60);
                             updateTrail(G.rivals[0],1/60,G.speed/60);}`);
  clearWorld();
  assert.ok(run('G.trail.length')>0,'there is a trail to draw');
  const before=run('JSON.stringify(G)');
  for(let i=0;i<60;i++){f.setNow(30000+i*16);run('render();');}
  assert.equal(run('JSON.stringify(G)'),before);
  assert.equal(f.images.length,8,'still eight images and no more');
  run('endUlt("me");endUlt(G.rivals[0]);');
});
test('every local column carries its own Neela body and nobody else is white',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.rules=defaultRules();
         G.picks=["neela"].concat(CAR_IDS.filter(c=>c!=="neela")).slice(0,${seats});
         G.car=G.picks[0];startRace();clearTimers();G.state="running";G.invuln=0;
         G.rivals.forEach(r=>{r.dead=0;r.invuln=0;if(r.car!=="flann")r.car="siren";});`);
    clearWorld();
    calls=[];run('render();');
    assert.equal(sheet('v_neela.PNG').length,seats,`${seats} columns each draw the car`);
    assert.equal(sheet('vtm_neela.PNG').length,0);
    run('G.ult=1;startUlt("me");');
    calls=[];run('render();');
    assert.equal(sheet('vtm_neela.PNG').length,seats,'and each draws the craft');
    assert.equal(sheet('v_neela.PNG').length,0);
    /* Seat one is whited out; the other columns are not, and the Condition is
       derived from that timer rather than from the puddle's. */
    assert.equal(run('whiteoutActive("me")'),true);
    assert.equal(run('G.blind'),0);
    assert.equal(run(`activeConditions("me").indexOf("obscured") >= 0`),true);
    for(let i=1;i<seats;i++)
      assert.equal(run(`whiteoutActive(G.humans[${i}])`),false,'seat '+(i+1)+' is untouched');
    run('endUlt("me");G.whiteT=0;');
  }
});

/* ================================================================
   LOLANTHE AND VERDANT  -  two more sheets, three more emitters
   ================================================================
   The measured numbers, restated here so the check fails if either the data or
   the placement moves without the other. v_lolanthe's body is (90,12)-(933,1477)
   of a 1024x1536 sheet and its two oval outlets are centred at (455,1354) and
   (568,1354). v_verdant's body is (167,36)-(856,1508) and its one side-exit
   pipe has its bore centred at (738,1314) - the slatted box under its tail is a
   diffuser with no bore, so nothing is drawn out of it. */
const L_BOUNDS = {x:90, y:12, w:844, h:1466};
const L_PIPES = [[455,1354],[568,1354]];
const V_BOUNDS = {x:167, y:36, w:690, h:1473};
const V_PIPES = [[738,1314]];
test('both new sheets are centred from their own measured bounds',()=>{
  for(const [car,B] of [['lolanthe',L_BOUNDS],['verdant',V_BOUNDS]]){
    for(const size of [22,60,130]){
      draw(false,0,size,size*1.86,false,car);
      const d=images()[0];
      assert.equal(images().length,1,car+' draws one body');
      near(d.w/d.h,1024/1536);                       /* the whole sheet, never cropped */
      /* the measured body's own centre lands on the car's centre */
      near(d.x+d.w*((B.x+B.w/2)/1024),0);
      near(d.y+d.h*((B.y+B.h/2)/1536),0);
      assert.ok(d.x<0 && d.y<0,'padding is kept, not trimmed');
      /* and the body fits the box: whichever of the two runs out first */
      const vw=d.w*B.w/1024, vh=d.h*B.h/1536;
      assert.ok(vw<=size+1e-6 && vh<=size*1.86+1e-6,car+' body overflows its box');
      assert.ok(Math.abs(vw-size)<1e-6 || Math.abs(vh-size*1.86)<1e-6,
                car+' body does not fill its box in either direction');
    }
    /* Neither borrowed the other's geometry, nor Flann's, nor Neela's. */
    for(const other of ['flann','neela'])
      assert.notEqual(run(`JSON.stringify(CARS.${car}.spriteBounds)`),
                      run(`JSON.stringify(CARS.${other}.spriteBounds)`));
  }
  assert.notEqual(run('JSON.stringify(CARS.lolanthe.spriteBounds)'),
                  run('JSON.stringify(CARS.verdant.spriteBounds)'));
});
test('every plume root is the measured tailpipe, at every size and tilt',()=>{
  for(const [car,pipes] of [['lolanthe',L_PIPES],['verdant',V_PIPES]]){
    /* The data says what the artwork says: as many anchors as the sheet has
       outlets, and at the measured places. */
    assert.equal(run(`CARS.${car}.exhaust.length`),pipes.length);
    for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
      draw(true,tilt,size,size*1.86,false,car);
      const d=images()[0],p=plumes();
      assert.equal(p.length,pipes.length,car+' lights every outlet and no more');
      /* Under the body, so the car sits in front of its own fire. */
      assert.ok(p.every(q=>calls.indexOf(q)<calls.indexOf(d)));
      for(const [i,[px,py]] of pipes.entries()){
        const [ax,ay]=anchorOn(d,px,py);
        near(p[i].root[0],ax);near(p[i].root[1],ay);
        assert.ok(p[i].tip[1]>p[i].root[1],'the plume runs out behind the car');
      }
      if(tilt) assert.ok(Math.abs(p[0].root[0]-140)>1e-9,'the root leans with the car');
    }
    /* Ordinary fire out of the pipes, not Neela's energy, and never a body fire. */
    assert.equal(run(`CARS.${car}.exhaustStyle===undefined`),true);
    assert.equal(fires().length,0);
    draw(false,0,60,111.6,false,car);
    assert.equal(plumes().length,0,'no boost, no plume');
  }
});

/* ================================================================
   RHOSYN  -  the fifth sheet, and two more outlets
   ================================================================
   The measured numbers, restated here so the check fails if either the data or
   the placement moves without the other. v_rhosyn.PNG's body is
   (75,33)-(948,1437) of a 1024x1536 sheet, and the two stadium outlets in its
   rear valance are centred at (473,1333) and (551,1333) - 39 source pixels
   either side of the sheet's own centre line, which is where the artwork puts
   them. */
const R_BOUNDS = {x:75, y:33, w:874, h:1405};
const R_PIPES = [[473,1333],[551,1333]];
test('Rhosyn is a sprite car carrying its own measured data',()=>{
  assert.equal(run('CARS.rhosyn.style'),'sprite');
  assert.equal(run('CARS.rhosyn.sprite'),'v_rhosyn.PNG');
  assert.equal(run('!!CAR_SPRITES["v_rhosyn.PNG"]'),true,'registered in the shared cache');
  /* The old procedural coupe is gone outright rather than left behind. */
  assert.equal(run('typeof CARS.rose'),'undefined');
  assert.equal(run('typeof drawCoupe'),'undefined');
  assert.equal(run('CAR_IDS.filter(id=>CARS[id].style==="coupe").length'),0);
  /* Bounds, hull and anchors are all present and all its own. */
  assert.deepEqual(JSON.parse(run('JSON.stringify(CARS.rhosyn.spriteBounds)')),
                   [R_BOUNDS.x/1024,R_BOUNDS.y/1536,R_BOUNDS.w/1024,R_BOUNDS.h/1536]);
  assert.deepEqual(JSON.parse(run('JSON.stringify(CARS.rhosyn.exhaust)')),
                   R_PIPES.map(([x,y])=>[x/1024,y/1536]));
  assert.equal(run('CARS.rhosyn.exhaust.length'),2);
  assert.ok(run('CARS.rhosyn.hitShape.length')>4);
  /* Nobody else's bounds, and nobody else's hull. */
  for(const other of ['flann','neela','lolanthe','verdant']){
    assert.notEqual(run('JSON.stringify(CARS.rhosyn.spriteBounds)'),
                    run(`JSON.stringify(CARS.${other}.spriteBounds)`));
    assert.notEqual(run('JSON.stringify(CARS.rhosyn.exhaust)'),
                    run(`JSON.stringify(CARS.${other}.exhaust)`));
  }
  /* Fire out of the pipes, not Neela's energy. */
  assert.equal(run('CARS.rhosyn.exhaustStyle===undefined'),true);
});
test('the Rhosyn sheet is centred from its own measured bounds',()=>{
  for(const size of [22,60,130]){
    draw(false,0,size,size*1.86,false,'rhosyn');
    const d=images()[0];
    assert.equal(images().length,1,'one body');
    near(d.w/d.h,1024/1536);                         /* the whole sheet, never cropped */
    near(d.x+d.w*((R_BOUNDS.x+R_BOUNDS.w/2)/1024),0);
    near(d.y+d.h*((R_BOUNDS.y+R_BOUNDS.h/2)/1536),0);
    assert.ok(d.x<0 && d.y<0,'padding is kept, not trimmed');
    const vw=d.w*R_BOUNDS.w/1024, vh=d.h*R_BOUNDS.h/1536;
    assert.ok(vw<=size+1e-6 && vh<=size*1.86+1e-6,'body overflows its box');
    /* Its artwork is broader than it is long against the shared box, so the
       width is what runs out first - which is why it carries no race scale. */
    near(vw,size);
    assert.ok(vh<size*1.86,'and still has room down the lane');
  }
});
test('every Rhosyn plume root is a measured tailpipe, at every size and tilt',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(true,tilt,size,size*1.86,false,'rhosyn');
    const d=images()[0],p=plumes();
    assert.equal(p.length,R_PIPES.length,'both outlets light, and no more');
    /* Under the body, so the car sits in front of its own fire. */
    assert.ok(p.every(q=>calls.indexOf(q)<calls.indexOf(d)));
    for(const [i,[px,py]] of R_PIPES.entries()){
      const [ax,ay]=anchorOn(d,px,py);
      near(p[i].root[0],ax);near(p[i].root[1],ay);
      assert.ok(p[i].tip[1]>p[i].root[1],'the plume runs out behind the car');
    }
    if(tilt) assert.ok(Math.abs(p[0].root[0]-140)>1e-9,'the root leans with the car');
  }
  /* Never a body fire: that is Flann's ultimate and nobody else's. */
  assert.equal(fires().length,0);
  draw(false,0,60,111.6,false,'rhosyn');
  assert.equal(plumes().length,0,'no boost, no plume');
});
test('the Rhosyn plume stays in its outlet through scale and rotation together',()=>{
  /* The same measured anchor, put through two very different transforms: if
     the effect were pinned by a world-space offset instead of through the
     sprite frame, these two would not agree about where the pipe is. */
  for(const [size,tilt] of [[18,0.31],[210,-0.27]]){
    draw(true,tilt,size,size*1.86,false,'rhosyn');
    const d=images()[0],p=plumes();
    for(const [i,[px,py]] of R_PIPES.entries()){
      const [ax,ay]=anchorOn(d,px,py);
      near(p[i].root[0],ax);near(p[i].root[1],ay);
      /* and genuinely inside the drawn artwork rather than off its edge */
      const bx=d.m[0]*(d.x+d.w*R_BOUNDS.x/1024)+d.m[2]*(d.y+d.h*R_BOUNDS.y/1536)+d.m[4];
      assert.ok(isFinite(bx));
    }
    /* The two roots are symmetric about the car, because the outlets are. */
    const mid=(p[0].root[0]+p[1].root[0])/2, midY=(p[0].root[1]+p[1].root[1])/2;
    const [cx,cy]=anchorOn(d,512,1333);
    near(mid,cx);near(midY,cy);
  }
});
test('menu preview and race rendering both draw Rhosyn from its own model',()=>{
  run(`G.local=false;G.car="rhosyn";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;});`);
  clearWorld();
  calls=[];run('render();');
  assert.equal(sheet('v_rhosyn.PNG').length,1,'the race draws the sheet');
  calls=[];run('previewCar("rhosyn");paintCarIcons();');
  assert.ok(sheet('v_rhosyn.PNG').length>=1,'and so does the garage preview');
  assert.equal(run('racerModel("me").sprite'),'v_rhosyn.PNG');
});

/* ---- Aero-Glow, seen from outside and from inside ---------------
   Rhosyn's ultimate is the one that changes which world a view draws, so the
   questions here are about who sees what. The rest of the field must lose the
   car and everything pinned to it; its own driver must keep it, in a world
   with nothing else in it. */
f.boot();
f.images.forEach(i=>i.load());
test('a Rhosyn in Aero-Glow is gone from every other view, and so is everything pinned to it',()=>{
  run(`G.local=false;G.car="siren";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;r.y=playerY+9000;});
       globalThis.r=G.rivals[0];r.car="rhosyn";r.y=playerY-150;r.boosting=true;
       r.mindT=MIND_CONTROL_TIME;r.mindPop=0;r.invuln=2;`);
  clearWorld();
  /* Before it fires, player one sees the car, its exhaust and its notes. */
  run('r.invuln=0;G.shake=0;');calls=[];run('render();');
  assert.equal(sheet('v_rhosyn.PNG').length,1,'the body is on the road');
  assert.equal(plumes().length,2,'and its exhaust with it');
  assert.equal(notes('pion_note.PNG').length,3,'and the notes it is wearing');
  /* Fired, and given long enough to be all the way out. */
  run('r.ult=1;startUlt(r);tickAeroGlow(r,AERO_SHIFT+AERO_FADE);');
  assert.equal(run('r.aeroPhase'),'glow');
  assert.equal(run('aeroHideK(r)'),1);
  assert.equal(run('racerViewAlpha(r,"me")'),0);
  run('G.shake=0;');calls=[];run('render();');
  assert.equal(sheet('v_rhosyn.PNG').length,0,'the body is gone');
  assert.equal(plumes().length,0,'and so is the exhaust that would outline it');
  assert.equal(notes('pion_note.PNG').length,0,'and the notes that would locate it');
  assert.equal(notes('queen_note.PNG').length,0);
  /* It is still in the race, still in the order and still covering ground. */
  assert.equal(run('r.finished'),null);
  assert.equal(run('r.dead'),0);
  assert.equal(run('racers().some(a=>a.obj===r)'),true);
  /* It is simply unreachable, in both directions. */
  assert.equal(run('noContact(r)'),true);
  assert.equal(run('racerDetectable(r)'),false);
  /* And on the way back it comes through the flash rather than popping in. */
  run('endUlt(r);');
  assert.equal(run('r.aeroPhase'),'out');
  run('tickAeroGlow(r,AERO_SHIFT+AERO_FADE);');
  assert.equal(run('r.aeroPhase'),'off');
  assert.equal(run('racerViewAlpha(r,"me")'),1);
  run('r.mindT=0;r.mindOut=0;r.boosting=false;r.invuln=0;G.shake=0;');
  calls=[];run('render();');
  assert.equal(sheet('v_rhosyn.PNG').length,1,'the body is back on the road');
});
test('the owner is shown Aero-Glow, with its own car and nobody else in it',()=>{
  run(`G.local=false;G.car="rhosyn";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="flann";r.dead=0;r.invuln=0;r.boosting=true;
                            r.y=playerY-120;});`);
  clearWorld();
  /* The shared world first: five rivals and the player are all drawn. */
  run('G.shake=0;');calls=[];run('render();');
  assert.equal(sheet('v_flann.PNG').length,5,'the field is on the road');
  assert.equal(sheet('v_rhosyn.PNG').length,1);
  /* Away, and the view is the void: the owner's car and nothing else. */
  run('G.ult=1;startUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);');
  assert.equal(run('aeroGlowViewActive("me")'),true);
  run('G.shake=0;');calls=[];run('render();');
  assert.equal(sheet('v_rhosyn.PNG').length,1,'the owner still sees its own car');
  assert.equal(sheet('v_flann.PNG').length,0,'and nobody else at all');
  assert.equal(notes('queen_note.PNG').length,0);
  assert.equal(notes('pion_note.PNG').length,0);
  /* Drawn whole, not at the fade the rest of the field watched it leave by. */
  const mine=alphaDraws('render();');
  assert.equal(mine.length,1);
  assert.equal(mine[0].car,'rhosyn');
  assert.equal(mine[0].alpha,1);
  /* And back into the shared world when it ends - wearing the two seconds of
     Invulnerable the return grants, which is what the blink below is. */
  run('endUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);');
  assert.equal(run('aeroGlowViewActive("me")'),false);
  assert.equal(run('G.invuln'),run('INVULNERABLE_TIME'));
  run('G.invuln=0;G.shake=0;');calls=[];run('render();');
  assert.equal(sheet('v_flann.PNG').length,5,'the field is there again');
  assert.equal(sheet('v_rhosyn.PNG').length,1);
});
test('Aero-Glow renders from canonical state and mutates none of it',()=>{
  run(`G.local=false;G.car="rhosyn";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.ult=1;startUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);G.shake=0;`);
  clearWorld();
  const before=run('JSON.stringify(G)');
  for(let i=0;i<60;i++){f.setNow(60000+i*16);run('render();');}
  assert.equal(run('JSON.stringify(G)'),before,'the void moved the race');
  assert.equal(f.images.length,8,'still eight images and no more');
  /* Nothing in the world itself reads a clock: with the car's own exhaust
     pulse pinned, the same state draws the same frame however much time has
     passed. What it moves with is the road the racer is actually covering. */
  run('motionPref="reduced";');
  f.setNow(61000);calls=[];run('render();');const a=JSON.stringify(calls);
  f.setNow(99000);calls=[];run('render();');
  assert.equal(JSON.stringify(calls),a,'the void is drawn off a clock');
  run('G.meters+=400;');calls=[];run('render();');
  assert.notEqual(JSON.stringify(calls),a,'the void does not move with the racer');
  /* and it is the owner's own distance it reads, not the world's scroll */
  run('G.meters-=400;');calls=[];run('render();');
  assert.equal(JSON.stringify(calls),a,'the void is not pinned to the racer');
  run('motionPref="full";');
  run('endUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);G.invuln=0;');
});
test('one local column can be in Aero-Glow while the others race on',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.rules=defaultRules();
         G.picks=["rhosyn"].concat(CAR_IDS.filter(c=>c!=="rhosyn")).slice(0,${seats});
         G.car=G.picks[0];startRace();clearTimers();G.state="running";G.invuln=0;
         G.rivals.forEach(r=>{r.dead=0;r.invuln=0;r.y=playerY-carH*0.5;});
         G.shake=0;`);
    clearWorld();
    /* Seat one is the only Rhosyn, drawn once per column before it fires. */
    calls=[];run('render();');
    assert.equal(sheet('v_rhosyn.PNG').length,seats);
    const fieldBefore=sheet('v_flann.PNG').length;
    assert.ok(fieldBefore>0,'somebody else is on the road');
    /* Away: its own column still draws it, every other column draws nothing
       of it, and every other column still draws the real race. */
    run('G.ult=1;startUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);G.shake=0;');
    calls=[];run('render();');
    assert.equal(sheet('v_rhosyn.PNG').length,1,
                 `${seats} columns draw the departed Rhosyn exactly once`);
    /* The other columns lost only the Rhosyn: the shared world is still
       theirs, minus one car - one column's worth of Flanns is gone with the
       void, the rest are drawn as they always were. */
    assert.equal(sheet('v_flann.PNG').length,fieldBefore-fieldBefore/seats,
                 'the other columns still render the real race');
    /* Only that one column goes white, and only that one column is in the
       void: the whiteout is per view and always was. */
    assert.equal(run('whiteoutActive("me")'),true);
    for(let i=1;i<seats;i++){
      assert.equal(run(`whiteoutActive(G.humans[${i}])`),false,'seat '+(i+1)+' is untouched');
      assert.equal(run(`aeroGlowViewActive(G.humans[${i}])`),false,'seat '+(i+1)+' still races');
    }
    /* And back: every column returns to the same one world, wearing the two
       seconds of Invulnerable the return grants - the blink that comes with it
       is the existing Condition and is cleared here so the count below is
       about the world rather than about the badge. */
    run('endUlt("me");tickAeroGlow("me",AERO_SHIFT+AERO_FADE);');
    assert.equal(run('G.invuln'),run('INVULNERABLE_TIME'));
    run('G.invuln=0;G.whiteT=0;G.shake=0;');
    calls=[];run('render();');
    assert.equal(sheet('v_rhosyn.PNG').length,seats);
    assert.equal(sheet('v_flann.PNG').length,fieldBefore);
  }
});

/* ---- Verdant's per-view opacity --------------------------------- */
f.boot();
/* Read out of the game's own tuning layer rather than written down twice. */
const OWN_A=run('VERDANT_OWN_ALPHA'), FADE=run('VERDANT_FADE');
/* Every drawCar the real render path makes, with the opacity each view asked
   for. This is the one number invisibility comes down to, so it is read off
   the shared entry point rather than inferred from anything drawn. */
function alphaDraws(code){
  run(`globalThis.shown=[];globalThis.realDrawCar=drawCar;
       drawCar=function(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha){
         shown.push({car:p.key,alpha:alpha===undefined?1:alpha});
         return realDrawCar(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha);};`);
  try { run(code); return JSON.parse(run('JSON.stringify(shown)')); }
  finally { run('drawCar=realDrawCar;'); }
}
test('an ulting Verdant is half in its own view and nothing in anybody else’s',()=>{
  run(`G.local=false;G.car="verdant";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;});`);
  clearWorld();
  /* Before the ultimate every car is drawn solid. */
  let drawn=alphaDraws('render();');
  assert.ok(drawn.every(d=>d.alpha===1),'nothing is faded before the ultimate');
  /* The fade is a ramp, not a snap: a quarter of a second to get there. */
  run('G.ult=1;startUlt("me");tickVerdant("me",VERDANT_FADE/2);');
  drawn=alphaDraws('render();');
  const mid=drawn.find(d=>d.car==='verdant');
  assert.ok(mid.alpha>OWN_A && mid.alpha<1,'the owner fades through');
  run('tickVerdant("me",VERDANT_FADE);');
  assert.equal(run('G.verdantHide'),1);
  drawn=alphaDraws('render();');
  near(drawn.find(d=>d.car==='verdant').alpha,OWN_A);
  assert.ok(drawn.filter(d=>d.car!=='verdant').every(d=>d.alpha===1),'only Verdant fades');
  /* A rival Verdant, seen from player one's view, is gone entirely. */
  run(`endUlt("me");G.verdantHide=0;G.car="siren";G.rivals[0].car="verdant";
       G.rivals[0].dead=0;G.rivals[0].invuln=0;G.rivals[0].y=playerY-150;
       G.rivals[0].ult=1;startUlt(G.rivals[0]);tickVerdant(G.rivals[0],VERDANT_FADE*2);`);
  drawn=alphaDraws('render();');
  assert.equal(drawn.some(d=>d.car==='verdant'),false,'an invisible car is not drawn at all');
  /* And nothing pinned to it is drawn either: no plume, no badge stack. */
  clearWorld();run('G.rivals[0].boosting=true;');
  calls=[];run('render();');
  assert.equal(sheet('v_verdant.PNG').length,0,'the body is gone');
  assert.equal(plumes().length,0,'and so is the exhaust that would outline it');
  /* Ending it brings the car back. */
  run('G.rivals[0].boosting=false;endUlt(G.rivals[0]);tickVerdant(G.rivals[0],VERDANT_FADE*2);');
  drawn=alphaDraws('render();');
  near(drawn.find(d=>d.car==='verdant').alpha,1);
});
test('each local column answers for its own seat, in two, three and four',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.rules=defaultRules();
         G.picks=["verdant"].concat(CAR_IDS.filter(c=>c!=="verdant")).slice(0,${seats});
         G.car=G.picks[0];startRace();clearTimers();G.state="running";G.invuln=0;
         G.rivals.forEach(r=>{r.dead=0;r.invuln=0;});
         G.ult=1;startUlt("me");tickVerdant("me",VERDANT_FADE*2);`);
    clearWorld();
    const drawn=alphaDraws('render();').filter(d=>d.car==='verdant');
    /* Seat one is the only Verdant, drawn once in its own column at half and
       not at all in any of the others. */
    assert.equal(drawn.length,1,`${seats} columns draw the hidden Verdant once`);
    near(drawn[0].alpha,OWN_A);
    /* A hit reveals it to everybody for a split second, then it goes again. */
    run('verdantReveal("me");');
    const seen=alphaDraws('render();').filter(d=>d.car==='verdant');
    assert.equal(seen.length,seats,'every column sees the reveal');
    assert.ok(seen.every(d=>d.alpha===1));
    assert.equal(run('G.ultOn'),true,'and the reveal did not cut the ultimate short');
    run('G.verdantRevealT=0;tickVerdant("me",VERDANT_FADE*2);');
    assert.equal(alphaDraws('render();').filter(d=>d.car==='verdant').length,1);
    run('endUlt("me");G.verdantHide=0;G.verdantRevealT=0;');
  }
});

/* ---- the notes -------------------------------------------------- */
f.boot();
/* The note images are square and drawn through the same drawImage every body
   is, so they are told apart by which sheet they came from. */
function notes(src){return images().filter(c=>c.image && c.image.src===src);}
test('the queen note floats over an ulting Lolanthe, pops in, bobs and pops out',()=>{
  f.images.forEach(i=>i.load(1254,1254));
  run(`G.local=false;G.car="lolanthe";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;r.y=playerY+9000;});
       motionPref="full";`);
  clearWorld();
  /* The notes are drawn in the world at absolute coordinates, so the camera
     shake a burst leaves behind would move them; it is settled here rather
     than allowed to jitter every comparison below. */
  const still=()=>{run('G.shake=0;');calls=[];run('render();');};
  still();
  assert.equal(notes('queen_note.PNG').length,0,'no note before the ultimate');
  run('G.ult=1;startUlt("me");');
  assert.equal(run('G.queenPop'),run('QUEEN_POP'),'the pop-in is armed by the ultimate');
  /* The very first instant of the pop is nothing at all, which is what a fade
     in means; half way through it is on screen and not yet at its size. */
  f.setNow(1000);still();
  assert.equal(notes('queen_note.PNG').length,0,'it starts from nothing');
  run('G.queenPop=QUEEN_POP*0.5;');
  f.setNow(1000);still();
  const small=notes('queen_note.PNG');
  assert.equal(small.length,1,'exactly one note, over the car');
  assert.ok(small[0].y+small[0].h/2 < run('playerY'),'and above the car');
  assert.ok(Math.abs(small[0].x+small[0].w/2-run('G.x'))<1e-6,'centred on it');
  /* Popping in: it arrives small and settles on its size. */
  run('G.queenPop=0;');still();
  const full=notes('queen_note.PNG')[0];
  assert.ok(full.w>small[0].w,'the note pops up to size rather than appearing at it');
  near(full.w,run('racerDims("me").h')*run('QUEEN_NOTE_K'));
  /* Bobbing: the same frame twice is the same note; a later frame is not. */
  f.setNow(1000);still();const a=notes('queen_note.PNG')[0].y;
  f.setNow(1000);still();near(notes('queen_note.PNG')[0].y,a);
  f.setNow(1000+run('QUEEN_BOB_RATE')*1000/4);still();
  assert.ok(Math.abs(notes('queen_note.PNG')[0].y-a)>1e-9,'it rises and falls');
  /* Reduced motion keeps the note and takes the movement out of it. */
  run('motionPref="reduced";');
  f.setNow(2000);still();const r=notes('queen_note.PNG')[0].y;
  f.setNow(7400);still();
  assert.equal(notes('queen_note.PNG').length,1,'the note stays');
  near(notes('queen_note.PNG')[0].y,r);
  run('motionPref="full";');
  /* The ultimate ending pops it out rather than deleting it. */
  run('tickUlt("me",ULT_TIME);');
  assert.equal(run('G.ultOn'),false);
  assert.equal(run('G.queenOut'),run('QUEEN_POP'));
  still();
  assert.equal(notes('queen_note.PNG').length,1,'it is still on its way out');
  run('G.queenOut=0;');still();
  assert.equal(notes('queen_note.PNG').length,0,'and then it is gone');
});
test('exactly three notes orbit a controlled racer, with no bob and no restart',()=>{
  run(`G.local=false;G.car="siren";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;r.y=playerY+9000;});
       motionPref="full";`);
  clearWorld();
  const still=()=>{run('G.shake=0;');calls=[];run('render();');};
  still();
  assert.equal(notes('pion_note.PNG').length,0);
  run('applyMindControl("me");G.mindPop=0;');
  f.setNow(1000);still();
  const three=notes('pion_note.PNG');
  assert.equal(three.length,3,'exactly three, never two and never four');
  /* A third of a turn apart on a ring taken from the racer’s own box. */
  const cx=run('G.x'), cy=run('playerY');
  const rx=run('racerDims("me").w')*run('MIND_ORBIT_X');
  const ry=run('racerDims("me").h')*run('MIND_ORBIT_Y');
  const angles=three.map(n=>Math.atan2((n.y+n.h/2-cy)/ry,(n.x+n.w/2-cx)/rx));
  for(let i=1;i<3;i++){
    let d=Math.abs(angles[i]-angles[0])%(Math.PI*2);
    d=Math.min(d,Math.PI*2-d);
    assert.ok(Math.abs(d-Math.PI*2/3)<1e-6,'the three are 120 degrees apart');
  }
  near(three[0].w,run('racerDims("me").h')*run('MIND_NOTE_K'));
  /* They turn, and they do not rise and fall: the ring's centre holds still. */
  const mid=n=>[n.x+n.w/2,n.y+n.h/2];
  const centre=ns=>[ns.reduce((a,n)=>a+mid(n)[0],0)/3, ns.reduce((a,n)=>a+mid(n)[1],0)/3];
  const c0=centre(three);
  f.setNow(1000+500);still();
  const later=notes('pion_note.PNG');
  assert.ok(Math.abs(mid(later[0])[0]-mid(three[0])[0])>1e-9,'they orbit');
  const c1=centre(later);
  assert.ok(Math.abs(c1[0]-c0[0])<1e-6 && Math.abs(c1[1]-c0[1])<1e-6,
            'the ring does not bob - that belongs to the queen note');
  /* Reduced motion keeps all three and stops the orbit. */
  run('motionPref="reduced";');
  f.setNow(3000);still();const s0=notes('pion_note.PNG').map(mid);
  f.setNow(9000);still();const s1=notes('pion_note.PNG').map(mid);
  assert.equal(s1.length,3);
  for(let i=0;i<3;i++){near(s1[i][0],s0[i][0]);near(s1[i][1],s0[i][1]);}
  run('motionPref="full";');
  /* Re-applying while already controlled resets the timer and must not replay
     the entrance. */
  run('G.mindT=0.4;applyMindControl("me");');
  assert.equal(run('G.mindT'),run('MIND_CONTROL_TIME'));
  assert.equal(run('G.mindPop'),0,'the pop-in did not restart');
  /* And the exit pops out rather than vanishing. */
  run('tickMindControl("me",MIND_CONTROL_TIME);');
  assert.equal(run('G.mindT'),0);
  assert.equal(run('G.mindOut'),run('MIND_POP'));
  still();
  assert.equal(notes('pion_note.PNG').length,3,'still on their way out');
  run('G.mindOut=0;');still();
  assert.equal(notes('pion_note.PNG').length,0);
});
test('the notes are proportional to whichever car is wearing them',()=>{
  run(`G.local=false;G.car="siren";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.dead=0;r.invuln=0;r.y=playerY+9000;});`);
  clearWorld();
  const sizes={};
  for(const car of JSON.parse(run('JSON.stringify(CAR_IDS)'))){
    run(`G.car=${JSON.stringify(car)};G.mindT=MIND_CONTROL_TIME;G.mindPop=0;G.mindOut=0;G.shake=0;`);
    f.setNow(4000);calls=[];run('render();');
    const ns=notes('pion_note.PNG');
    assert.equal(ns.length,3,car+' wears three notes');
    sizes[car]=ns[0].w;
    near(ns[0].w,run('racerDims("me").h')*run('MIND_NOTE_K'));
  }
  /* Tuned to the racer rather than to one model: the cars with a race size of
     their own carry proportionally larger notes. */
  assert.ok(sizes.flann>sizes.siren && sizes.neela>sizes.siren && sizes.verdant>sizes.siren);
  near(sizes.lolanthe,sizes.siren);
  near(sizes.rhosyn,sizes.siren);
  run('G.mindT=0;G.mindOut=0;G.car="flann";');
});
test('a full render of both new ultimates changes no race state',()=>{
  run(`G.local=false;G.car="lolanthe";G.mode="endless";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach(r=>{r.car="siren";r.dead=0;r.invuln=0;});
       G.rivals[0].car="verdant";G.rivals[0].ult=1;startUlt(G.rivals[0]);
       G.rivals[0].verdantHide=0.5;G.rivals[1].mindT=MIND_CONTROL_TIME;
       G.ult=1;startUlt("me");`);
  clearWorld();
  const before=run('JSON.stringify(G)');
  for(let i=0;i<60;i++){f.setNow(40000+i*16);run('render();');}
  assert.equal(run('JSON.stringify(G)'),before);
  assert.equal(f.images.length,8,'still eight images and no more');
  run('endUlt("me");endUlt(G.rivals[0]);');
});

console.log(`\n${checks} sprite checks passed (Canvas/Image doubles; browser visuals separate).`);
