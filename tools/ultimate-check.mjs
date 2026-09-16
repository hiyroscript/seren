#!/usr/bin/env node
/* Run the real game scripts with DOM/Canvas doubles. No gameplay functions
   are mocked: exercise the same update, input, collision and rendering paths. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
let checks = 0;
const f = fixture(), {run} = f;
f.images.forEach(image => image.load());
f.boot();
function test(name, fn){fn();checks++;console.log('  ok  ' + name);}
function equal(code, expected){assert.equal(run(code), expected, code);}
function near(code, expected){assert.ok(Math.abs(run(code)-expected)<1e-8, code);}
const cars = Array.from(run('CAR_IDS'));
function setup(car, kind, active = true){
  run(`G.local = false; G.car = ${JSON.stringify(car)}; G.rules = defaultRules();
       G.rules.bots = 1; G.rules.boost = false; G.rules.bubbles = false;
       G.mode = 'endless'; startRace(); G.state = 'running';
       G.nextTrap = 1e9; G.nextRow = 1e9;
       G.rivals[0].car = G.car; G.rivals[0].human = ${kind === 'local'};
       G.rivals[0].lane = 0; G.rivals[0].x = laneCX(0); G.rivals[0].y = playerY - 2000;
       G.rivals[0].changeT = 1e6;
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
  test(label + ' speed multiplier coexists with Slow and the rear-end shunt',()=>{
    for(const slow of [false,true]) for(const shunt of [false,true]){
      setup(car,kind);
      run(`if(who==='me'){G.slowT = ${slow ? 5 : 0}; G.shuntT = ${shunt ? 0.8 : 0};}
           else {o.slow = ${slow ? 5 : 0}; o.shuntT = ${shunt ? 0.8 : 0};}
           globalThis.expected = BASE_SPEED * 2 * (${slow ? '0.5' : '1'}) * (${shunt ? 'SHUNT_BOOST' : '1'});
           if(who==='me'){G.speed=expected;update(0.005);} else {o.abs=expected;updateRival(o,0.005,'running');}`);
      near(`(who === 'me' ? G.speed : o.abs) / expected`,1);
      if(slow) equal(`(who === 'me' ? G.slowT : o.slow) > 0`,true);
      if(shunt) equal(`(who === 'me' ? G.shuntT : o.shuntT) > 0`,true);
    }
  });
  test(label + ' no immunity, cleanse or collision priority',()=>{
    setup(car,kind,false);
    run(`if(who === 'me'){G.slowT=2;G.slipT=3;G.blind=1;}else{o.slow=2;o.slip=3;o.blind=1;} startUlt(who);`);
    equal(`who === 'me' ? G.slowT : o.slow`,2);
    equal(`who === 'me' ? G.slipT : o.slip`,3);equal('o.blind',1);
    equal('refusesDebuffs(who)',false);equal('noContact(who)',false);
    equal('invulnerableWho(who)',false);
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
    run(`o.invuln=2;startUlt(who);`);equal('refusesDebuffs(who)',true);equal('noContact(who)',true);
    equal('invulnerableWho(who)',true);
    equal(`activeConditions(who).indexOf('invulnerable')`,0);
    hit(kind,'meteor');equal('o.dead',0);
    /* Finished is protection, never the Invulnerable Condition - and a
       finisher shows no Conditions at all, because it is out of the race. */
    run(`o.invuln=0;o.finished=1;`);equal('refusesDebuffs(who)',true);equal('noContact(who)',true);
    equal('invulnerableWho(who)',false);
    equal('JSON.stringify(activeConditions(who))','[]');
    run(`o.finished=null;`);
  });
}
test('all car pairs use ordinary rear contact, without destruction or rematerialization',()=>{
  for(const car of cars) for(const rival of cars){
    setup(car,'player');run(`globalThis.r=G.rivals[0];r.car=${JSON.stringify(rival)};r.lane=G.lane;r.y=playerY-carH*0.5;startUlt(r);
      rearEnd('me',{me:false,obj:r,lane:r.lane,y:r.y});`);
    equal('G.slowT > 0',true);equal('r.shuntT > 0',true);equal('r.dead',0);equal('G.dead',0);
    /* The shove reads as Boosted, exactly as ordinary boost does. */
    equal(`activeConditions(r).indexOf('boosted') >= 0`,true);
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
    setup(car,'player');run(`syncConditions();render();hudConditions('me');hudConditions(G.rivals[0]);
                             drawConditionStack(G.rivals[0],G.rivals[0].x,G.rivals[0].y);`);
    equal(`JSON.stringify(activeConditions('me'))`,JSON.stringify(['boosted']));
    equal(`$('#condList').children.length`,1);
    equal(`$('#condList').children[0].getAttribute('aria-label')`,run('t("condBoosted")'));
    equal(`$('#shell').classList.contains('invulnerable')`,false);
    run('G.invuln=2;syncConditions();');
    equal(`$('#shell').classList.contains('invulnerable')`,true);
    /* Invulnerable outranks Boosted, every frame and in that order. */
    equal(`JSON.stringify(activeConditions('me'))`,JSON.stringify(['invulnerable','boosted']));
    equal(`$('#condList').children.length`,2);
    run('G.invuln=0;syncConditions();');
    equal(`$('#shell').classList.contains('invulnerable')`,false);
  }
});

/* Every state that owns a Condition, checked against the one helper that both
   the world badges and the HUD badges read. Nothing keeps a second copy, so a
   lapsed timer cannot leave a badge behind. */
