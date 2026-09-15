#!/usr/bin/env node
/* Run the real game scripts with DOM/Canvas doubles. No gameplay functions
   are mocked: exercise the same update, input, collision and rendering paths. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
let checks = 0;
const f = fixture(), {run} = f;
f.boot();
function test(name, fn){fn();checks++;console.log('  ok  ' + name);}
function equal(code, expected){assert.equal(run(code), expected, code);}
function near(code, expected){assert.ok(Math.abs(run(code)-expected)<1e-8, code);}
const cars = Array.from(run('CAR_IDS'));
function setup(car, kind, active = true){
  run(`G.local = false; G.car = ${JSON.stringify(car)}; G.rules = defaultRules();
       G.rules.bots = 1; G.rules.boost = false; G.rules.bubbles = false;
       G.mode = 'endless'; startRace(); G.state = 'running';
       G.nextTrap = 1e9; G.nextGap = 1e9; G.nextRow = 1e9;
       G.rivals[0].car = G.car; G.rivals[0].human = ${kind === 'local'};
       G.rivals[0].lane = 0; G.rivals[0].x = laneCX(0); G.rivals[0].y = playerY - 2000;
       G.rivals[0].changeT = 1e6; G.rivals[0].brakeHeld = false;
       globalThis.who = ${kind === 'player' ? '"me"' : 'G.rivals[0]'};
       globalThis.o = who === 'me' ? G : who;
       o.ult = 1; ${active ? 'startUlt(who);' : ''}`);
}
function hit(kind, type){
  const rival = kind !== 'player';
  run(`globalThis.hx = ${rival ? 'o.x' : 'G.x'}; globalThis.hy = ${rival ? 'o.y' : 'playerY'};`);
  if(type === 'puddle') run(`G.traps = [{kind:'puddle',x:hx,y:hy,rx:80,ry:50,s:0.5,hit:0,nm:0}];`);
  if(type === 'weed') run(`G.traps = [{kind:'weed',x:hx,y:hy,r:25,vx:0,fall:1,age:0,rot:0,hit:0,nm:0}];`);
  if(type === 'puddle' || type === 'weed') run(rival ? `updateRival(o,0,'running');` : `updateTraps(0,0,'running');`);
  if(type === 'oil') run(`G.slicks = [{x:hx,y:hy,r:30,rx:60,ry:40,rot:0,jit:0.1,s:0.5,life:10,fade:0,owner:null}]; updateSlicks(0,0,'running');`);
  if(type === 'meteor') run(`G.traps = [{kind:'meteor',x:hx,y:hy,r:80,mr:18,fall:0,max:1,phase:0,t:0}]; updateTraps(0,0,'running');`);
  if(type === 'seeker') run(`G.missiles = [{x:hx,y:hy,vx:0,vy:-100,mark:who,owner:${rival ? '"me"' : 'G.rivals[0]'},life:10,fade:0}];updateMissiles(0,0);`);
}
for(const car of cars) for(const kind of ['player','bot','local']){
  const label = car + '/' + kind;
  test(label + ' activation, countdown, repeat press, expiry, no secondary effects',()=>{
    setup(car,kind,false);
    run(`globalThis.other = who === 'me' ? G.rivals[0] : G;
         globalThis.stateOf = obj => Object.fromEntries(Object.entries(obj).filter(([key]) => !['fx','shake'].includes(key)));
         globalThis.before = JSON.stringify(stateOf(other));
         if(who === 'me') fireUlt(); else fireUltRival(who);`);
    equal('o.ultOn',true);equal('o.ultT',15);equal('o.ultMax',15);equal('o.ult',1);
    // Player state contains the rival itself; snapshot the relevant independent state.
    if(kind === 'player') equal('JSON.stringify(stateOf(other)) === before',true);
    else { equal('G.slowT',0); equal('G.slipT',0); equal('G.blind',0); equal('G.lane',1); }
    run('tickUlt(who,7.5);');near('o.ult',0.5);
    run(`if(who === 'me') fireUlt(); else fireUltRival(who); startUlt(who); ultDelta(who,1);`);
    equal('o.ultT',7.5);equal('o.ultMax',15);
    run('tickUlt(who,7.49);');equal('o.ultOn',true);
    run('tickUlt(who,0.02);');equal('o.ultOn',false);equal('o.ultT',0);equal('o.ult',0);
    equal('o.dead',0);
  });
  test(label + ' speed multiplier coexists with Slow and launch',()=>{
    for(const slow of [false,true]) for(const air of [false,true]){
      setup(car,kind);
      run(`if(who==='me') G.slowT = ${slow ? 5 : 0}; else o.slow = ${slow ? 5 : 0};
           o.airT = ${air ? 3 : 0}; o.airMax = 3; o.airPow = 0.5;
           globalThis.expected = BASE_SPEED * 2 * (${air ? 'lerp(AIR_MIN_K,AIR_MAX_K,0.5)' : slow ? '0.5' : '1'});
           if(who==='me'){G.speed=expected;update(0.01);} else {o.abs=expected;updateRival(o,0.01,'running');}`);
      near(`(who === 'me' ? G.speed : o.abs) / expected`,1);
      if(slow) equal(`(who === 'me' ? G.slowT : o.slow) > 0`,true);
    }
  });
  test(label + ' no immunity, cleanse or collision priority',()=>{
    setup(car,kind,false);
    run(`if(who === 'me'){G.slowT=2;G.slipT=3;G.blind=1;}else{o.slow=2;o.slip=3;o.blind=1;} startUlt(who);`);
    equal(`who === 'me' ? G.slowT : o.slow`,2);
    equal(`who === 'me' ? G.slipT : o.slip`,3);equal('o.blind',1);
    equal('warded(who)',false);equal('noContact(who)',false);
    equal(`who === 'me' ? playerUntouchable() : safeCar(who)`,false);
    run(`o.lane=1; bumpTarget({me:who==='me',obj:who==='me'?null:o,lane:1},1,who==='me'?G.rivals[0]:'me');`);
    equal('o.lane',2);equal('o.dead',0);
    run(`bumpTarget({me:who==='me',obj:who==='me'?null:o,lane:2},1,who==='me'?G.rivals[0]:'me');`);
    equal('o.dead > 0',true);equal('o.ultOn',false);
  });
  for(const type of ['puddle','weed','oil','meteor','seeker']) test(label + ' vulnerable to ' + type,()=>{
    setup(car,kind);hit(kind,type);
    if(type === 'puddle') equal('o.blind > 0',true);
    else if(type === 'weed') equal(`(who==='me'?G.slowT:o.slow)>0`,true);
    else if(type === 'oil') equal(`(who==='me'?G.slipT:o.slip)>0`,true);
    else equal('o.dead > 0',true);
  });
  test(label + ' custom disable, charge clock, and genuine protection',()=>{
    setup(car,kind,false);run(`G.rules.ults=false;if(who==='me')fireUlt();else fireUltRival(who);startUlt(who);`);
    equal('o.ultOn',false);
    run(`o.ult=0;if(who==='me')update(0.1);else updateRival(o,0.1,'running');`);equal('o.ult',0);
    run(`G.rules.ults=true;if(who==='me')update(0.1);else updateRival(o,0.1,'running');`);near('o.ult',0.1/75);
    run(`o.immune=2;startUlt(who);`);equal('warded(who)',true);equal('noContact(who)',true);
    hit(kind,'meteor');equal('o.dead',0);
    run(`o.immune=0;o.airT=2;`);equal('noContact(who)',true);
    run(`o.airT=0;o.finished=1;`);equal('warded(who)',true);equal('noContact(who)',true);
  });
}
test('all car pairs use ordinary rear contact, without destruction or rematerialization',()=>{
  for(const car of cars) for(const rival of cars){
    setup(car,'player');run(`globalThis.r=G.rivals[0];r.car=${JSON.stringify(rival)};r.lane=G.lane;r.y=playerY-carH*0.5;startUlt(r);
      rearEnd('me',{me:false,obj:r,lane:r.lane,y:r.y});`);
    equal('G.slowT > 0',true);equal('r.launch > 0',true);equal('r.dead',0);equal('G.dead',0);
    run(`endUlt('me');endUlt(r);`);equal('r.dead',0);equal('G.dead',0);
  }
});
test('every bot spends the shared ultimate on every difficulty',()=>{
  for(const car of cars) for(const difficulty of ['easy','medium','hard','brutal']){
    setup(car,'bot',false);run(`G.diff=${JSON.stringify(difficulty)};o.ultWait=0;o.ultHeld=100;updateRival(o,0.01,'running');`);
    equal('o.ultOn',true);equal('o.ultT',15);
  }
});
test('HUD and render paths work for all cars and local columns',()=>{
  for(const car of cars){
    setup(car,'player');run(`syncEffects();render();hudEffects('me',G);hudEffects(G.rivals[0],G.rivals[0]);`);
    equal('JSON.stringify(G.effLog)',JSON.stringify(['boosted']));
    equal(`$('#immuneTag').classList.contains('on')`,false);
    run('G.immune=2;syncEffects();');equal(`$('#immuneTag').classList.contains('on')`,true);
  }
});
test('Timestamp boost leaves meteor, weed and opponent simulation unchanged',()=>{
  setup('timestamp','player');
  run(`globalThis.r=G.rivals[0];r.human=true;r.abs=BASE_SPEED;
       updateRival(r,0.1,'running');
       G.traps=[{kind:'meteor',x:roadX,y:-1000,r:20,mr:10,fall:1,max:1,phase:0,t:0},
                {kind:'weed',x:roadX+20,y:-500,r:20,vx:100,fall:0.5,age:0,rot:0}];
       globalThis.wx=G.traps[1].x;updateTraps(0.1,0,'running');`);
  near('r.abs',run('BASE_SPEED'));near('G.traps[0].fall',0.9);near('G.traps[1].x-wx',10);
});
test('four local seats activate through human input, render and expire independently',()=>{
  for(let offset=0;offset<cars.length;offset++){
    run(`G.local=true;G.players=4;G.rules=defaultRules();G.rules.bots=0;
         G.picks=CAR_IDS.slice(${offset}).concat(CAR_IDS.slice(0,${offset})).slice(0,4);
         G.car=G.picks[0];startRace();G.state='running';
         for(const seat of G.humans){const car=seat==='me'?G:seat;car.ult=1;humanUlt(seat);}
         render();`);
    equal('G.humans.length',4);
    equal("G.humans.every(seat => (seat==='me'?G:seat).ultT===15)",true);
    run(`for(const seat of G.humans){tickUlt(seat,5);humanUlt(seat);} render();`);
    equal("G.humans.every(seat => (seat==='me'?G:seat).ultT===10)",true);
    run(`for(const seat of G.humans) tickUlt(seat,10);render();`);
    equal("G.humans.every(seat => !(seat==='me'?G:seat).ultOn)",true);
  }
});
console.log(`\n${checks} ultimate regression checks passed (DOM/Canvas doubles; no physical controller or visual QA).`);
