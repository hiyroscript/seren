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
function test(name,fn){fn();checks++;console.log('  ok  '+name);}
function draw(boost=true,tilt=0,w=60,h=111.6,ult=false,car='flann'){
  calls=[];matrix=[1,0,0,1,0,0];stack=[];
  run(`drawCar(140,220,${w},${h},CARS.${car},${tilt},true,${boost},${ult});`);
  assert.equal(stack.length,0);assert.deepEqual(matrix,[1,0,0,1,0,0]);
  return calls;
}
function images(){return calls.filter(c=>c.type==='image');}
function plumes(){return calls.filter(c=>c.type==='plume');}
function fires(){return calls.filter(c=>c.type==='fire');}
/* Clear everything else on the road that draws a radial gradient of its own,
   so a `fire` recorded during a full render can only have come from a car. */
const clearWorld=()=>run('G.traps=[];G.boxes=[];G.slicks=[];G.missiles=[];G.fx=[];');
test('one cached image, exact case, unloaded and failed assets safely skip drawing',()=>{
  assert.equal(f.images.length,1);assert.equal(f.images[0].src,'v_flann.PNG');
  draw();assert.equal(calls.length,0);f.images[0].complete=true;draw();assert.equal(calls.length,0);
});
test('late load schedules a menu repaint through the common renderer',()=>{
  f.frames.length=0;f.images[0].load();assert.equal(f.frames.length,1);
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
  for(let i=0;i<100;i++){f.setNow(i*16);draw();draw(true,0.12,60,111.6,true);}
  assert.equal(run('JSON.stringify(G)'),before);assert.equal(f.images.length,1);
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
  for(const car of ['phantom','bolt','timestamp','rose','siren']){
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
  run('G.car="phantom";G.rivals[0].car="flann";G.rivals[0].y=playerY-150;G.rivals[0].invuln=0;G.rivals[0].boosting=true;');
  calls=[];run('render();');assert.equal(images().length,1);assert.equal(plumes().length,2);
  assert.equal(fires().length,0);
  /* A rival Flann gets the identical treatment - the effect is per racer, not
     a property of being the person holding the controller. */
  run('G.rivals[0].ult=1;startUlt(G.rivals[0]);');calls=[];run('render();');
  assert.ok(fires().length>=6);
  run('endUlt(G.rivals[0]);G.car="flann";G.rivals[0].car="phantom";');
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
test('Flann alone is drawn larger on the road; the other five keep their size',()=>{
  clearWorld();
  run(`G.local=false;G.car="flann";G.rules=defaultRules();startRace();clearTimers();
       G.state="running";G.invuln=0;G.dead=0;
       G.rivals.forEach((r,i)=>{r.car=CAR_IDS[i+1];r.invuln=0;r.dead=0;r.y=playerY-140*(i+1);});`);
  const drawn=JSON.parse(sizedDraws('render();'));
  const [base,tall]=[run('carW'),run('carH')];
  assert.equal(drawn.length,6);
  for(const d of drawn){
    const k=d.car==='flann'?1.12:1;
    near(d.w,base*k);near(d.h,tall*k);
    near(d.h/d.w,tall/base);                          /* aspect ratio preserved */
  }
  const flann=drawn.find(d=>d.car==='flann');
  assert.ok(flann.w>base && flann.h>tall,'larger than the shared car box');
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
    run(`G.local=true;G.players=${seats};G.picks=CAR_IDS.slice(0,${seats});G.car=G.picks[0];G.rules=defaultRules();startRace();clearTimers();G.state="running";G.invuln=0;G.boosting=true;`);
    calls=[];run('render();');assert.equal(images().length,seats);assert.equal(plumes().length,2*seats);
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
console.log(`\n${checks} sprite checks passed (Canvas/Image doubles; browser visuals separate).`);