test('every Condition is derived from the state that owns it',()=>{
  const cases = [['slowT','slowed'],['blind','obscured'],['slipT','skidded'],
                 ['canT','boosted'],['invuln','invulnerable']];
  for(const [field,id] of cases){
    setup('flann','player',false);
    run(`G.slowT=G.blind=G.slipT=G.canT=G.invuln=G.shuntT=0;G.boosting=false;G.${field}=2;`);
    equal(`activeConditions('me').indexOf(${JSON.stringify(id)}) >= 0`,true);
    equal(`conditionOn('me',${JSON.stringify(id)})`,true);
    run(`G.${field}=0;`);
    equal(`activeConditions('me').indexOf(${JSON.stringify(id)}) >= 0`,false);
  }
  /* Rivals answer the identical question off their own fields, bot or human. */
  for(const human of [false,true]){
    setup('flann','bot',false);
    run(`globalThis.r=G.rivals[0];r.human=${human};
         r.slow=r.blind=r.slip=r.canT=r.invuln=r.shuntT=0;r.boosting=false;
         r.invuln=2;r.slow=2;r.blind=2;r.slip=2;`);
    equal('JSON.stringify(activeConditions(r))',
          JSON.stringify(['invulnerable','slowed','obscured','skidded']));
  }
});

/* Crossing the line takes a racer off every target list and out of every
   collision, and it is never presented as a Condition. */
test('a finished racer is out of play and wears no badge',()=>{
  setup('flann','player',false);
  run(`globalThis.r=G.rivals[0];r.y=playerY;r.lane=G.lane;r.x=G.x;
       r.slow=2;r.blind=2;r.slip=2;r.invuln=0;r.finished=1;r.parkM=G.meters;`);
  equal('JSON.stringify(activeConditions(r))','[]');
  equal('noContact(r)',true);
  equal('safeCar(r)',true);
  equal('finishedCar(r)',true);
  equal('invulnerableCar(r)',false);
  equal('carAt(r.lane,r.y,"me")',null);            /* nothing collides with it */
  equal('seekerTarget("me")',null);                /* nothing targets it */
  equal(`fieldView('me').filter(a => !a.out).length`,0);
  /* And the other way round: a bot's picture of the race drops a finisher out
     of the actionable field rather than merely refusing the eventual hit. */
  run(`r.finished=null;G.finished=1;r.human=false;globalThis.s=botSense(r);`);
  equal(`s.all.filter(a => !a.out).length`,0);
  equal(`botTarget(r, s)`,null);
  equal('seekerTarget(r)',null);
  equal('s.front',null);equal('s.back',null);equal('s.threat',null);
  run(`G.finished=null;r.finished=1;`);
  /* A seeker already locked on when it crossed gives the mark up harmlessly. */
  run(`r.finished=null;fireSeeker('me');r.finished=1;globalThis.before=G.missiles.length;
       updateMissiles(0.016,0);`);
  equal('before',1);
  equal('G.missiles.length === 0 || G.missiles[0].fade > 0',true);
  equal('r.dead',0);
  /* Hazards, items and debuffs all pass it by. */
  run(`G.missiles=[];r.slow=0;r.blind=0;r.slip=0;
       G.traps=[{kind:'meteor',x:r.x,y:r.y,r:200,mr:18,fall:0,max:1,phase:0,t:0}];
       updateTraps(0,0,'running');
       G.slicks=[{x:r.x,y:r.y,r:60,rx:60,ry:40,rot:0,jit:0.1,s:0.5,life:10,fade:0,owner:'me'}];
       updateSlicks(0,0,'running');
       wreckRival(r,'me',true);`);
  equal('r.dead',0);equal('r.slip',0);equal('r.slow',0);equal('r.blind',0);
  equal('r.finished',1);
  run('r.finished=null;');
});

/* The icon layer: one table, one renderer, and a badge for every Condition. */
test('every Condition has one canonical colour, type and icon',()=>{
  const ids = Array.from(run('CONDITION_IDS'));
  assert.deepEqual(ids,['invulnerable','boosted','slowed','obscured','skidded']);
  const seen = new Set();
  for(const id of ids){
    const col = run(`CONDITIONS[${JSON.stringify(id)}].col`);
    const icon = run(`CONDITIONS[${JSON.stringify(id)}].icon`);
    const type = run(`CONDITIONS[${JSON.stringify(id)}].type`);
    assert.ok(/^#[0-9A-F]{6}$/i.test(col),id+' colour');
    assert.ok(!seen.has(col),id+' colour is its own');
    seen.add(col);
    assert.ok(['buff','debuff'].includes(type),id+' type');
    assert.ok(run(`!!COND_PATHS[${JSON.stringify(icon)}]`),id+' artwork');
    assert.ok(run(`!!STR[CONDITIONS[${JSON.stringify(id)}].key]`),id+' name string');
    assert.ok(run(`!!STR[${JSON.stringify(id+'Info')}]`),id+' description');
    /* Both renderers read the same artwork, so the page and the canvas agree. */
    const svg = run(`conditionSvg(${JSON.stringify(id)},22)`);
    assert.ok(svg.includes(col),id+' svg fill');
    assert.ok(svg.includes(run(`CONDITIONS[${JSON.stringify(id)}].ink`)),id+' svg ink');
    for(const d of run(`COND_PATHS[${JSON.stringify(icon)}]`)) assert.ok(svg.includes(d),id+' svg path');
    run(`drawConditionBadge(${JSON.stringify(id)},40,40,8)`);   /* must not throw */
  }
  assert.equal(run('typeof CONDITIONS.launched'),'undefined');
  assert.equal(run('typeof CONDITIONS.winner'),'undefined');
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
