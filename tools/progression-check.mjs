#!/usr/bin/env node
/* Shared pace, finish, boost and precision rewards through the real update.
   Also imported by ultimate-check.mjs so the standard regression command runs it. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f = fixture(), {run} = f;
f.images.forEach(image => image.load()); f.boot();
run("cv.getBoundingClientRect=()=>({width:400,height:800,left:0,top:0});");
let checks = 0;
const near = (code, expected, tolerance=1e-8) => assert.ok(Math.abs(run(code)-expected) < tolerance, `${code}: ${run(code)} != ${expected}`);
const equal = (code, expected) => assert.equal(run(code), expected, code);
const test = (name, fn) => {fn(); checks++; console.log('  ok  '+name);};
function setup(kind='player', mode='endless'){
  run(`G.local=false; G.car='lolanthe'; G.mode=${JSON.stringify(mode)};
    G.rules=defaultRules(); G.rules.bots=1; G.rules.traps=false; G.rules.bubbles=false;
    G.rules.boost=false; startRace(); G.state='running';
    G.nextTrap=G.nextRow=1e9; G.speed=BASE_SPEED;
    globalThis.R=G.rivals[0]; R.car='lolanthe'; R.human=${kind === 'local'};
    R.changeT=1e9; R.abs=BASE_SPEED; R.y=playerY-2000;
    globalThis.who=${kind === 'player' ? '"me"' : 'R'};
    globalThis.o=who==='me'?G:who;
    o.lane=1; o.dodgeLane=1; o.x=laneCX(1); o.ult=0;
    if(who!=='me'){R.y=playerY;G.lane=0;G.dodgeLane=0;G.x=laneCX(0);}
  `);
}
test('shared constants and runtime initialization',()=>{
  equal('SPEED_SECONDS',20); near('MULT_STEP',0.10); equal('MAX_MULT',3); equal('MAX_TIER',20);
  equal('ULT_CHARGE',85); equal('BOOST_SPEED',1.5); equal('G.speedT',20);
  equal('FINAL_TRACKS',3); equal('FINISH_STRETCH',900);
  equal('ULT_TIME',15); equal('ULT_SPEED',2); near('CAN_TIME',2.2); near('CAN_SPEED',1.55);
  near('SHUNT_TIME',0.8); near('SHUNT_BOOST',1.35);
});
test('all twenty tiers land at exact simulation deadlines without drift or overshoot',()=>{
  setup('player','bots'); run('G.rivals=[];'); near('speedMult()',1);
  for(let tier=1;tier<=20;tier++){
    run('for(let i=0;i<400;i++)update(0.05);');
    equal('G.tier',tier); near('speedMult()',1+tier/10);
    if(tier<20) equal('G.tracksLeft',-1);
  }
  equal('G.tracksLeft',3); equal('G.finishAt',0);
  run('for(let i=0;i<400;i++)update(0.05);'); equal('G.tier',20); near('speedMult()',3);
});
for(const mode of ['bots','local','endless']) test(mode+' final-track lifecycle and obsolete elapsed thresholds',()=>{
  setup('player',mode); run('G.rivals=[]; G.raceT=10000; update(0.01);');
  equal('G.tracksLeft',-1); equal('G.finishAt',0);
  run('G.tier=19; G.speedT=0.01; G.trackT=30; update(0.01);');
  equal('G.tier',20); equal('G.tracksLeft',mode==='endless'?-1:3); equal('G.finishAt',0);
  if(mode==='endless'){
    run('switchTrack();update(0.01);'); equal('G.tracksLeft',-1); equal('G.finishAt',0); equal('raceSpan()',null);
  } else {
    run('switchTrack();update(0.01);'); equal('G.tracksLeft',2); equal('G.finishAt',0);
    run('switchTrack();update(0.01);'); equal('G.tracksLeft',1); equal('G.finishAt',0);
    run('globalThis.m=G.meters;switchTrack();'); near('G.finishAt-m',900);
    run('update(0.01);'); equal('G.tracksLeft',0); near('raceSpan().to',run('G.finishAt'));
  }
});
test('HUD projection agrees at the speed threshold and keeps the multiplier visible',()=>{
  setup('player','bots');
  run('G.tier=19;G.speedT=0;G.trackT=17;G.raceT=400;G.meters=20000;globalThis.span=raceSpan().to;G.tracksLeft=3;');
  near('raceSpan().to',run('span'));
  run('G.tier=20;paintHUD(true);'); assert.equal(f.$('#raceClock').textContent,'3.00× · T-3');
  run('G.finishAt=G.meters+842;paintHUD(true);'); assert.equal(f.$('#raceClock').textContent,'3.00× · 842m');
  run('G.mode="endless";G.finishAt=0;G.tracksLeft=-1;G.tier=1;paintHUD(true);');
  assert.equal(f.$('#raceClock').textContent,'1.10×');
});
test('actual scroll, world objects and distance use the 1x/2x/3x physical speed',()=>{
  for(const tier of [0,10,20]){
    setup(); run(`G.tier=${tier};G.speed=BASE_SPEED*speedMult();G.rivals=[];
      G.props=[{b:'city',side:0,y:100,kind:0,s:0}];G.traps=[{kind:'puddle',x:0,y:0,rx:10,ry:10,s:0.5,hit:0,nm:0}];
      globalThis.scroll=G.scroll;globalThis.m=G.meters;update(0.01);`);
    const delta=420*(1+tier/10)*0.01;
    near('G.scroll-scroll',delta); near('G.meters-m',delta*0.075);
    near('G.props[0].y-100',delta); near('G.traps[0].y',delta);
  }
});
for(const kind of ['player','local','bot']){
  test(kind+' shared boost rates, lockout and 1.5x pace',()=>{
    setup(kind); run(`G.rules.boost=true;o.boosting=true;o.charge=1;
      if(who==='me')G.keyBoost=true;else R.wantBoost=true;
      globalThis.tick=dt=>who==='me'?update(dt):updateRival(o,dt,'running');`);
    run('tick(0.1);'); near('o.charge',1-0.1/5.5);
    // A bot may decide to release early; capacity is independent of that decision.
    run(`for(let i=0;i<53;i++){o.boosting=true;if(who!=='me')o.wantBoost=true;tick(0.1);}`);
    near('o.charge',1-5.4/5.5);
    run(`o.boosting=true;if(who!=='me')o.wantBoost=true;tick(0.1);`);
    equal('o.charge',0); equal('o.boostLock',true);
    run(`o.boosting=false;if(who==='me')G.keyBoost=false;else o.wantBoost=false;
      for(let i=0;i<49;i++)tick(0.1);`);
    near('o.charge',0.98); equal('o.boostLock',true);
    run('tick(0.1);'); near('o.charge',1); equal('o.boostLock',false);
    setup(kind); run(`G.rules.boost=true; o.boosting=true; o.charge=1;
      if(who==='me'){G.keyBoost=true;G.speed=BASE_SPEED*BOOST_SPEED;update(0.01);}
      else{o.wantBoost=true;o.abs=BASE_SPEED*BOOST_SPEED;updateRival(o,0.01,'running');}`);
    near("who==='me'?G.speed:o.abs",630);
  });
  test(kind+' one second of ultimate charge is 1/85',()=>{
    setup(kind); run(`for(let i=0;i<20;i++){if(who==='me')update(0.05);else updateRival(o,0.05,'running');}`);
    near('o.ult',1/85);
  });
  test(kind+' Bubble reward works with items disabled and never alters an active ultimate',()=>{
    setup(kind); equal('MYSTERY_ITEMS_ENABLED',false);
    run('takeBubble(who,o.x,playerY);'); near('o.ult',0.05); equal('o.item',null);
    run('o.ult=0.98;takeBubble(who,o.x,playerY);'); near('o.ult',1);
    run('startUlt(who);tickUlt(who,3);takeBubble(who,o.x,playerY);'); near('o.ultT',12); near('o.ult',0.8);
  });
}
test('enabled item gate gives exactly one charge reward and a normal item',()=>{
  const enabled=fixture(true,(source,file)=>file==='data'?source.replace('const MYSTERY_ITEMS_ENABLED = false','const MYSTERY_ITEMS_ENABLED = true'):source);
  enabled.boot();
  for(const kind of ['player','bot','local']){
    const got=enabled.run(`G.rules=defaultRules();G.rules.bots=1;startRace();
      G.rivals[0].human=${kind==='local'};globalThis.who=${kind==='player'?'"me"':'G.rivals[0]'};
      globalThis.o=who==='me'?G:who;takeBubble(who,o.x,playerY);[o.ult,!!ITEMS[o.item]];`);
    assert.deepEqual(Array.from(got),[0.05,true]);
  }
});
function dodgeSetup(kind, hazard, seconds=0.10){
  setup(kind);
  run(`G.rules.ults=false;o.ult=0.2;
    globalThis.cy=who==='me'?playerY:o.y;
    globalThis.nose=Math.min(...carHit(who).points.map(p=>p.y));
    globalThis.hazard=${JSON.stringify(hazard)};
    globalThis.h={kind:hazard,x:o.x,y:nose-14-BASE_SPEED*${seconds},
      rx:14,ry:14,s:0.5,r:14,mr:4,vx:0,fall:1,age:0,rot:0,hit:0,nm:0,b:G.biome};
    if(hazard==='meteor'){h.y=cy-BASE_SPEED*${seconds};h.r=12;h.fall=${seconds};h.max=1;h.phase=0;h.t=0;}
    G.traps=[h];`);
}
for(const kind of ['player','local','bot']) for(const hazard of ['puddle','weed','meteor']){
  test(kind+'/'+hazard+' precise escape is frame-rate independent and rewarded once',()=>{
    for(const dt of [1/30,1/60,1/144,0.05]){
      dodgeSetup(kind,hazard,hazard==='meteor'?0.115:0.10);
      run(`o.lane=2;for(let i=0;i<Math.ceil(0.7/${dt});i++)update(${dt});`);
      near('o.ult',0.3); equal('o.dead',0);
      run('for(let i=0;i<20;i++)update(0.01);'); near('o.ult',0.3);
    }
  });
}
for(const kind of ['player','local','bot']) test(kind+' early, wide, passive and collided passes are not perfect dodges',()=>{
  for(const miss of ['early','wide','passive','hit']){
    dodgeSetup(kind,'puddle',miss==='early'?0.5:0.1);
    run(`${miss==='wide'||miss==='passive'?'h.x=laneCX(0);':''}
      ${miss==='early'||miss==='wide'?'o.lane=2;':''}
      for(let i=0;i<120;i++)update(1/60);`);
    near('o.ult',miss==='hit'?0.15:0.2);
  }
});
for(const kind of ['player','local','bot']) test(kind+' protections, airborne and off-road states cannot earn precision charge',()=>{
  for(const state of ['invuln','dead','finished','saffron','rhosyn']){
    dodgeSetup(kind,'puddle');
    run(`G.rules.ults=true;if(${JSON.stringify(state)}==='saffron'){o.car='saffron';o.ult=1;startUlt(who);}
      else if(${JSON.stringify(state)}==='rhosyn'){o.car='rhosyn';o.ult=1;startUlt(who);}
      else o[${JSON.stringify(state)}]=1;
      globalThis.before=o.ult;globalThis.fr=beginPerfectDodges();o.lane=2;o.x=laneCX(2);h.y=playerY+300;
      finishPerfectDodges(fr);`);
    near('o.ult',run('before'));
  }
});
test('perfect puddle escape during an ultimate cannot extend its duration',()=>{
  dodgeSetup('player','puddle');
  run('G.rules.ults=true;G.ult=1;startUlt("me");G.speed=BASE_SPEED*ULT_SPEED;h.y=Math.min(...carHit().points.map(p=>p.y))-14-G.speed*0.10;G.lane=2;for(let i=0;i<42;i++)update(1/60);');
  near('G.ultT',14.3); near('G.ult',14.3/15); equal('h.pdDone & 1',1);
});
console.log(`\n${checks} progression/reward checks passed (real simulation with DOM/Canvas doubles).`);
