#!/usr/bin/env node
/* Hazard balance, swept contacts and shared geometry. Dependency-free; the
   Canvas double checks drawing arguments, not a substitute for visual QA. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f=fixture(), {run}=f;
f.boot();
run("cv.getBoundingClientRect=()=>({width:400,height:800,left:0,top:0});");
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('  ok  '+name);};
const equal=(code,value)=>assert.equal(run(code),value,code);
const near=(code,value)=>assert.ok(Math.abs(run(code)-value)<1e-7,code);
function setup(side='player',car='lolanthe',form=false){
  run(`G.local=false;G.mode='endless';G.car=${JSON.stringify(car)};G.rules=defaultRules();
    startRace();clearTimers();layout();G.state='running';G.nextTrap=G.nextRow=1e9;
    G.rules.bubbles=false;G.rules.boost=false;G.tier=20;G.speed=BASE_SPEED*3;
    G.lane=G.dodgeLane=1;G.x=laneCX(1);G.tilt=0;G.invuln=0;G.dead=0;
    G.rivals.forEach(r=>{r.human=true;r.abs=G.speed;r.ult=0;r.invuln=0;
      r.lane=0;r.x=laneCX(0);placeRivalAtY(r,playerY-20000);});
    globalThis.R=G.rivals[0];R.car=G.car;R.human=${side==='local'};
    globalThis.who=${side==='player'?"'me'":'R'};globalThis.o=who==='me'?G:who;
    o.lane=o.dodgeLane=1;o.x=laneCX(1);o.tilt=0;o.ult=0;o.shield=SHIELD_MAX;
    if(who!=='me'){placeRivalAtY(R,playerY);G.x=laneCX(0);G.lane=0;}
    o.ultOn=${form && car==='neela'};o.ultT=15;o.neelaForm=${form && car==='neela'};o.coleBike=${form && car==='cole'};
  `);
}
test('gap endpoints, monotonic tiers, clamping and immunity to temporary pace',()=>{
  setup();
  const saved=Math.random;
  try{
    for(const endpoint of [0,1]){
      Math.random=()=>endpoint;
      let previous=0;
      for(let tier=0;tier<=20;tier++){
        run(`G.tier=${tier};`);
        const expected=(endpoint?900:430)*(1+.18*tier/20);
        near('nextTrapGap()',expected);assert.ok(expected>=previous);previous=expected;
        for(const speed of [0,210,420,1260,3780]){
          run(`G.speed=${speed};G.boosting=true;G.ultOn=true;G.slowT=1;G.dead=1;`);
          near('nextTrapGap()',expected);
        }
      }
      run('G.tier=-10;');near('nextTrapGap()',endpoint?900:430);
      run('G.tier=100;');near('nextTrapGap()',(endpoint?900:430)*1.18);
    }
  }finally{Math.random=saved;}
  setup();run('startRace();clearTimers();');equal('G.nextTrap',620);
});
test('spawn sizes, organic aspect ratio, seam and custom-race gates',()=>{
  setup();
  for(const biome of ['city','desert','space']){
    run(`G.biome='${biome}';G.seam=null;G.traps=[];for(let i=0;i<100;i++)spawnTrap();`);
    equal('G.traps.length',100);
    if(biome==='city') equal('G.traps.every(p=>p.rx>=laneW*.30*1.08 && p.rx<=laneW*.48*1.08 && p.ry/p.rx>=.52 && p.ry/p.rx<=.82)',true);
    if(biome==='desert') equal('G.traps.every(p=>p.r>=15*SCENE*1.08 && p.r<=25*SCENE*1.08)',true);
    if(biome==='space') equal('G.traps.every(p=>p.r>=laneW*.42*1.06 && p.r<=laneW*.60*1.06 && p.mr>=13*SCENE*1.06 && p.mr<=21*SCENE*1.06)',true);
    run('G.traps=[];G.seam=0;spawnTrap();');equal('G.traps.length',0);
    run('G.seam=null;G.rules.traps=false;spawnTrap();');equal('G.traps.length',0);
    run('G.rules.traps=true;');
  }
});
const forms=[['flann',false],['neela',false],['neela',true],['lolanthe',false],['verdant',false],['rhosyn',false],['saffron',false],['cole',false],['cole',true]];
for(const [car,form] of forms) test(car+(form?' alternate':'')+' precise edge and neighboring meteor lane, for every driver',()=>{
  for(const side of ['player','bot','local']){
    setup(side,car,form);
    run(`o.tilt=.21;globalThis.box=carHit(who);
      globalThis.edge=box.points.reduce((a,b)=>a.x>b.x?a:b);
      globalThis.weed={kind:'weed',x:edge.x+10-.00001,y:edge.y,r:10/WEED_BODY_SCALE};
      globalThis.motion={dt:0,racers:beginPerfectDodges().racers,traps:[]};`);
    equal('trapContact(weed,weed,who,motion)!==null',true);
    run('weed.x+=.001;');equal('trapContact(weed,weed,who,motion)',null);
    run('o.tilt=0;globalThis.ring={x:laneCX(0)+laneW*.06,y:racerY(who),r:laneW*.60*1.06};');
    equal('dodgeCircleHits(carHit(who),ring.x,ring.y,ring.r)',false);
  }
});
test('puddle contact follows seeded perimeter; detached droplets remain harmless',()=>{
  setup();
  run(`globalThis.p={kind:'puddle',x:o.x,y:playerY,rx:40,ry:24,s:.73};
    globalThis.tiny=(x,y)=>({points:[{x:x-.01,y:y-.01},{x:x+.01,y:y-.01},{x:x+.01,y:y+.01},{x:x-.01,y:y+.01}]});`);
  equal('puddleHits(p,tiny(p.x,p.y))',true);
  equal('puddleHits(p,tiny(p.x+Math.cos(p.s*6.28)*p.rx*1.35,p.y+Math.sin(p.s*6.28)*p.ry*1.4))',false);
  // The irregular corner differs from a bounding ellipse for this seed.
  equal('puddleHits(p,tiny(p.x+p.rx*.95,p.y))',false);
});
for(const side of ['player','bot','local']) test(side+' high-speed ground encounters at 30/60/120 FPS and 50ms clamp',()=>{
  for(const [car,form] of forms) for(const kind of ['puddle','weed']) for(const dt of [1/30,1/60,1/120,.05]){
    setup(side,car,form);
    run(`carW=16;carH=30;G.speed=1260;o.abs=1260;
      globalThis.h={kind:'${kind}',b:'city',x:o.x,y:racerY(who)-90,rx:5,ry:3,r:4,
        s:.4,age:1,rot:0,vx:0,fall:1,hit:0,nm:0};G.traps=[h];
      for(let elapsed=0;elapsed<.18;elapsed+=${dt}){
        const mf=beginPerfectDodges();const tf=updateTraps(${dt},1260*${dt},'running',mf);
        resolveTraps(tf,'running');
      }`);
    equal(kind==='puddle'?'o.blind>0':"(who==='me'?G.slowT:o.slow)>0",kind==='puddle'||!(car==='neela'&&form));
    if(kind==='puddle') equal('(h.hit & (who===\'me\'?1:2))!==0',true);
    else equal('G.traps.includes(h)',false);
  }
});
test('full update keeps player, bot and local hazard consequences equal at 1x/2x/3x',()=>{
  for(const side of ['player','bot','local']) for(const tier of [0,10,20]) for(const dt of [1/30,1/60,1/120,.05]){
    setup(side);run(`G.tier=${tier};G.speed=BASE_SPEED*speedMult();R.abs=G.speed;
      R.changeT=1e9;carW=16;carH=30;
      globalThis.h={kind:'puddle',b:'city',x:o.x,y:racerY(who)-50,rx:6,ry:3,s:.4,hit:0,nm:0};
      G.traps=[h];globalThis.initialShield=o.shield;
      for(let elapsed=0;elapsed<.25;elapsed+=${dt})update(${dt});`);
    equal('o.blind>0',true);equal('o.shield===initialShield-1',true);
    equal("(h.hit & (who==='me'?1:2))!==0",true);
  }
});
test('guarded exchanges do not sweep through hazards between teleport endpoints',()=>{
  setup();run(`carW=16;carH=30;o.x-=100;
    globalThis.mf={dt:.05,racers:beginPerfectDodges().racers};
    globalThis.p={kind:'puddle',x:o.x+100,y:playerY,rx:8,ry:6,s:.4};
    o.x+=200;o.swapGuard=.1;`);
  equal('trapContact(p,p,"me",mf)',null);
});
test('relative lateral sweep catches crossing weed and rejects a parallel near miss',()=>{
  setup();run(`carW=16;carH=30;
    globalThis.h={kind:'weed',x:o.x+80,y:playerY,r:4};
    globalThis.before={...h,x:o.x-80};globalThis.mf={dt:.05,racers:beginPerfectDodges().racers};`);
  equal('dodgeCircleHits(carHit(),before.x,before.y,weedBodyRadius(h))',false);
  equal('dodgeCircleHits(carHit(),h.x,h.y,weedBodyRadius(h))',false);
  equal('trapContact(h,before,"me",mf)!==null',true);
  run('h.y=before.y=playerY+100;');equal('trapContact(h,before,"me",mf)',null);
  // A car can cross a stationary puddle, too; sweeping only hazard Y misses it.
  run(`o.x-=100;globalThis.mf={dt:.05,racers:beginPerfectDodges().racers};
    globalThis.p={kind:'puddle',x:o.x+100,y:playerY,rx:8,ry:6,s:.4};o.x+=200;`);
  equal('puddleHits(p,carHit())',false);equal('trapContact(p,p,"me",mf)!==null',true);
});
test('falling rock renderer, roof contact and prediction share the scaled solid radius',()=>{
  setup();run(`globalThis.rock={kind:'meteor',b:'space',x:200,y:300,r:40,mr:20,s:.4,max:1,fall:.1,phase:0,t:0};`);
  const points=[];const old=f.ctx.lineTo;f.ctx.lineTo=(x,y)=>points.push([x,y]);
  try{run('drawMeteor(rock);');}finally{f.ctx.lineTo=old;}
  const radius=run('meteorRockRadius(rock)');
  // The nine seeded rock vertices are drawn from this radius, independent of glow.
  const expected=run('(()=>{const i=8,a=i/9*6.2832,rr=meteorRockRadius(rock)*(.72+((rock.s*83.1+i*37.7)%1)*.5);return [rock.x+Math.cos(a)*rr,rock.y-rockAlt(rock)+Math.sin(a)*rr];})()');
  assert.ok(points.some(p=>Math.hypot(p[0]-expected[0],p[1]-expected[1])<1e-8));
  assert.ok(radius>20);
  for(const side of ['player','bot','local']){
    setup(side);run(`globalThis.h={kind:'meteor',x:o.x,y:racerY(who),r:30,mr:20,max:1,fall:.01,phase:0,t:0};
      globalThis.hull=carHit(who);globalThis.edge=hull.points.reduce((a,b)=>a.x>b.x?a:b);
      h.x=edge.x+meteorRockRadius(h)-.01;h.y=edge.y+rockAlt(h);
      globalThis.mf={dt:0,racers:beginPerfectDodges().racers};`);
    equal('trapContact(h,h,who,mf,"rock")!==null',true);
    run('h.x+=.02;');equal('trapContact(h,h,who,mf,"rock")',null);
  }
});
test('every driver can smash a falling rock through the shared roof contact',()=>{
  for(const side of ['player','bot','local']){
    setup(side,'flann');run(`startUlt(who);
      globalThis.h={kind:'meteor',x:o.x,y:racerY(who),r:30,mr:20,max:1,fall:.01,phase:0,t:0};
      h.y+=rockAlt(h);G.traps=[h];updateTraps(0,0,'running');`);
    equal('G.traps.includes(h)',false);equal('h.phase',0);
    equal('o.ultOn',true);equal('o.dead',0);
  }
});
test('meteor ground blast uses impact-time pose, never the whole swept warning circle',()=>{
  for(const side of ['player','bot','local']) for(const dt of [1/30,1/60,1/120,.05]){
    setup(side);run(`carW=16;carH=30;
      globalThis.h={kind:'meteor',x:o.x+15,y:racerY(who)-1260*.006,r:12,mr:.01,max:1,fall:.006,phase:0,t:0};
      G.traps=[h];updateTraps(${dt},1260*${dt},'running');`);
    equal('o.dead>0',true);equal('h.phase',1);
    setup(side);run(`carW=16;carH=30;
      globalThis.h={kind:'meteor',x:o.x,y:racerY(who)+70,r:8,mr:.01,max:1,fall:.006,phase:0,t:0};
      G.traps=[h];updateTraps(${dt},1260*${dt},'running');`);
    equal('o.dead',0);
  }
});
test('puddle per-racer bits spend shields once; off-road and flight remain immune',()=>{
  for(const side of ['player','bot','local']){
    setup(side);run(`resetShield(who);globalThis.h={kind:'puddle',x:o.x,y:racerY(who),rx:30,ry:20,s:.3,hit:0,nm:0};G.traps=[h];updateTraps(0,0,'running');globalThis.shield=o.shield;updateTraps(0,0,'running');`);
    equal('o.shield===shield',true);
    for(const car of ['rhosyn','saffron']){
      setup(side,car);run(`o.ult=1;startUlt(who);globalThis.h={kind:'puddle',x:o.x,y:racerY(who),rx:30,ry:20,s:.3,hit:0,nm:0};G.traps=[h];updateTraps(0,0,'running');`);
      equal('o.blind',0);assert.equal(run("h.hit & (who==='me'?1:2)"),0,side+'/'+car+' immunity');
    }
  }
});
test('enlarged puddles and meteor blast presentation survive viewport-edge culling',()=>{
  setup();
  run(`globalThis.p={kind:'puddle',b:'city',x:200,y:100,rx:90,ry:70,s:.3};
    globalThis.mo={kind:'meteor',b:'space',x:200,y:100,r:90,mr:22,max:1,fall:.2,phase:1,t:.39};`);
  equal('trapReach(p)>=p.ry*1.4+6',true);equal('trapReach(mo)>=mo.r*1.5',true);
  const arcs=[];const old=f.ctx.arc;f.ctx.arc=(...args)=>arcs.push(args);
  try{run(`CT=0;CB=50;p.y=CB+60;G.traps=[p];drawTraps('city');`);assert.ok(arcs.length>0);
    arcs.length=0;run(`CT=200;CB=600;mo.y=CT-110;G.traps=[mo];drawTraps('space');`);assert.ok(arcs.length>0);
  }finally{f.ctx.arc=old;}
});
console.log(`\n${checks} hazard checks passed.`);
