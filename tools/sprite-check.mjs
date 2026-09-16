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
/* Three sheets between them - Flann's, Neela's car and Neela's alternate form -
   each fetched once, each spelled exactly as the file on disk is, and none of
   them drawn before it has arrived. The casing matters: the repository serves
   these straight off a case-sensitive host. */
test('three cached images, exact case, unloaded and failed assets safely skip drawing',()=>{
  assert.equal(f.images.length,3);
  assert.deepEqual(f.images.map(i=>i.src),['v_flann.PNG','v_neela.PNG','vtm_neela.PNG']);
  assert.equal(new Set(f.images.map(i=>i.src)).size,3,'no sheet is fetched twice');
  /* and the cache is keyed by that same exact name */
  for(const src of ['v_flann.PNG','v_neela.PNG','vtm_neela.PNG'])
    assert.equal(run(`!!CAR_SPRITES[${JSON.stringify(src)}]`),true,src+' is cached');
  assert.equal(run('Object.keys(CAR_SPRITES).length'),3);
  draw();assert.equal(calls.length,0);f.images[0].complete=true;draw();assert.equal(calls.length,0);
});
test('every late load schedules a menu repaint through the common renderer',()=>{
  for(const image of f.images){
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
  }
  assert.equal(run('JSON.stringify(G)'),before);assert.equal(f.images.length,3);
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
  for(const car of ['neela','bolt','timestamp','rose','siren']){
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
  run('G.rivals.forEach(r=>{r.car="bolt";r.dead=0;r.invuln=0;});');
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
  run('G.car="bolt";G.rivals[0].car="flann";G.rivals[0].y=playerY-150;G.rivals[0].invuln=0;G.rivals[0].boosting=true;');
  calls=[];run('render();');assert.equal(images().length,1);assert.equal(plumes().length,2);
  assert.equal(fires().length,0);
  /* A rival Flann gets the identical treatment - the effect is per racer, not
     a property of being the person holding the controller. */
  run('G.rivals[0].ult=1;startUlt(G.rivals[0]);');calls=[];run('render();');
  assert.ok(fires().length>=6);
  run('endUlt(G.rivals[0]);G.car="flann";G.rivals[0].car="bolt";');
});

/* Sizes as the road actually asks for them, straight off the shared entry
   point every racer, bot and menu preview is drawn through. */
function sizedDraws(code){
  run(`globalThis.sizes=[];globalThis.realDrawCar=drawCar;
       drawCar=function(x,y,w,h,p,tilt,isPlayer,boosting,ulting){
         sizes.push({car:p.key,w:w,h:h,boost:!!boosting,ult:!!ulting});
         return realDrawCar(x,y,w,h,p,tilt,isPlayer,boosting,ulting);};`);
  try { run(code); return run('JSON.stringify(sizes)'); }
  finally { run('drawCar=realDrawCar;'); }
}
test('the two sprite cars are drawn larger on the road; the other four keep their size',()=>{
  clearWorld();
  run(`G.local=false;G.car="flann";G.rules=defaultRules();startRace();clearTimers();
       G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach((r,i)=>{r.car=CAR_IDS[i+1];r.invuln=0;r.dead=0;r.y=playerY-140*(i+1);});`);
  const drawn=JSON.parse(sizedDraws('render();'));
  const [base,tall]=[run('carW'),run('carH')];
  assert.equal(drawn.length,6);
  const SCALES={flann:1.12,neela:1.18};
  for(const d of drawn){
    const k=SCALES[d.car]||1;
    near(d.w,base*k);near(d.h,tall*k);
    near(d.h/d.w,tall/base);                          /* aspect ratio preserved */
  }
  for(const car of ['flann','neela']){
    const sprite=drawn.find(d=>d.car===car);
    assert.ok(sprite.w>base && sprite.h>tall,car+' is larger than the shared car box');
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
         G.rivals.forEach(r=>{r.car="bolt";r.dead=0;r.invuln=0;r.boosting=false;});`);
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
     teleport can be any of the six. */
  for(const car of ['bolt','timestamp','rose','siren']){
    draw(false,0,60,111.6,false,car,0);
    const off = lines().length;
    draw(false,0,60,111.6,false,car,0.8);
    /* Those four have no hull of their own, so the flash falls back to the
       shared body rectangle - which is still their silhouette, not a circle. */
    assert.equal(lines().length - off, run('CAR_HIT_RECT.length') - 1,
                 car+' flashes white on its own outline');
  }
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
       G.rivals.forEach(r=>{r.car="bolt";r.dead=0;r.invuln=0;r.trail=[];});`);
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
  run(`G.car="bolt";G.rivals[0].car="neela";G.rivals[0].y=playerY-150;
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
       G.rivals.forEach(r=>{r.car="bolt";r.dead=0;r.invuln=0;});
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
  assert.equal(f.images.length,3,'still three sheets and no more');
  run('endUlt("me");endUlt(G.rivals[0]);');
});
test('every local column carries its own Neela body and nobody else is white',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.rules=defaultRules();
         G.picks=["neela"].concat(CAR_IDS.filter(c=>c!=="neela")).slice(0,${seats});
         G.car=G.picks[0];startRace();clearTimers();G.state="running";G.invuln=0;
         G.rivals.forEach(r=>{r.dead=0;r.invuln=0;if(r.car!=="flann")r.car="bolt";});`);
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

console.log(`\n${checks} sprite checks passed (Canvas/Image doubles; browser visuals separate).`);
