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
  /* Rhosyn is the one exception to everything this test says, because its
     ultimate is the one that is not a collision priority: a racer that has
     left the shared road for Aero-Glow is unreachable, and unreachable is
     unreachable in both directions. It is still not the Invulnerable
     Condition, and it is still not a cleanse - the debuffs it was already
     wearing go on running down - which is what the split below is about. */
  const away = car === 'rhosyn' || car === 'saffron';
  test(label + (away ? ' takes the car off the road without protecting it'
                     : ' no immunity, no cleanse and it is still reachable'),()=>{
    setup(car,kind,false);
    run(`if(who === 'me'){G.slowT=2;G.slipT=3;G.blind=1;}else{o.slow=2;o.slip=3;o.blind=1;} startUlt(who);`);
    equal(`who === 'me' ? G.slowT : o.slow`,2);
    equal(`who === 'me' ? G.slipT : o.slip`,3);equal('o.blind',1);
    /* Nothing was cleansed and nobody was made Invulnerable, whichever car
       this is: the Condition has an owner and it is the respawn. */
    equal('invulnerableWho(who)',false);
    equal('refusesDebuffs(who)',car === 'rhosyn');equal('noContact(who)',away);
    equal(`who === 'me' ? playerUntouchable() : safeCar(who)`,away);
    /* Four of the five car-specific ultimates are collision priority or
       visibility, changing who loses a contact or who can see it rather than
       whether the contact can happen at all. Rhosyn's is the fifth, and it is
       the only one noContact() reads - not as a shield, but because the body
       is not on this road to be met. The predicates below are the only thing
       that differs. An invisible Verdant is the sharpest contrast: it is
       hidden from sight and reachable by everything. */
    equal('flannUltActive(who)',car === 'flann');
    equal('neelaUltActive(who)',car === 'neela');
    equal('neelaFormActive(who)',car === 'neela');
    equal('lolantheUltActive(who)',car === 'lolanthe');
    equal('verdantUltActive(who)',car === 'verdant');
    equal('rhosynUltActive(who)',car === 'rhosyn');
    equal('rhosynElsewhere(who)',car === 'rhosyn');
    /* Nothing reaches a car that is not there, so the solid-hazard privilege
       is neither given to Rhosyn nor needed by it. */
    equal('clearsSolidHazards(who)',
          ['flann','neela','lolanthe','verdant'].indexOf(car) >= 0);
    equal('neelaCanSwap(who)',car === 'neela');
    equal('racerDetectable(who)',car !== 'verdant' && car !== 'rhosyn');
    /* And none of them takes its own driver's controls away. */
    equal('controlsLocked(who)',false);
  });
  const priority = car === 'flann' ? 'the ram'
                 : car === 'neela' ? 'the exchange'
                 : car === 'verdant' ? 'the one-way defence'
                 : car === 'rhosyn' ? 'no contact in either direction'
                 : 'ordinary barging';
  test(label + ' collision priority: ' + priority,()=>{
    setup(car,kind);
    run(`globalThis.attacker = who === 'me' ? G.rivals[0] : 'me';
         globalThis.att = attacker === 'me' ? G : attacker;
         globalThis.victim = {me:who==='me',obj:who==='me'?null:o,lane:1};
         o.lane = 1;
         globalThis.outcome = bumpTarget(victim,1,attacker);`);
    if(car === 'neela'){
      /* Barging into an alternate-form Neela trades places with it. Nobody is
         wrecked, nobody takes the lane, and the ultimate carries on - minus the
         alternate body and minus the one swap it was holding. */
      equal('outcome','swapped');
      equal('o.dead',0);equal('att.dead',0);
      equal('o.ultOn',true);equal('o.ultT',15);
      equal('neelaFormActive(who)',false);
      equal('neelaUltActive(who)',true);          /* the hazard privilege stays */
      equal('o.neelaSwapped',true);
      equal(`who === 'me' ? G.slowT : o.slow`,0);
      /* A second barge in the same ultimate is the ordinary rule again. */
      run(`o.swapGuard = 0; att.swapGuard = 0;
           globalThis.again = bumpTarget({me:who==='me',obj:who==='me'?null:o,lane:1},1,attacker);`);
      equal(`again === 'moved' || again === 'wrecked'`,true);
      equal('o.neelaSwapped',true);
    } else if(car === 'flann'){
      equal('outcome','moved');
      equal('o.lane',2);equal('o.dead',0);equal('o.ultOn',true);
      equal(`(who === 'me' ? G.slowT : o.slow)>0`,true);
      equal('att.dead',0);
      /* And the same again from the other side: Flann barging out wrecks
         whoever was in the lane it wanted, and takes the lane. */
      setup(car,kind);
      run(`globalThis.target = who === 'me' ? G.rivals[0] : 'me';
           globalThis.tgt = target === 'me' ? G : target;
           tgt.dead = 0; tgt.invuln = 0;
           globalThis.outcome = bumpTarget({me:target==='me',obj:target==='me'?null:target,lane:1},1,who);`);
      equal('outcome','rammed');
      equal('tgt.dead > 0',true);equal('o.dead',0);equal('o.ultOn',true);
      equal(`who === 'me' ? G.slowT : o.slow`,0);
    } else if(car === 'verdant'){
      /* Barging into an invisible Verdant destroys the barger. Verdant does
         not move lane, is not slowed, keeps its ultimate, and shows itself for
         a split second - which is cosmetic and does not cut the ultimate
         short. */
      equal('outcome','stopped');
      equal('o.lane',1);equal('o.dead',0);equal('o.ultOn',true);equal('o.ultT',15);
      equal(`who === 'me' ? G.slowT : o.slow`,0);
      equal('att.dead > 0',true);
      equal('o.verdantRevealT > 0',true);
      equal('verdantUltActive(who)',true);
      /* And from the other side it wins nothing: Verdant barging out is an
         ordinary barge, so the car in the lane is shoved rather than killed. */
      setup(car,kind);
      run(`globalThis.target = who === 'me' ? G.rivals[0] : 'me';
           globalThis.tgt = target === 'me' ? G : target;
           tgt.dead = 0; tgt.invuln = 0; tgt.lane = 1; if(target !== 'me') tgt.x = laneCX(1);
           globalThis.outcome = bumpTarget({me:target==='me',obj:target==='me'?null:target,lane:1},1,who);`);
      equal('outcome','moved');
      equal('tgt.dead',0);
      equal('tgt.lane',2);
      equal('o.verdantRevealT',0,'an ordinary barge reveals nothing');
    } else if(away){
      /* There is nothing at that position to barge. The car asking for the
         lane is not stopped and not hurt - it simply meets nobody, and takes
         the lane it wanted. */
      equal('outcome','none');
      equal('o.lane',1);equal('o.dead',0);equal('att.dead',0);
      equal('o.ultOn',true);equal('o.ultT',15);
      equal(`who === 'me' ? G.slowT : o.slow`,0);
      /* And the isolation is symmetric: Rhosyn cannot barge anybody either,
         so Aero-Glow is not a place to attack the field from. */
      run(`globalThis.target = who === 'me' ? G.rivals[0] : 'me';
           globalThis.tgt = target === 'me' ? G : target;
           tgt.dead = 0; tgt.invuln = 0; tgt.lane = 1;
           if(target !== 'me') tgt.x = laneCX(1);
           globalThis.back = bumpTarget({me:target==='me',obj:target==='me'?null:target,lane:1},1,who);`);
      equal('back','none');
      equal('tgt.dead',0);equal('tgt.lane',1);
      equal(`target === 'me' ? G.slowT : tgt.slow`,0);
      /* The queries every offensive system is built on agree. */
      equal('carAt(1, racerY(who), who)',null);
      equal('rearContact(who)',null);
      /* But the driver is still driving: the canonical lane answers its own
         controls exactly as it would have done on the shared road. */
      run(`if(who === 'me'){ G.lane = 1; move(1); } else { o.lane = 1; rivalLaneTo(o, 2); }`);
      equal('o.lane',2);
    } else {
      equal('outcome','moved');
      equal('o.lane',2);equal('o.dead',0);
      run(`globalThis.outcome = bumpTarget({me:who==='me',obj:who==='me'?null:o,lane:2},1,attacker);`);
      equal('outcome','wrecked');
      equal('o.dead > 0',true);equal('o.ultOn',false);
    }
  });
  for(const type of ['puddle','weed','oil','meteor','seeker']){
    /* The two solid hazards are Flann's, Neela's, Lolanthe's and Verdant's to
       smash while their ultimates run; water, oil and a guided missile are
       not, for anybody. Rhosyn smashes none of them and is caught by none of
       them: it is not on the road the hazard is lying on, so the hazard is
       still there afterwards for whoever does drive over it. */
    const smashed = ['flann','neela','lolanthe','verdant'].indexOf(car) >= 0 &&
                    (type === 'weed' || type === 'meteor');
    test(label + (away ? ' is not on the road to meet the '
                       : smashed ? ' smashes ' : ' vulnerable to ') + type,()=>{
      setup(car,kind);hit(kind,type);
      if(away){
        /* Untouched, and still running its own fifteen seconds. */
        equal('o.dead',0);equal('o.ultOn',true);equal('o.ultT',15);
        equal(`who === 'me' ? G.slowT : o.slow`,0);
        equal(`who === 'me' ? G.slipT : o.slip`,0);
        equal('o.blind',0);
        /* And the hazard is not spent on a car that was never there. */
        if(type === 'weed' || type === 'puddle') equal('G.traps.length',1);
        if(type === 'oil') equal('G.slicks.length',1);
        if(type === 'seeker') equal('G.missiles.length',1);
        return;
      }
      if(type === 'puddle') equal('o.blind > 0',true);
      else if(type === 'weed'){
        if(smashed){
          equal(`(who==='me'?G.slowT:o.slow)`,0);       /* no Slow for the ram */
          equal(`G.traps.length`,0);                    /* and the weed is gone */
          equal('o.ultOn',true);
        } else equal(`(who==='me'?G.slowT:o.slow)>0`,true);
      }
      else if(type === 'oil') equal(`(who==='me'?G.slipT:o.slip)>0`,true);
      else if(type === 'meteor' && smashed){
        equal('o.dead',0);equal('o.ultOn',true);        /* the blast cannot reach it */
      }
      else equal('o.dead > 0',true);
    });
  }
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
/* Every pair of cars, both ulting, running into each other's backs. The pairs
   that behave differently are the ones with a Rhosyn on either side, and the
   ones with exactly one Flann, exactly one alternate-form Neela, or exactly
   one Verdant in them: two of any of those three cancel, so they fall back to
   the ordinary shunt like anybody else.

   The priority is written out here as the rules describe it rather than as the
   code implements it, so a refactor that quietly reorders them cannot pass. In
   order: an ulting Rhosyn on either side, then the two symmetric Verdant
   pairs, then Verdant's one-way defence, then the exchange, then the ram, then
   the shunt.

   Rhosyn is first because it is not a priority at all: the other five decide
   who loses a contact that happened, and this one says the contact never
   happened, because one of the two bodies is not on this road.

   A Flann and a Neela meeting with no Verdant involved is still the exchange
   rather than the kill: the swap is settled first because the contact spends
   Neela's form either way, and spending it on a wreck would leave a car
   destroyed and a swap still owed. */
function pairOutcome(me, them){
  /* `me` is always the racer that did the running into. */
  if(['rhosyn','saffron'].includes(me) || ['rhosyn','saffron'].includes(them)) return 'none';
  const meV = me === 'verdant', themV = them === 'verdant';
  if(meV !== themV){
    const other = meV ? them : me;                 /* the one that is not hidden */
    if(other === 'flann') return 'mutual';         /* both go, both meters emptied */
    if(other === 'neela') return meV ? 'themDead' : 'meDead';
    return meV ? 'shunt' : 'meDead';               /* the defence only works one way */
  }
  if((me === 'neela') !== (them === 'neela')) return 'swap';
  if(me === 'flann' && them !== 'flann') return 'themDead';
  return 'shunt';
}
test('rear contact between every pair of ulting cars, priority in the documented order',()=>{
  for(const car of cars) for(const rival of cars){
    const want = pairOutcome(car,rival);
    const label = car + ' into ' + rival;
    setup(car,'player');run(`globalThis.r=G.rivals[0];r.car=${JSON.stringify(rival)};r.lane=G.lane;r.y=playerY-carH*0.5;startUlt(r);
      globalThis.beforeM=[G.meters,metersOf(r)];
      rearEnd('me',{me:false,obj:r,lane:r.lane,y:r.y});`);
    if(want === 'swap'){
      /* Nobody is wrecked and nobody is shunted; the two of them have simply
         exchanged places, and both ultimates are still running. */
      equal('G.dead',0);equal('r.dead',0);
      equal('G.slowT',0);equal('r.shuntT',0);
      equal('G.ultOn',true);equal('r.ultOn',true);
      equal('G.ultT',15);equal('r.ultT',15);
      equal('neelaFormActive("me") || neelaFormActive(r)',false);
      /* and they really did move: the two metre readings have traded */
      equal('Math.abs(G.meters-beforeM[1]) < 1e-6',true);
      equal('Math.abs(metersOf(r)-beforeM[0]) < 1e-6',true);
    } else if(want === 'mutual'){
      /* An ulting Verdant and an ulting Flann destroy each other whichever of
         them arrived, and neither is left holding any fuel at all. */
      assert.equal(run('G.dead > 0'),true,label);
      assert.equal(run('r.dead > 0'),true,label);
      assert.equal(run('G.ult'),0,label+': the player kept fuel');
      assert.equal(run('r.ult'),0,label+': the rival kept fuel');
      assert.equal(run('G.ultOn'),false,label);
      assert.equal(run('r.ultOn'),false,label);
    } else if(want === 'themDead'){
      /* Driving into the back of somebody while on fire destroys them, and the
         ram takes none of the ordinary rear-end consequence for it - and the
         same shape of answer when a transformed Neela meets a hidden Verdant,
         except that it is Neela that goes and Neela's meter that is emptied. */
      assert.equal(run('r.dead > 0'),true,label);
      assert.equal(run('G.dead'),0,label);
      equal('G.slowT',0);equal('r.shuntT',0);equal('G.ultOn',true);
      if(car === 'verdant'){
        assert.equal(run('r.ult'),0,label+': the wrecked Neela kept fuel');
        assert.equal(run('G.verdantRevealT > 0'),true,label+': no reveal on contact');
        assert.equal(run('neelaFormActive(r)'),false,label);
        /* and no swap: the two of them are exactly where they were */
        assert.equal(run('Math.abs(G.meters-beforeM[0]) < 1e-6'),true,label);
      }
    } else if(want === 'meDead'){
      /* Rear-ending an ulting Flann, or an invisible Verdant, destroys the car
         that did it. */
      assert.equal(run('G.dead > 0'),true,label);
      assert.equal(run('r.dead'),0,label);
      equal('G.slowT',0);equal('r.shuntT',0);equal('r.ultOn',true);
      if(rival === 'verdant'){
        assert.equal(run('r.verdantRevealT > 0'),true,label+': no reveal on contact');
        if(car === 'neela') assert.equal(run('G.ult'),0,label+': Neela kept fuel');
      }
    } else if(want === 'none'){
      /* One of the two is away in Aero-Glow, so there was no contact to
         settle: nobody is wrecked, nobody is slowed, nobody is shunted and
         neither of them moved an inch. Both ultimates carry on. */
      assert.equal(run('G.dead'),0,label);
      assert.equal(run('r.dead'),0,label);
      assert.equal(run('G.slowT'),0,label);
      assert.equal(run('r.shuntT'),0,label);
      assert.equal(run('G.shuntT'),0,label);
      assert.equal(run('r.slow'),0,label);
      assert.equal(run('G.ultOn'),true,label);
      assert.equal(run('r.ultOn'),true,label);
      assert.equal(run('Math.abs(G.meters-beforeM[0]) < 1e-6'),true,label);
      assert.equal(run('Math.abs(metersOf(r)-beforeM[1]) < 1e-6'),true,label);
    } else {
      assert.equal(run('G.slowT > 0'),true,label);
      assert.equal(run('r.shuntT > 0'),true,label);
      assert.equal(run('r.dead'),0,label);
      assert.equal(run('G.dead'),0,label);
      /* The shove reads as Boosted, exactly as ordinary boost does. */
      equal(`activeConditions(r).indexOf('boosted') >= 0`,true);
      /* And an ulting Verdant that merely arrived won nothing by it. */
      if(car === 'verdant') assert.equal(run('G.verdantRevealT'),0,label);
    }
    run(`endUlt('me');endUlt(r);`);
    assert.equal(run('r.dead > 0'),want === 'themDead' || want === 'mutual',label);
    assert.equal(run('G.dead > 0'),want === 'meDead' || want === 'mutual',label);
  }
});
/* ================================================================
   FLANN'S ULTIMATE  -  the one car-specific power
   ================================================================
   The lifecycle above is shared and stays shared; everything here is what
   Flann adds on top of it while ultOn is true, and it has to be identical
   whether the car is being driven by the person holding the controller, by a
   bot, or by a second person in a local seat. */
function duel(kind, ulting = true){
  run(`G.local = false; G.car = ${kind === 'player' ? '"flann"' : '"saffron"'};
       G.rules = defaultRules(); G.rules.bots = 1; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); G.state = 'running';
       G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       globalThis.rvl = G.rivals[0];
       rvl.car = ${kind === 'player' ? '"saffron"' : '"flann"'}; rvl.human = ${kind === 'local'};
       rvl.dead = 0; rvl.invuln = 0; rvl.finished = null; rvl.slow = 0; rvl.blind = 0;
       rvl.slip = 0; rvl.shuntT = 0; rvl.bumpCD = 0; rvl.changeT = 1e6;
       rvl.lane = 1; rvl.x = laneCX(1); rvl.y = playerY - carH*0.4;
       globalThis.F = ${kind === 'player' ? '"me"' : 'G.rivals[0]'};
       globalThis.X = ${kind === 'player' ? 'G.rivals[0]' : '"me"'};
       globalThis.fo = F === 'me' ? G : F; globalThis.xo = X === 'me' ? G : X;
       globalThis.fy = () => F === 'me' ? playerY : F.y;
       globalThis.xy = () => X === 'me' ? playerY : X.y;
       globalThis.asVictim = w => ({me:w === 'me', obj:w === 'me' ? null : w,
                                    lane:(w === 'me' ? G : w).lane,
                                    y:w === 'me' ? playerY : w.y});
       fo.ult = 1; ${ulting ? 'startUlt(F);' : ''}`);
}
/* A tumbleweed sitting exactly on one racer. */
function weedOn(who){
  run(`G.traps = [{kind:'weed', x:${who}==='me'?G.x:${who}.x,
                   y:${who}==='me'?playerY:${who}.y,
                   r:25, vx:0, fall:1, age:0, rot:0, hit:0, nm:0}];`);
}
/* A rock already on the ground, detonating over one racer. */
function blastOn(who){
  run(`G.traps = [{kind:'meteor', x:${who}==='me'?G.x:${who}.x,
                   y:${who}==='me'?playerY:${who}.y,
                   r:80, mr:18, fall:0, max:1, phase:0, t:0}];`);
}
for(const kind of ['player','bot','local']){
  const tag = 'flann/' + kind + ' ultimate';

  test(tag + ' smashes the tumbleweed and takes no Slow or meter penalty',()=>{
    duel(kind);
    run(`globalThis.meterBefore = fo.ult;`);
    weedOn('F');
    run(kind === 'player' ? `updateTraps(0,0,'running');` : `updateRival(F,0,'running');`);
    equal('G.traps.length',0);                       /* destroyed, not merely missed */
    equal(`F==='me' ? G.slowT : F.slow`,0);
    equal('fo.ultOn',true);
    equal('fo.ultT',15);                             /* and not cut short */
    equal('G.fx.length > 0',true);                   /* debris, not a silent pass */
    /* Once it is over, the very same weed drags Flann down like anybody else. */
    duel(kind,false);
    weedOn('F');
    run(kind === 'player' ? `updateTraps(0,0,'running');` : `updateRival(F,0,'running');`);
    equal(`(F==='me' ? G.slowT : F.slow) > 0`,true);
    equal('G.traps.length',0);
    void 0;
  });

  test(tag + ' survives a meteor blast, and is wrecked by one once it ends',()=>{
    duel(kind);
    blastOn('F');run(`updateTraps(0,0,'running');`);
    equal('fo.dead',0);equal('fo.ultOn',true);equal('fo.ultT',15);
    /* The explosion itself still happened. */
    equal('G.traps[0].phase',1);
    duel(kind,false);
    blastOn('F');run(`updateTraps(0,0,'running');`);
    equal('fo.dead > 0',true);
  });

  test(tag + ' is still blinded by a puddle, because water cannot be smashed',()=>{
    duel(kind);
    run(`G.traps = [{kind:'puddle', x:F==='me'?G.x:F.x, y:F==='me'?playerY:F.y,
                     rx:80, ry:50, s:0.5, hit:0, nm:0}];`);
    run(kind === 'player' ? `updateTraps(0,0,'running');` : `updateRival(F,0,'running');`);
    equal('fo.blind > 0',true);
    equal('G.traps.length',1);                       /* the puddle is still there */
    equal('fo.ultOn',true);equal('fo.ultT',15);
    /* Boosted by the ultimate and Obscured by the water, both at once. */
    equal(`activeConditions(F).indexOf('boosted') >= 0`,true);
    equal(`activeConditions(F).indexOf('obscured') >= 0`,true);
  });

  test(tag + ' only wrecks racers it rear-ends',()=>{
    /* Flann into the back of somebody. */
    duel(kind);
    run(`rearEnd(F, asVictim(X));`);
    equal('xo.dead > 0',true);equal('fo.dead',0);equal('fo.ultOn',true);
    equal(`F==='me' ? G.slowT : F.slow`,0);          /* no rear-end Slow for the ram */
    equal(`X==='me' ? G.shuntT : X.shuntT`,0);       /* and nobody was shoved along */
    duel(kind);
    run(`rearEnd(X, asVictim(F));`);
    equal('xo.dead',0);equal('fo.dead',0);equal('fo.ultOn',true);
    equal(`(F==='me' ? G.shuntT : F.shuntT)>0`,true);
    equal(`(X==='me' ? G.slowT : X.slow)>0`,true);
    /* Expired, both directions go straight back to the ordinary shunt. */
    duel(kind,false);
    run(`rearEnd(F, asVictim(X));`);
    equal('xo.dead',0);equal('fo.dead',0);
    equal(`F==='me' ? G.slowT : F.slow`,run('BUMP_SLOW*0.7'));
    equal(`(X==='me' ? G.shuntT : X.shuntT) > 0`,true);
  });

  test(tag + ' offensive barge wrecks, incoming barge uses ordinary shove',()=>{
    duel(kind); run('globalThis.outcome=bumpTarget(asVictim(X),1,F);');
    equal('outcome','rammed');equal('xo.dead>0',true);equal('fo.dead',0);
    duel(kind);run('globalThis.outcome=bumpTarget(asVictim(F),1,X);');
    equal('outcome','moved');equal('fo.lane',2);equal('xo.dead',0);equal('fo.dead',0);
    duel(kind);
    run(`xo.lane=0;xo.x=laneCX(0);fo.lane=1;fo.x=laneCX(1);
         ${kind === 'player' ? 'rivalLaneTo(X,1)' : 'move(1)'};`);
    equal('xo.dead',0);equal('xo.lane',1);equal('fo.lane',2);
  });

  test(tag + ' never reaches a respawning or a finished racer',()=>{
    for(const [field,value] of [['invuln',2],['dead',2],['finished',1]]){
      duel(kind);
      run(`xo.${field} = ${value};`);
      run(`globalThis.outcome = bumpTarget(asVictim(X), 1, F); rearEnd(F, asVictim(X));`);
      equal('outcome','none');
      if(field === 'finished') equal('xo.finished',1);
      if(field === 'invuln'){ equal('xo.dead',0); equal('xo.invuln',2); }
      equal('fo.dead',0);equal('fo.ultOn',true);
    }
    /* The protection reads the same way round: a protected Flann is reached by
       nobody either, so its ultimate cannot be used to farm a respawn. */
    for(const [field,value] of [['invuln',2],['finished',1]]){
      duel(kind);
      run(`fo.${field} = ${value};
           globalThis.outcome = bumpTarget(asVictim(F), 1, X); rearEnd(X, asVictim(F));`);
      equal('outcome','none');equal('xo.dead',0);
      run(`fo.${field} = ${field === 'finished' ? 'null' : 0};`);
    }
  });
}

/* The falling rock is tested against the player's own car and always has been,
   so this half of the meteor rule is a player-side one. */
test('flann/player ultimate smashes a falling rock instead of being crushed',()=>{
  for(const car of ['flann','saffron']){
    duel('player');
    run(`G.car = ${JSON.stringify(car)};
         globalThis.mo = {kind:'meteor', x:G.x, y:0, r:80, mr:18,
                          fall:0.02, max:1, phase:0, t:0};
         globalThis.alt = rockAlt(mo); mo.y = playerY + alt;
         G.traps = [mo]; updateTraps(0,0,'running');`);
    /* The rock really is on the roof rather than merely nearby. */
    equal('alt < racerDims("me").h*0.55',true);
    if(car === 'flann'){
      equal('G.traps.length',0);                     /* gone through, not detonated */
      equal('G.dead',0);equal('G.ultOn',true);equal('G.ultT',15);
      equal('G.fx.length > 0',true);
    } else {
      equal('G.traps[0].phase',1);                   /* it reached the ground */
      equal('G.dead > 0',true);
    }
  }
});

/* The whole thing once more through update()/updateRival(), so the ram is
   proved on the path the game actually runs rather than on direct calls. */
test('the ram works through the ordinary per-frame contact sweep',()=>{
  duel('player');
  run(`rvl.y = playerY - carH*0.2; rvl.x = G.x; rvl.lane = G.lane; update(1/60);`);
  equal('rvl.dead > 0',true);equal('G.dead',0);equal('G.slowT',0);equal('G.ultOn',true);
  /* And from the rival's own sweep: a bot or local-seat Flann running up the
     back of the player wrecks the player from inside updateRival(). */
  for(const kind of ['bot','local']){
    duel(kind);
    run(`rvl.y = playerY + carH*0.2; rvl.x = G.x; rvl.lane = G.lane;
         updateRival(rvl,1/60,'running');`);
    equal('G.dead > 0',true);equal('rvl.dead',0);equal('rvl.ultOn',true);
    equal('rvl.slow',0);equal('G.shuntT',0);
  }
});

/* The one car with no power of its own keeps the ultimate it always had.
   Rhosyn used to be beside it here; it is not an ordinary ultimate any more,
   and has a section of its own further down. */
for(const car of ['saffron'])
  test(car + ' gains no collision or hazard power from its ordinary car',()=>{
    run(`G.local=false;G.car=${JSON.stringify(car)};G.rules=defaultRules();
         G.rules.bots=1;G.rules.bubbles=false;G.mode='endless';startRace();
         G.state='running';G.nextTrap=1e9;G.nextRow=1e9;G.traps=[];
         G.dead=0;G.invuln=0;G.slowT=0;G.blind=0;G.lane=1;
         globalThis.rvl=G.rivals[0];rvl.car=${JSON.stringify(car)};rvl.dead=0;rvl.invuln=0;
         rvl.slow=0;rvl.blind=0;rvl.shuntT=0;rvl.bumpCD=0;rvl.changeT=1e6;rvl.lane=1;
         rvl.x=G.x;rvl.y=playerY-carH*0.4;
         G.ult=1;rvl.ult=1;`);
    equal('flannUltActive("me")',false);equal('flannUltActive(rvl)',false);
    /* tumbleweed still slows it */
    weedOn('"me"');run(`updateTraps(0,0,'running');`);
    equal('G.slowT > 0',true);equal('G.traps.length',0);
    /* meteor still wrecks it - and the rival beside it, which is the ordinary
       blast rule and is why both are put back on the road below */
    blastOn('"me"');run(`updateTraps(0,0,'running');`);
    equal('G.dead > 0',true);equal('rvl.dead > 0',true);
    /* puddle still blinds it */
    run(`G.dead=0;G.invuln=0;G.slowT=0;G.ult=1;
         rvl.dead=0;rvl.invuln=0;rvl.slow=0;rvl.ult=1;
         G.traps=[{kind:'puddle',x:G.x,y:playerY,rx:80,ry:50,s:0.5,hit:0,nm:0}];
         updateTraps(0,0,'running');`);
    equal('G.blind > 0',true);
    /* and racer contact is the ordinary shunt in both directions */
    run(`G.traps=[];G.slowT=0;G.bumpCD=0;rvl.shuntT=0;
         rearEnd('me',{me:false,obj:rvl,lane:rvl.lane,y:rvl.y});`);
    equal('G.slowT > 0',true);equal('rvl.shuntT > 0',true);
    equal('rvl.dead',0);equal('G.dead',0);
    run(`rvl.lane=1;globalThis.outcome=bumpTarget({me:false,obj:rvl,lane:1},1,'me');`);
    equal('outcome','moved');equal('rvl.lane',2);equal('rvl.dead',0);
  });

test('every bot spends the shared ultimate on every difficulty',()=>{
  for(const car of cars) for(const difficulty of ['easy','medium','hard','brutal']){
    setup(car,'bot',false);run(`G.diff=${JSON.stringify(difficulty)};o.ultWait=0;o.ultHeld=100;updateRival(o,0.01,'running');`);
    equal('o.ultOn',true);equal('o.ultT',15);
  }
});
test('HUD and render paths work for all cars and local columns',()=>{
  for(const car of cars){
    setup(car,'player');
    /* Two ultimates white their own view out for a moment on the way in -
       Neela's transformation and Rhosyn's departure for Aero-Glow - and that
       is the ordinary Obscured Condition rather than a badge of its own, so it
       shows up here, derived from the whiteout timer and not from `blind`.
       Run it off, and the rest of this is the shared path every car takes. */
    if(car === 'neela' || car === 'rhosyn' || car === 'saffron'){
      equal(`activeConditions('me').indexOf('obscured') >= 0`,true);
      equal('G.blind',0);
      equal(`JSON.stringify(activeConditions('me'))`,JSON.stringify(['boosted','obscured']));
      run('G.whiteT=0;');
    } else equal('G.whiteT',0);
    run(`syncConditions();render();hudConditions('me');hudConditions(G.rivals[0]);
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
  /* Obscured appears twice on purpose: it has two sources now - puddle water
     on the glass and a Neela transition - and both have to derive it on their
     own, without the other being set. */
  const cases = [['slowT','slowed'],['blind','obscured'],['whiteT','obscured'],
                 ['slipT','skidded'],['canT','boosted'],['invuln','invulnerable']];
  for(const [field,id] of cases){
    setup('flann','player',false);
    run(`G.slowT=G.blind=G.whiteT=G.slipT=G.canT=G.invuln=G.shuntT=0;G.boosting=false;G.${field}=2;`);
    equal(`activeConditions('me').indexOf(${JSON.stringify(id)}) >= 0`,true);
    equal(`conditionOn('me',${JSON.stringify(id)})`,true);
    run(`G.${field}=0;`);
    equal(`activeConditions('me').indexOf(${JSON.stringify(id)}) >= 0`,false);
  }
  /* Rivals answer the identical question off their own fields, bot or human. */
  for(const human of [false,true]){
    setup('flann','bot',false);
    run(`globalThis.r=G.rivals[0];r.human=${human};
         r.slow=r.blind=r.whiteT=r.slip=r.canT=r.invuln=r.shuntT=0;r.boosting=false;
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
  assert.deepEqual(ids,['invulnerable','boosted','slowed','obscured','skidded',
                        'mindControlled']);
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
/* The generic normal-ultimate example. Saffron is the only car left with
   nothing on top of the shared fifteen seconds, so it is what a test asking
   "does an ordinary ultimate disturb anything?" has to use - the other five
   all have a power that would be the answer instead. */
test('an ordinary ultimate leaves meteor, weed and opponent simulation unchanged',()=>{
  setup('saffron','player');
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
/* ================================================================
   MYSTERY BUBBLES  -  rewards temporarily switched off
   ================================================================
   The rows, the roll, the artwork, the strings and every branch of useItem()
   are all still here; what is off is the handing over. These checks are what
   says the gate is closed, and they are what will say it has been reopened
   correctly when MYSTERY_ITEMS_ENABLED goes back to true. */
test('the Mystery reward gate is closed and is a switch, not a deletion',()=>{
  equal('MYSTERY_ITEMS_ENABLED',false);
  /* Nothing was removed to close it. */
  for(const name of ['rollItem','takeBubble','useItem','fireSeeker','spawnBubbleRow'])
    equal(`typeof ${name}`,'function');
  equal(`JSON.stringify(ITEM_IDS)`,JSON.stringify(['can','oil','seeker']));
  for(const id of ['can','oil','seeker']){
    equal(`!!ITEMS[${JSON.stringify(id)}]`,true);
    equal(`!!RARITY[ITEMS[${JSON.stringify(id)}].rarity]`,true);
    equal(`mysteryItem(${JSON.stringify(id)})`,true);
  }
  equal(`mysteryItem(null)`,false);
  /* And the roll itself still works, so reopening the gate needs no repair. */
  equal(`ITEM_IDS.indexOf(rollItem(false)) >= 0`,true);
  /* The custom-race switch is a separate question and is untouched. */
  equal(`defaultRules().bubbles`,true);
});
test('collecting a bubble grants nothing to a player, a bot or a local seat',()=>{
  run(`G.local=false;G.car='flann';G.rules=defaultRules();G.rules.bots=2;
       G.mode='endless';startRace();G.state='running';
       G.nextTrap=1e9;G.nextRow=1e9;G.traps=[];G.slicks=[];G.missiles=[];
       G.dead=0;G.invuln=0;G.finished=null;G.item=null;G.swapT=0;G.canT=0;
       G.lane=1;G.x=laneCX(1);
       globalThis.bot=G.rivals[0];globalThis.seat=G.rivals[1];
       seat.human=true;
       [bot,seat].forEach((c,i)=>{c.dead=0;c.invuln=0;c.finished=null;c.item=null;
         c.useT=0;c.itemHold=0;c.swapT=0;c.canT=0;c.changeT=1e6;
         c.lane=i===0?0:2;c.x=laneCX(c.lane);c.y=playerY;});
       G.rivals.slice(2).forEach(c=>{c.y=playerY-4000;});
       globalThis.swept=0;
       globalThis.row=()=>{G.boxes=[{y:playerY,gone:0,s:0,life:BUBBLE_LIFE,
                                     blink:0,ph:0,doomed:false}];
                           updateBubbles(0,0,'running');
                           swept=G.boxes[0] ? G.boxes[0].gone : 7;
                           updateBubbles(0,0,'running');};`);
  /* One row, three racers, one bubble each - and nobody comes away holding
     anything. The bubbles are still consumed, so the row is spent. */
  run('row();');
  equal('swept',7);                          /* all three lanes swept */
  equal('G.boxes.length',0);                 /* and the spent row taken away */
  equal('G.item',null);equal('bot.item',null);equal('seat.item',null);
  equal('G.swapT',0);equal('bot.swapT',0);equal('seat.swapT',0);
  equal('bot.useT',0);                       /* no bot fuse was armed */
  equal('G.canT',0);equal('bot.canT',0);equal('seat.canT',0);
  equal('G.slicks.length',0);equal('G.missiles.length',0);
  /* Repeating it changes nothing: there is no run of bubbles that eventually
     pays out, and no second bubble that trades for a first. */
  for(let i=0;i<8;i++) run('row();');
  equal('G.item',null);equal('bot.item',null);equal('seat.item',null);
  equal('G.canT',0);equal('G.slicks.length',0);equal('G.missiles.length',0);
  equal('bot.useT',0);
  /* The pickup still happened, so a bubble is not sitting on the road being
     driven through forever. */
  equal('G.boxes.length',0);
});
test('useItem refuses a stale Can, Oil or Seeker while rewards are off',()=>{
  for(const id of ['can','oil','seeker']){
    run(`G.local=false;G.car='flann';G.rules=defaultRules();G.rules.bots=1;
         G.mode='endless';startRace();G.state='running';
         G.nextTrap=1e9;G.nextRow=1e9;G.traps=[];G.slicks=[];G.missiles=[];
         G.dead=0;G.invuln=0;G.finished=null;G.canT=0;
         globalThis.bot=G.rivals[0];bot.dead=0;bot.invuln=0;bot.finished=null;
         bot.canT=0;bot.y=playerY-300;
         G.item=${JSON.stringify(id)};bot.item=${JSON.stringify(id)};
         globalThis.usedMe=useItem('me');globalThis.usedBot=useItem(bot);`);
    equal('usedMe',false);equal('usedBot',false);
    /* Dropped rather than kept, so it cannot go off later. */
    equal('G.item',null);equal('bot.item',null);
    equal('G.canT',0);equal('bot.canT',0);          /* no boost can */
    equal('G.slicks.length',0);                     /* no oil */
    equal('G.missiles.length',0);                   /* no seeker */
  }
});


/* ================================================================
   NEELA'S ULTIMATE  -  the second car-specific power
   ================================================================
   The shared lifecycle above is shared and stays shared. Everything here is
   what Neela adds inside its fifteen seconds, and it has to be identical
   whether the car is being driven by the person holding the controller, by a
   bot, or by a second person in a local seat.

   Two states, deliberately not one: the ultimate running - which carries the
   solid-hazard privilege for the whole fifteen seconds - and the alternate
   body being on the road, which carries the single exchange and ends at the
   first racer contact. Most of what follows is about keeping them apart. */

/* One Neela and one other racer on the same piece of road. Each side is 'me'
   (player one), 'seat' (a rival with a person in it) or 'bot', which is every
   ownership direction the exchange can run in. The rest of the grid is parked
   far up the road as unrelated traffic, which is what the world-position
   checks are measured against. */
function duo(nSide, vSide, ulting = true){
  assert.notEqual(nSide, vSide);
  const nExpr = nSide === 'me' ? '"me"' : 'G.rivals[0]';
  const vExpr = vSide === 'me' ? '"me"'
              : (nSide === 'me' ? 'G.rivals[0]' : 'G.rivals[1]');
  run(`G.local = false; G.car = ${nSide === 'me' ? '"neela"' : '"saffron"'};
       G.rules = defaultRules(); G.rules.bots = 5; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); clearTimers();
       G.state = 'running'; G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       G.tilt = 0; G.whiteT = 0; G.morphT = 0; G.swapGuard = 0;
       G.rivals.forEach((r, i) => {
         r.car = "saffron"; r.human = false; r.dead = 0; r.invuln = 0;
         r.finished = null; r.slow = 0; r.blind = 0; r.slip = 0; r.shuntT = 0;
         r.bumpCD = 0; r.changeT = 1e6; r.tilt = 0; r.whiteT = 0; r.morphT = 0;
         r.swapGuard = 0; r.ult = 0; r.lane = 1; r.x = laneCX(1);
         r.y = playerY - 3000 - i*900; r.abs = BASE_SPEED;
       });
       globalThis.N = ${nExpr}; globalThis.V = ${vExpr};
       globalThis.no = N === 'me' ? G : N; globalThis.vo = V === 'me' ? G : V;
       no.car = "neela";
       ${nSide === 'seat' ? 'no.human = true;' : ''}
       ${vSide === 'seat' ? 'vo.human = true;' : ''}
       globalThis.pose = w => racerWorldPose(w);
       globalThis.asVictim = w => ({ me:w === 'me', obj:w === 'me' ? null : w,
                                     lane:(w === 'me' ? G : w).lane,
                                     y:w === 'me' ? playerY : w.y });
       globalThis.others = () => G.rivals.filter(r => r !== N && r !== V);
       globalThis.elsewhere = () => others().map(metersOf);
       no.ult = 1; ${ulting ? 'startUlt(N);' : ''}`);
}
/* Put the two of them body to body, without going near the helper the mechanic
   itself uses to move racers. */
function collide(){
  run(`if(N === 'me'){ V.lane = G.lane; V.x = G.x; V.y = playerY; }
       else if(V === 'me'){ N.lane = G.lane; N.x = G.x; N.y = playerY; }
       else { V.lane = N.lane; V.x = N.x; V.y = N.y; }`);
}
/* Let the road actually run, so an activation pose is genuinely in the past by
   the time it is used. */
function drive(frames = 40){ run(`for(let i=0;i<${frames};i++) update(1/60);`); }
const SIDES = [['me','bot'],['me','seat'],['bot','me'],['bot','seat'],
               ['seat','me'],['seat','bot']];

test('activation transforms, captures its origin once, and takes nothing else',()=>{
  for(const [n, v] of SIDES){
    duo(n, v, false);
    const before = run('JSON.stringify(elsewhere())');
    run(`globalThis.was = pose(N); if(N === 'me') fireUlt(); else fireUltRival(N);`);
    /* the shared lifecycle, unchanged */
    equal('no.ultOn',true);equal('no.ultT',15);equal('no.ultMax',15);equal('no.ult',1);
    /* and Neela's own state on top of it */
    equal('neelaFormActive(N)',true);
    equal('no.neelaSwapped',false);
    equal('racerModel(N).sprite','vtm_neela.PNG');
    equal('Math.abs(no.neelaOrigin.m - was.m) < 1e-9',true);
    equal('no.neelaOrigin.lane',run('was.lane'));
    /* Nothing was moved by pressing the button. */
    equal('Math.abs(pose(N).m - was.m) < 1e-9',true);
    assert.equal(run('JSON.stringify(elsewhere())'),before,'nobody else moved');
    /* Pressing it again, and starting it again, never re-takes the origin. */
    drive(30);
    run(`globalThis.moved = pose(N);
         if(N === 'me') fireUlt(); else fireUltRival(N);
         startUlt(N);`);
    equal('Math.abs(no.neelaOrigin.m - was.m) < 1e-9',true);
    equal('Math.abs(moved.m - was.m) > 1',true);   /* it really has driven on */
    equal('no.ultT < 15',true);                    /* and the meter was not reset */
  }
});
test('the whiteout covers a view without pausing the race or the controls',()=>{
  duo('me','bot');
  equal('whiteoutActive("me")',true);
  equal('G.whiteT',run('WHITEOUT_TIME'));
  /* Obscured, from the whiteout timer and not from puddle water. */
  equal('G.blind',0);
  equal(`activeConditions("me").indexOf("obscured") >= 0`,true);
  equal(`conditionOn("me","obscured")`,true);
  /* The controls answer throughout, and the car is still steering itself. */
  run('move(1);');equal('G.lane',2);
  run('move(-1);move(-1);');equal('G.lane',0);
  /* The countdown runs through it, the road keeps moving, and everybody else
     keeps racing. */
  const t0 = run('G.ultT'), m0 = run('G.meters');
  const field0 = run('JSON.stringify(elsewhere())');
  drive(6);
  assert.ok(run('G.ultT') < t0,'the meter is still counting down');
  assert.ok(run('G.meters') > m0,'the road is still moving');
  assert.notEqual(run('JSON.stringify(elsewhere())'),field0,'so is everybody else');
  equal('G.state','running');
  /* And it is genuinely temporary. */
  run(`for(let i=0;i<60;i++) update(1/60);`);
  equal('whiteoutActive("me")',false);
  equal(`activeConditions("me").indexOf("obscured") >= 0`,false);
  equal('neelaFormActive("me")',true);            /* the form outlasts the flash */
});
test('an alternate-form Neela is reachable and is not Invulnerable',()=>{
  for(const [n, v] of SIDES){
    duo(n, v);
    equal('refusesDebuffs(N)',false);
    equal('noContact(N)',false);
    equal('invulnerableWho(N)',false);
    equal(`N === 'me' ? playerUntouchable() : safeCar(N)`,false);
    equal('flannUltActive(N)',false);             /* and it is not Flann's power */
  }
});


/* Whichever sweep actually applies a hazard to this racer: the player's own
   comes through updateTraps(), a rival's through updateRival(). */
function N_UPDATE(side){
  return side === 'me' ? `updateTraps(0,0,'running');` : `updateRival(N,0,'running');`;
}

/* ---- hazards -----------------------------------------------------
   The solid ones come apart for the whole of the ultimate, including after the
   exchange has taken the alternate body away. Water does not, and neither oil
   nor a seeker is a solid thing to be smashed. */
test('the solid-hazard privilege runs for the whole ultimate, form or no form',()=>{
  for(const kind of ['player','bot','local']){
    const [n, v] = kind === 'player' ? ['me','bot'] : ['bot','me'];
    /* tumbleweed, in the alternate form */
    duo(n, v);
    if(kind === 'local') run('no.human = true;');
    run(`G.traps = [{kind:'weed', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:25, vx:0, fall:1, age:0, rot:0, hit:0, nm:0}];
         globalThis.meter = no.ultT;`);
    run(N_UPDATE(n));
    equal('G.traps.length',0);
    equal(`N === 'me' ? G.slowT : N.slow`,0);
    equal('no.ultOn',true);equal('no.ultT',run('meter'));
    equal('G.fx.length > 0',true);
    /* and again after the exchange, with the car back in its own body */
    duo(n, v);
    collide();
    run(`rearEnd(N, asVictim(V));`);
    equal('neelaFormActive(N)',false);
    equal('neelaUltActive(N)',true);
    run(`G.traps = [{kind:'weed', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:25, vx:0, fall:1, age:0, rot:0, hit:0, nm:0}];`);
    run(N_UPDATE(n));
    equal('G.traps.length',0);
    equal(`N === 'me' ? G.slowT : N.slow`,0);
    /* and not once the meter has run out */
    run('endUlt(N);');
    equal('clearsSolidHazards(N)',false);
    run(`G.traps = [{kind:'weed', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:25, vx:0, fall:1, age:0, rot:0, hit:0, nm:0}];`);
    run(N_UPDATE(n));
    equal(`(N === 'me' ? G.slowT : N.slow) > 0`,true);
  }
});
test('a meteor blast cannot wreck an ulting Neela, and can once it is over',()=>{
  for(const n of ['me','bot']){
    duo(n, n === 'me' ? 'bot' : 'me');
    run(`G.traps = [{kind:'meteor', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:80, mr:18, fall:0, max:1, phase:0, t:0}];
         updateTraps(0,0,'running');`);
    equal('no.dead',0);equal('no.ultOn',true);equal('no.ultT',15);
    equal('G.traps[0].phase',1);                  /* the blast still happened */
    /* after the exchange the privilege is still Neela's */
    duo(n, n === 'me' ? 'bot' : 'me');
    collide();run(`rearEnd(N, asVictim(V));`);
    run(`G.traps = [{kind:'meteor', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:80, mr:18, fall:0, max:1, phase:0, t:0}];
         updateTraps(0,0,'running');`);
    equal('no.dead',0);equal('no.ultOn',true);
    /* and gone the moment the meter is */
    run('endUlt(N);');
    run(`G.traps = [{kind:'meteor', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     r:80, mr:18, fall:0, max:1, phase:0, t:0}];
         updateTraps(0,0,'running');`);
    equal('no.dead > 0',true);
  }
});
test('the falling rock is gone through rather than survived under',()=>{
  duo('me','bot');
  run(`globalThis.mo = {kind:'meteor', x:G.x, y:0, r:80, mr:18,
                        fall:0.02, max:1, phase:0, t:0};
       globalThis.alt = rockAlt(mo); mo.y = playerY + alt;
       G.traps = [mo]; updateTraps(0,0,'running');`);
  equal('alt < racerDims("me").h*0.55',true);
  equal('G.traps.length',0);                      /* taken off the road, not detonated */
  equal('G.dead',0);equal('G.ultOn',true);equal('G.ultT',15);
  equal('G.fx.length > 0',true);
});
test('a puddle still fouls the screen, because water cannot be smashed',()=>{
  for(const n of ['me','bot']){
    duo(n, n === 'me' ? 'bot' : 'me');
    run('no.whiteT = 0;');                        /* so Obscured can only be the water */
    run(`G.traps = [{kind:'puddle', x:N === 'me' ? G.x : N.x,
                     y:N === 'me' ? playerY : N.y,
                     rx:80, ry:50, s:0.5, hit:0, nm:0}];`);
    run(N_UPDATE(n));
    equal('no.blind > 0',true);
    equal('G.traps.length',1);                    /* the puddle is still there */
    equal('no.ultOn',true);equal('no.ultT',15);
    equal('neelaFormActive(N)',true);             /* and it did not end the form */
    equal(`activeConditions(N).indexOf('boosted') >= 0`,true);
    equal(`activeConditions(N).indexOf('obscured') >= 0`,true);
  }
});
test('oil and a seeker are not converted into broad immunity',()=>{
  /* Oil: an ulting Neela loses grip exactly as anybody else does. */
  duo('me','bot');
  run(`G.slicks = [{x:G.x,y:playerY,r:30,rx:60,ry:40,rot:0,jit:0.1,s:0.5,
                    life:10,fade:0,owner:null}]; updateSlicks(0,0,'running');`);
  equal('G.slipT > 0',true);
  equal('neelaFormActive("me")',true);            /* it is a debuff, not a contact */
  /* Seeker: it destroys an ulting Neela like anything else it reaches. */
  duo('me','bot');
  run(`G.missiles = [{x:G.x,y:playerY,vx:0,vy:-100,mark:'me',owner:G.rivals[1],
                      life:10,fade:0}]; updateMissiles(0,0);`);
  equal('G.dead > 0',true);
  equal('neelaFormActive("me")',false);           /* wrecked: no stale form left */
  equal('G.neelaOrigin',null);
});

/* ---- the exchange ------------------------------------------------
   The core of it, in every ownership direction. Neela goes to where the racer
   it touched was standing at the instant of contact; that racer goes to where
   Neela was standing when the button was pressed - not to where Neela was a
   frame ago, and not merely to Neela's old lane. */
for(const [n, v] of SIDES){
  const tag = 'neela/' + n + ' into ' + v;
  test(tag + ' exchanges places and wrecks nobody',()=>{
    duo(n, v);
    drive(45);                                   /* the activation pose is now history */
    collide();
    run(`globalThis.origin = pose(N);
         globalThis.saved = { m:no.neelaOrigin.m, lane:no.neelaOrigin.lane,
                              x:no.neelaOrigin.x };
         globalThis.victimPose = pose(V);
         globalThis.field = elsewhere();
         globalThis.meter = no.ultT;
         rearEnd(N, asVictim(V));`);
    /* The saved origin is the activation pose, and the road has moved on from
       it - so a teleport that used the current position would land elsewhere. */
    equal('Math.abs(origin.m - saved.m) > 5',true);
    /* Neither racer is destroyed. */
    equal('no.dead',0);equal('vo.dead',0);
    equal('no.finished',null);equal('vo.finished',null);
    /* Neela is where the other racer was at the instant of contact. */
    equal('Math.abs(pose(N).m - victimPose.m) < 1e-6',true);
    equal('pose(N).lane',run('victimPose.lane'));
    /* And that racer is where Neela fired from. */
    equal('Math.abs(pose(V).m - saved.m) < 1e-6',true);
    equal('pose(V).lane',run('saved.lane'));
    /* The ultimate is neither reset nor cut short. */
    equal('no.ultOn',true);
    equal('no.ultT',run('meter'));
    equal('no.ultMax',15);
    /* Back to the car, immediately, and the exchange is spent. */
    equal('neelaFormActive(N)',false);
    equal('racerModel(N).sprite','v_neela.PNG');
    equal('no.neelaSwapped',true);
    /* Both of them get the white transition and the flash on the body. */
    equal('whiteoutActive(N)',true);
    equal('whiteoutActive(V)',true);
    equal('no.morphT > 0',true);
    equal('vo.morphT > 0',true);
    equal(`activeConditions(N).indexOf('obscured') >= 0`,true);
    equal(`activeConditions(V).indexOf('obscured') >= 0`,true);
    /* Nobody else on the road moved an inch down it. */
    equal(`elsewhere().every((m,i) => Math.abs(m - field[i]) < 1e-6)`,true);
  });
  test(tag + ' spends the exchange once and then races ordinarily',()=>{
    duo(n, v);
    drive(45);                                   /* so the origin is well behind */
    collide();
    run(`globalThis.originM = no.neelaOrigin.m;
         rearEnd(N, asVictim(V));`);
    equal('no.neelaSwapped',true);
    /* Drive on, so the pair meet again somewhere that is not the origin - the
       guard expires on the way, which is the point of it being a guard. */
    drive(120);
    equal('no.swapGuard',0);equal('vo.swapGuard',0);
    /* A second contact in the same ultimate is the ordinary rear-end: somebody
       is slowed, somebody is shunted, and nobody is sent back to the origin. */
    collide();
    run(`no.bumpCD = 0; vo.bumpCD = 0;
         globalThis.stay = pose(N);
         globalThis.far = Math.abs(stay.m - originM);
         globalThis.meter = no.ultT;
         rearEnd(N, asVictim(V));`);
    equal('far > 30',true);                      /* there is somewhere to be sent */
    equal('Math.abs(pose(V).m - originM) > far*0.5',true);
    equal('Math.abs(pose(N).m - stay.m) < far*0.25',true);
    equal(`(N === 'me' ? G.slowT : N.slow) > 0`,true);
    equal(`(V === 'me' ? G.shuntT : V.shuntT) > 0`,true);
    equal('no.dead',0);equal('vo.dead',0);
    /* And it is still the same ultimate, still fast, still clearing hazards. */
    equal('no.ultOn',true);equal('no.ultT',run('meter'));
    equal('clearsSolidHazards(N)',true);
    /* Neela never gains the power to destroy a racer. */
    equal('offensiveRam(N, V)',false);
    /* Right up to the meter running out, at which point all of it goes. */
    run('tickUlt(N, ULT_TIME);');
    equal('no.ultOn',false);
    equal('clearsSolidHazards(N)',false);
    equal('neelaFormActive(N)',false);
    equal('no.neelaOrigin',null);
    equal('no.neelaSwapped',false);
  });
}
test('the exchange also runs through the ordinary per-frame contact sweep',()=>{
  /* Through the real frame rather than a direct call, so the mechanic is
     proved on the path the game actually runs. The rest of the frame carries
     on around it - which is the point - so the landings are checked to within
     the fraction of a metre one more step of driving is worth. */
  const STEP = 2;
  /* Player one driving into the back of a bot, through update(). */
  duo('me','bot');
  drive(45);
  run(`V.y = playerY - carH*0.2; V.x = G.x; V.lane = G.lane;
       globalThis.saved = { m:G.neelaOrigin.m, lane:G.neelaOrigin.lane };
       globalThis.victimPose = pose(V);
       update(1/60);`);
  equal('G.dead',0);equal('V.dead',0);
  equal('neelaFormActive("me")',false);
  equal('G.neelaSwapped',true);
  equal(`Math.abs(metersOf(V) - saved.m) < ${STEP}`,true);
  equal(`Math.abs(G.meters - victimPose.m) < ${STEP}`,true);
  equal('G.ultOn',true);
  /* And a Neela in a rival seat running up the back of player one, through
     updateRival() - bot and local human alike. */
  for(const side of ['bot','seat']){
    duo(side,'me');
    drive(45);
    run(`N.y = playerY + carH*0.2; N.x = G.x; N.lane = G.lane;
         globalThis.saved = { m:N.neelaOrigin.m, lane:N.neelaOrigin.lane };
         globalThis.mine = pose('me');
         updateRival(N, 1/60, 'running');`);
    equal('G.dead',0);equal('N.dead',0);
    equal('neelaFormActive(N)',false);
    equal('N.neelaSwapped',true);
    /* Player one was the one exchanged, so it is now where Neela fired from,
       and Neela is where player one was. */
    equal(`Math.abs(G.meters - saved.m) < ${STEP}`,true);
    equal('G.lane',run('saved.lane'));
    equal(`Math.abs(metersOf(N) - mine.m) < ${STEP}`,true);
  }
});
test('the exchange fires once per contact, not twice in a step',()=>{
  duo('me','bot');
  collide();
  run(`globalThis.saved = { m:G.neelaOrigin.m };
       globalThis.victimPose = pose(V);
       rearEnd('me', asVictim(V));
       globalThis.landed = pose('me');
       /* the freshly put-down bodies, read again in the same step */
       rearEnd('me', asVictim(V));
       globalThis.outcome = bumpTarget(asVictim(V), 1, 'me');`);
  equal('Math.abs(pose("me").m - landed.m) < 1e-6',true);
  equal('outcome','none');                        /* the guard refused the repeat */
  equal('G.dead',0);equal('V.dead',0);
  equal('G.swapGuard > 0',true);
  /* And the guard is a step, not a shield: it is gone within a few frames. */
  run('for(let i=0;i<6;i++) update(1/60);');
  equal('G.swapGuard',0);
  equal('V.swapGuard',0);
});
test('a finished, wrecked or respawning racer can never be exchanged with',()=>{
  for(const [field, value] of [['finished',1],['dead',2],['invuln',2]]){
    for(const [n, v] of [['me','bot'],['bot','me']]){
      duo(n, v);
      collide();
      run(`vo.${field} = ${value};
           globalThis.mine = pose(N); globalThis.theirs = pose(V);
           globalThis.outcome = bumpTarget(asVictim(V), 1, N);
           rearEnd(N, asVictim(V));`);
      equal('outcome','none');
      equal('Math.abs(pose(N).m - mine.m) < 1e-6',true);
      equal('Math.abs(pose(V).m - theirs.m) < 1e-6',true);
      equal('no.neelaSwapped',false);
      equal('neelaFormActive(N)',true);           /* the exchange is still owed */
      equal('no.ultOn',true);
      if(field === 'invuln'){ equal('vo.dead',0); equal('vo.invuln',2); }
      /* The protection reads the same way round: a protected Neela is reached
         by nobody either. */
      duo(n, v);
      collide();
      run(`no.${field} = ${value};
           globalThis.mine = pose(N); globalThis.theirs = pose(V);
           globalThis.outcome = bumpTarget(asVictim(N), 1, V);
           rearEnd(V, asVictim(N));`);
      equal('outcome','none');
      equal('Math.abs(pose(V).m - theirs.m) < 1e-6',true);
      equal('vo.dead',0);
    }
  }
});

/* ---- letting it run out, and being taken off the road ------------ */
test('an ultimate that touches nobody simply changes back where it stands',()=>{
  for(const [n, v] of [['me','bot'],['bot','me'],['seat','bot']]){
    duo(n, v);
    drive(60);
    run(`globalThis.standing = pose(N); globalThis.theirs = pose(V);
         globalThis.field = elsewhere();
         tickUlt(N, ULT_TIME);`);
    equal('no.ultOn',false);
    equal('neelaFormActive(N)',false);
    equal('racerModel(N).sprite','v_neela.PNG');
    /* Nobody is teleported: Neela stays exactly where it was, and so does
       everyone else. */
    equal('Math.abs(pose(N).m - standing.m) < 1e-6',true);
    equal('Math.abs(pose(V).m - theirs.m) < 1e-6',true);
    equal(`elsewhere().every((m,i) => Math.abs(m - field[i]) < 1e-6)`,true);
    /* The local flash plays, and no state is left behind. */
    equal('no.morphT > 0',true);
    equal('no.neelaOrigin',null);
    equal('no.neelaSwapped',false);
    equal('no.swapGuard',0);
    equal('clearsSolidHazards(N)',false);
  }
});
test('wrecking and finishing both clear the alternate form outright',()=>{
  /* Wrecked: no form, no origin, no flash left running. */
  for(const n of ['me','bot']){
    duo(n, n === 'me' ? 'bot' : 'me');
    run(`if(N === 'me') destroyCar(); else wreckRival(N, 'me');`);
    equal('no.dead > 0',true);
    equal('no.ultOn',false);
    equal('neelaFormActive(N)',false);
    equal('no.neelaForm',false);
    equal('no.neelaOrigin',null);
    equal('no.neelaSwapped',false);
    equal('no.whiteT',0);equal('no.morphT',0);
    equal('clearsSolidHazards(N)',false);
    equal('neelaCanSwap(N)',false);
  }
  /* Finished: out of play, out of the form, and wearing no Condition at all. */
  for(const n of ['me','bot']){
    duo(n, n === 'me' ? 'bot' : 'me');
    run(`G.finishAt = (N === 'me' ? G.meters : metersOf(N)) - 1;
         G.results = []; checkFinish();`);
    equal('no.finished !== null',true);
    equal('no.ultOn',false);
    equal('neelaFormActive(N)',false);
    equal('no.neelaOrigin',null);
    equal('no.whiteT',0);
    equal('JSON.stringify(activeConditions(N))','[]');
  }
  /* And a fresh race starts with none of it. */
  run(`G.car = "neela"; G.rules = defaultRules(); startRace(); clearTimers();`);
  equal('G.neelaForm',false);equal('G.neelaOrigin',null);
  equal('G.neelaSwapped',false);equal('G.whiteT',0);equal('G.morphT',0);
  equal('G.swapGuard',0);equal('G.trail.length',0);
  equal(`G.rivals.every(r => !r.neelaForm && r.neelaOrigin === null &&
                             !r.neelaSwapped && r.whiteT === 0 &&
                             r.trail.length === 0)`,true);
});

/* ---- the trail ---------------------------------------------------- */
test('the trail is laid while the form is up, bounded, and fades rather than vanishing',()=>{
  duo('me','bot');
  equal('G.trail.length',0);
  run('for(let i=0;i<30;i++) update(1/60);');
  const laid = run('G.trail.length');
  assert.ok(laid > 3,'the alternate form lays a trail behind it');
  /* Nodes are world positions on the road, so they scroll with it. */
  run('globalThis.oldest = G.trail[0].y; update(1/60);');
  assert.ok(run('G.trail[0].y') > run('oldest'),'the trail travels with the road');
  /* It is bounded however long the ultimate runs. */
  run('for(let i=0;i<900;i++) update(1/60);');
  assert.ok(run('G.trail.length') <= run('NEELA_TRAIL_MAX'),'and it is capped');
  /* Ending the form stops new nodes without deleting the ones already down. */
  duo('me','bot');
  run('for(let i=0;i<40;i++) update(1/60);');
  const before = run('G.trail.length');
  assert.ok(before > 3);
  run('leaveNeelaForm("me"); globalThis.kept = G.trail.length;');
  equal('kept',before);                           /* nothing purged on the spot */
  run('update(1/60);');
  assert.ok(run('G.trail.length') <= before,'and nothing new is added');
  run('globalThis.lives = G.trail.map(n => n.life); update(1/60);');
  equal('G.trail.every((n,i) => n.life < lives[i])',true);   /* they are fading */
  /* And they finish fading on their own rather than being cut off. */
  run(`for(let i=0;i<Math.ceil(NEELA_TRAIL_LIFE*70);i++) update(1/60);`);
  equal('G.trail.length',0);
});
test('a wreck and an exchange both leave the trail behind to fade',()=>{
  /* After the exchange the car is in its own body again, so nothing new is
     laid - but what is behind it is still on the road. */
  duo('me','bot');
  run('for(let i=0;i<40;i++) update(1/60);');
  collide();
  run('rearEnd("me", asVictim(V));');
  assert.ok(run('G.trail.length') > 3,'the old trail is still there');
  const after = run('G.trail.length');
  run('update(1/60);');
  assert.ok(run('G.trail.length') <= after);
  /* A wreck is the same: the car goes, the trail fades where it was dropped. */
  duo('me','bot');
  run('for(let i=0;i<40;i++) update(1/60); destroyCar();');
  assert.ok(run('G.trail.length') > 3,'a wreck does not purge the road');
  run('for(let i=0;i<10;i++) update(1/60);');
  assert.ok(run('G.trail.length') > 0);
  run(`for(let i=0;i<Math.ceil(NEELA_TRAIL_LIFE*70);i++) update(1/60);`);
  equal('G.trail.length',0);
});

/* ---- moving player one --------------------------------------------
   The hard case. Player one has no race `y`: it is held at playerY while the
   world runs past, so putting it somewhere else means moving the world instead
   - and the whole point of doing that centrally is that nothing which was not
   asked to move ends up somewhere different. This is the check that says so. */
test('teleporting player one leaves every other absolute position exactly alone',()=>{
  duo('bot','me');
  drive(50);
  /* A road with something of everything on it, placed at known distances. */
  run(`G.traps = [
         {kind:'weed',   x:roadX+30, y:playerY-500, r:25, vx:0, fall:0, age:0, rot:0, hit:0, nm:0},
         {kind:'puddle', x:roadX+60, y:playerY+240, rx:70, ry:40, s:0.4, hit:0, nm:0},
         {kind:'meteor', x:roadX+90, y:playerY-900, r:80, mr:18, fall:2, max:2, phase:0, t:0, s:0.2, nm:0}];
       G.boxes = [{y:playerY-700, gone:0, s:0.3, life:BUBBLE_LIFE, blink:0, ph:0, doomed:false}];
       G.slicks = [{x:roadX+40, y:playerY+120, r:40, rx:60, ry:40, rot:0, jit:0.1,
                    s:0.5, life:10, fade:0, owner:null}];
       G.missiles = [{x:roadX+50, y:playerY-1400, vx:0, vy:-100, mark:'me',
                      owner:G.rivals[2], life:10, fade:0}];
       /* One spark with a colour of its own, so it can still be found among
          the ones the exchange itself throws. */
       addFx(roadX+20, playerY-60, 0, 0, 5, 3, "#123456");
       /* A world position is a distance down the road, whatever the object. */
       globalThis.roadM = y => G.meters + (playerY - y)*0.075;
       globalThis.snapshot = () => ({
         racers: G.rivals.map(metersOf),
         lanes:  G.rivals.map(r => r.lane),
         traps:  G.traps.map(o => roadM(o.y)),
         boxes:  G.boxes.map(o => roadM(o.y)),
         slicks: G.slicks.map(o => roadM(o.y)),
         missiles: G.missiles.map(o => roadM(o.y)),
         fx:     G.fx.filter(o => o.c === "#123456").map(o => roadM(o.y)),
         trail:  G.rivals[0].trail.map(o => roadM(o.y)),
         seam:   G.seam === null ? null : roadM(G.seam),
         build:  G.build.map(a => a.map(b => roadM(b.y))),
         props:  G.props.map(o => roadM(o.y)),
         walks:  G.walks.map(o => roadM(o.y)),
         finishAt: G.finishAt,
         parks:  G.rivals.map(r => r.parkM)
       });
       globalThis.before = JSON.stringify(snapshot());
       globalThis.order = () => [{me:true,who:'me',m:G.meters}].concat(
         G.rivals.map(r => ({me:false,who:r,m:metersOf(r)})))
         .sort((a,b) => b.m - a.m);`);
  /* Neela is a bot here, so it is player one that gets moved. */
  collide();
  run(`globalThis.saved = { m:N.neelaOrigin.m, lane:N.neelaOrigin.lane };
       globalThis.mine = pose('me');
       globalThis.moved = Math.abs(saved.m - mine.m);
       rearEnd(N, asVictim('me'));`);
  /* It really was a move, and a long one. */
  equal('moved > 50',true);
  equal('Math.abs(G.meters - saved.m) < 1e-6',true);
  equal('G.lane',run('saved.lane'));
  equal('Math.abs(metersOf(N) - mine.m) < 1e-6',true);
  /* And after it, every unrelated thing in the world is at exactly the same
     distance down the road as it was before: racers, hazards, bubbles, slicks,
     the seeker in flight, sparks, scenery, the track seam and Neela's own
     trail nodes. */
  const after = JSON.parse(run('JSON.stringify(snapshot())'));
  const start = JSON.parse(run('before'));
  const walk = (a, b, path) => {
    if(Array.isArray(a)){
      assert.equal(a.length, b.length, path+' length');
      a.forEach((v,i) => walk(v, b[i], path+'['+i+']'));
    } else if(typeof a === 'number'){
      assert.ok(Math.abs(a-b) < 1e-6, path+': '+a+' != '+b);
    } else assert.deepEqual(a, b, path);
  };
  for(const key of Object.keys(start)){
    /* The two racers that were exchanged are the two that are meant to have
       moved; everything else has not. */
    if(key === 'racers'){
      for(let i=1;i<start[key].length;i++)
        assert.ok(Math.abs(after[key][i]-start[key][i]) < 1e-6,
                  'rival '+i+' kept its absolute position');
      continue;
    }
    if(key === 'lanes'){ continue; }
    walk(start[key], after[key], key);
  }
  /* Standings are still coherent: the whole field is still on the ladder, it
     is still in descending order down the road, and the place the HUD prints
     for a racer is the place that ladder gives it - all of it read off the
     same metersOf() every other reader uses. */
  equal('order().length',run('FIELD_SIZE'));
  equal('order().every((a,i,all) => i === 0 || all[i-1].m >= a.m - 1e-9)',true);
  equal('placeOf("me")',run('order().findIndex(a => a.me) + 1'));
  for(let i=0;i<5;i++)
    equal(`placeOf(G.rivals[${i}])`,run(`order().findIndex(a => a.who === G.rivals[${i}]) + 1`));
  /* Nobody was wrecked to do any of it. */
  equal('G.dead',0);equal('N.dead',0);
});

/* ---- local play ---------------------------------------------------
   Four people, four columns, one world. The white belongs to the view it was
   started on and to no other. */
test('a whiteout covers only the views it belongs to, in two, three and four seats',()=>{
  for(const seats of [2,3,4]){
    run(`G.local = true; G.players = ${seats}; G.rules = defaultRules();
         G.rules.bots = ${6 - seats};
         G.picks = ["neela"].concat(CAR_IDS.filter(c => c !== "neela")).slice(0,${seats});
         G.car = G.picks[0]; startRace(); clearTimers(); G.state = 'running';
         G.nextTrap = 1e9; G.nextRow = 1e9; G.traps = []; G.invuln = 0;
         G.rivals.forEach(r => { r.dead = 0; r.invuln = 0; r.changeT = 1e6; });
         G.ult = 1; startUlt("me"); render();`);
    equal('G.humans.length',seats);
    equal('whiteoutActive("me")',true);
    for(let i=1;i<seats;i++)
      equal(`whiteoutActive(G.humans[${i}])`,false);
    /* Exchanging with a seated human whites that seat out and nobody else. */
    run(`globalThis.other = G.humans[1];
         other.lane = G.lane; other.x = G.x; other.y = playerY;
         other.dead = 0; other.invuln = 0; other.finished = null;
         G.whiteT = 0; other.whiteT = 0;
         rearEnd("me", {me:false, obj:other, lane:other.lane, y:other.y});
         render();`);
    equal('whiteoutActive("me")',true);
    equal('whiteoutActive(other)',true);
    for(let i=2;i<seats;i++)
      equal(`whiteoutActive(G.humans[${i}])`,false,'seat '+(i+1)+' is untouched');
    equal('G.dead',0);equal('other.dead',0);
    /* A bot has no screen of its own, but it still wears the Condition, which
       is what another player sees beside its car. */
    run(`G.humans.forEach(h => { const o = h === 'me' ? G : h; o.whiteT = 0; });
         globalThis.bot = G.rivals.find(r => !r.human);
         G.car = "neela"; G.neelaForm = false; G.neelaSwapped = false;
         G.ult = 1; G.ultOn = false; startUlt("me");
         bot.lane = G.lane; bot.x = G.x; bot.y = playerY;
         bot.dead = 0; bot.invuln = 0; bot.finished = null;
         rearEnd("me", {me:false, obj:bot, lane:bot.lane, y:bot.y});`);
    equal('whiteoutActive(bot)',true);
    equal(`activeConditions(bot).indexOf('obscured') >= 0`,true);
    equal('bot.blind',0);
    for(let i=1;i<seats;i++)
      equal(`whiteoutActive(G.humans[${i}])`,false,'no seat is dragged in with it');
    run('G.local = false; VIEWS = 1;');
  }
});

/* ================================================================
   LOLANTHE'S AND VERDANT'S ULTIMATES
   ================================================================
   The lifecycle above is shared and stays shared; everything here is what
   these two add on top of it while ultOn is true, and all of it has to be
   identical whether the car is being driven by the person holding the
   controller, by a bot, or by a second person in a local seat.

   Two named racers on an otherwise empty road, on either side of the three
   ownership boundaries that matter. Everybody else is parked three kilometres
   up the road in a car with no power of its own, so nothing below can be an
   accident of who happened to be nearby. */
function pair(aSide, bSide, aCar, bCar){
  assert.notEqual(aSide, bSide);
  const aExpr = aSide === 'me' ? '"me"' : 'G.rivals[0]';
  const bExpr = bSide === 'me' ? '"me"' : (aSide === 'me' ? 'G.rivals[0]' : 'G.rivals[1]');
  run(`G.local = false; G.car = "saffron";
       G.rules = defaultRules(); G.rules.bots = 5; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); clearTimers();
       G.state = 'running'; G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       G.tilt = 0; G.mindT = 0; G.mindPop = 0; G.mindOut = 0;
       G.rivals.forEach((r, i) => {
         r.car = "saffron"; r.human = false; r.dead = 0; r.invuln = 0;
         r.finished = null; r.slow = 0; r.blind = 0; r.slip = 0; r.shuntT = 0;
         r.bumpCD = 0; r.changeT = 1e6; r.tilt = 0; r.ult = 0;
         r.mindT = 0; r.mindPop = 0; r.mindOut = 0;
         r.lane = 1; r.x = laneCX(1);
         r.y = playerY - 3000 - i*900; r.abs = BASE_SPEED;
       });
       globalThis.A = ${aExpr}; globalThis.B = ${bExpr};
       globalThis.ao = A === 'me' ? G : A; globalThis.bo = B === 'me' ? G : B;
       ao.car = ${JSON.stringify(aCar)}; bo.car = ${JSON.stringify(bCar)};
       ${aSide === 'seat' ? 'ao.human = true;' : ''}
       ${bSide === 'seat' ? 'bo.human = true;' : ''}
       globalThis.yOf = w => w === 'me' ? playerY : w.y;
       globalThis.laneOf = w => (w === 'me' ? G : w).lane;
       /* Put w in other's lane, dy screen pixels below it. Player one is held
          at playerY and cannot be placed, so when it is the one being put the
          other racer is moved to match instead - which is the same relative
          position and the only way to get it. */
       globalThis.putBeside = (w, other, dy) => {
         const o = w === 'me' ? G : w, t = other === 'me' ? G : other;
         if(w === 'me'){ G.lane = t.lane; G.x = t.x; other.y = playerY - dy; }
         else if(other === 'me'){ o.lane = G.lane; o.x = G.x; o.y = playerY + dy; }
         else { o.lane = t.lane; o.x = t.x; o.y = t.y + dy; }
       };
       globalThis.others = () => G.rivals.filter(r => r !== A && r !== B);`);
}
const PAIRS = [['me','bot'],['me','seat'],['bot','me'],['bot','seat'],
               ['seat','me'],['seat','bot']];

/* ---- the aura ---------------------------------------------------- */
test('an ulting Lolanthe controls every valid racer in range and nobody else',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'lolanthe', 'saffron');
    /* Out of range, in a different lane, and untouched. */
    run(`putBeside(B, A, -mindRange()*2); if(B !== 'me') B.lane = 0, B.x = laneCX(0);
         ao.ult = 1; startUlt(A); update(1/60);`);
    equal('lolantheUltActive(A)',true);
    equal('bo.mindT',0);
    /* Inside the reach, in another lane: controlled, and left in its lane. */
    run(`putBeside(B, A, -mindRange()*0.5);
         if(B === 'me'){ G.lane = 0; G.x = laneCX(0); } else { B.lane = 0; B.x = laneCX(0); }
         update(1/60);`);
    near('bo.mindT',run('MIND_CONTROL_TIME'));
    equal('laneOf(B)',0,'lane decides the shove, never the hold');
    equal(`conditionOn(B,'mindControlled')`,true);
    equal('controlsLocked(B)',true);
    /* Lolanthe never takes itself. */
    equal('ao.mindT',0);
    equal('controlsLocked(A)',false);
    /* Nobody three kilometres up the road is touched. */
    equal('others().every(r => r.mindT === 0)',true);
    /* The ultimate ending lets it lapse rather than cutting it off. */
    run(`endUlt(A); update(1/60);`);
    equal('bo.mindT > 0',true,'the last three seconds run on after the aura');
    run(`for(let i=0;i<200;i++) update(1/60);`);
    equal('bo.mindT',0);
    equal(`conditionOn(B,'mindControlled')`,false);
    equal('controlsLocked(B)',false);
  }
});
test('the aura refuses a wrecked, finished, protected or invisible racer',()=>{
  for(const shield of ['dead','finished','invuln','verdant']){
    pair('me','bot','lolanthe','saffron');
    run(`putBeside(B, A, -mindRange()*0.4); ao.ult = 1; startUlt(A);`);
    if(shield === 'verdant') run(`bo.car = "verdant"; bo.ult = 1; startUlt(B);`);
    else run(`bo.${shield} = ${shield === 'finished' ? '1' : '2'};`);
    run('update(1/60);');
    equal('bo.mindT',0,shield+' still took mind control');
    if(shield === 'verdant'){
      /* Absolute for the whole ultimate, including the split second a hit
         reveals the car - Lolanthe cannot command what it cannot see. */
      run(`verdantReveal(B); update(1/60);`);
      equal('bo.verdantRevealT > 0',true);
      equal('bo.mindT',0,'the reveal handed Lolanthe a target');
      equal('bo.mindPop',0);
      run(`endUlt(B);`);
    }
  }
});
test('mind control resets to three seconds and never stacks',()=>{
  pair('me','bot','lolanthe','saffron');
  run(`putBeside(B, A, -mindRange()*0.4); ao.ult = 1; startUlt(A);`);
  run('update(1/60);');
  near('bo.mindT',run('MIND_CONTROL_TIME'));
  const popped = run('bo.mindPop');
  assert.ok(popped > 0,'the entrance is armed on the first application');
  /* Held in the aura: the timer is put back, never added to, and the entrance
     is not replayed. */
  run(`bo.mindPop = 0; bo.mindT = 0.4; update(1/60);`);
  near('bo.mindT',run('MIND_CONTROL_TIME'));
  equal('bo.mindPop',0,'a reset replayed the pop-in');
  /* Five continuous seconds of exposure - the victim is held alongside, since
     a Lolanthe at double pace would otherwise simply drive away from it. */
  run(`for(let i=0;i<300;i++){ putBeside(B, A, -mindRange()*0.4); update(1/60); }`);
  assert.ok(run('bo.mindT') <= run('MIND_CONTROL_TIME') + 1e-9,
            'five seconds in the aura stacked past three');
  near('bo.mindT',run('MIND_CONTROL_TIME'));
  /* And out of it, it runs down from the last application and no further. */
  run(`endUlt(A); globalThis.left = bo.mindT; for(let i=0;i<60;i++) update(1/60);`);
  assert.ok(run('bo.mindT') < run('left'));
  assert.ok(run('bo.mindT') > 0);
  run(`for(let i=0;i<300 && bo.mindT > 0;i++) update(1/60);`);
  equal('bo.mindT',0);
  /* The exit is armed on the frame the timer runs out rather than the notes
     simply being dropped, and it is short - a pop, not a second lifecycle. */
  equal('bo.mindOut > 0',true);
  assert.ok(run('bo.mindOut') <= run('MIND_POP') + 1e-9);
  run(`for(let i=0;i<60;i++) update(1/60);`);
  equal('bo.mindOut',0);
});
test('a racer sharing Lolanthe’s lane is forced out of it, occupied or not',()=>{
  for(const lane of [0, 1, 2]){
    pair('me','bot','lolanthe','saffron');
    run(`if(A === 'me'){ G.lane = ${lane}; G.x = laneCX(${lane}); }
         else { A.lane = ${lane}; A.x = laneCX(${lane}); }
         putBeside(B, A, -mindRange()*0.3);
         ao.ult = 1; startUlt(A); update(1/60);`);
    equal('laneOf(B) !== '+lane,true,'the victim was left in Lolanthe’s lane');
    if(lane === 0) equal('laneOf(B)',1,'from the left wall there is one door');
    if(lane === 2) equal('laneOf(B)',1,'and from the right wall there is one door');
    if(lane === 1) equal('laneOf(B) === 0 || laneOf(B) === 2',true);
    /* Nobody is destroyed by the shove itself: Lolanthe is not a ram. */
    equal('bo.dead',0);equal('ao.dead',0);
    /* And the move is a lane change, not a teleport - x is still catching up. */
    equal('Math.abs(bo.x - laneCX(laneOf(B))) > 0',true);
  }
});
test('the forced move goes through the real barge and can wreck both cars',()=>{
  /* Lolanthe in the middle with the victim beside it and both doors blocked,
     so whichever way the coin lands the victim meets somebody - and meets them
     through the ordinary barge rather than passing through. Both occupants are
     against a barrier, so the shove wrecks whichever one it reaches: a chain
     reaction the collision system produced, not a Lolanthe rule. */
  pair('me','bot','lolanthe','saffron');
  run(`G.lane = 1; G.x = laneCX(1);
       putBeside(B, A, -mindRange()*0.2);
       B.lane = 1; B.x = laneCX(1);
       globalThis.L0 = others()[0]; globalThis.R0 = others()[1];
       [L0, R0].forEach((c, i) => { c.lane = i*2; c.x = laneCX(i*2); c.y = B.y;
         c.dead = 0; c.invuln = 0; c.changeT = 1e6; });
       ao.ult = 1; startUlt(A); update(1/60);`);
  equal('B.lane !== 1',true,'the victim was left in Lolanthe’s lane');
  equal('B.lane === 0 || B.lane === 2',true);
  equal(`(B.lane === 0 ? L0 : R0).dead > 0`,true,
        'the car in the destination lane was driven through');
  /* The other door is untouched - one shove, not two. */
  equal(`(B.lane === 0 ? R0 : L0).dead`,0);
  /* And none of it is a Lolanthe kill: Lolanthe is not a ram. */
  equal('G.dead',0);
  equal('B.dead',0);
  /* With room on the far side, the occupant is shoved across instead and both
     cars survive - again the ordinary barge, applied to a move the victim
     never asked for. */
  pair('me','bot','lolanthe','saffron');
  run(`G.lane = 0; G.x = laneCX(0);
       putBeside(B, A, -mindRange()*0.2);
       B.lane = 0; B.x = laneCX(0);
       globalThis.M0 = others()[0]; M0.lane = 1; M0.x = laneCX(1); M0.y = B.y;
       M0.dead = 0; M0.invuln = 0; M0.changeT = 1e6;
       ao.ult = 1; startUlt(A); update(1/60);`);
  equal('B.lane',1,'from the wall there is one door and it was taken');
  equal('M0.lane',2,'the occupant was shoved across');
  equal('M0.dead',0);equal('B.dead',0);equal('G.dead',0);
  equal('M0.slow > 0',true,'and left labouring, exactly as an ordinary barge leaves it');
});
test('a forced move ignores reversed steering and the control lock alike',()=>{
  pair('me','bot','lolanthe','saffron');
  run(`G.lane = 0; G.x = laneCX(0);
       putBeside(B, A, -mindRange()*0.3);
       B.slip = 5;                           /* Skidded: the driver's steering is reversed */
       ao.ult = 1; startUlt(A); update(1/60);`);
  equal('controlsLocked(B)',true,'the victim is locked out of its own controls');
  equal('B.slip > 0',true);
  equal('B.lane',1,'Lolanthe moved it inward regardless of either');
});

/* ---- the control lock -------------------------------------------- */
test('a controlled driver can steer, boost, item or ultimate by no route at all',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'lolanthe', 'saffron');
    run(`putBeside(B, A, -mindRange()*0.3);
         if(B === 'me'){ G.lane = 1; G.x = laneCX(1); } else { B.lane = 1; B.x = laneCX(1); }
         if(A === 'me'){ G.lane = 0; G.x = laneCX(0); } else { A.lane = 0; A.x = laneCX(0); }
         G.rules.boost = true;
         bo.canT = 0; bo.charge = 1; bo.boostLock = false;
         ao.ult = 1; startUlt(A); update(1/60);`);
    equal('controlsLocked(B)',true);
    /* Charged and handed its item only once control has already been taken: a
       bot that was ready to press a button a frame earlier is entitled to have
       pressed it. */
    run('bo.ult = 1; bo.item = "can";');
    const lane = run('laneOf(B)');
    /* Steering, by the player's own path and by a seat's. */
    run(`if(B === 'me') move(1); else humanSteer(B, 1);`);
    equal('laneOf(B)',lane,'a controlled driver steered');
    run(`if(B === 'me') move(-1); else humanSteer(B, -1);`);
    equal('laneOf(B)',lane);
    /* Boost, held down at the moment control was taken and refused after it. */
    run(`if(B === 'me'){ G.keyBoost = true; setBoost(); } else humanBoost(B, true);
         update(1/60);`);
    equal('bo.boosting',false,'a controlled driver kept boosting');
    /* The ultimate, by either door. */
    run(`if(B === 'me') fireUlt(); else fireUltRival(B); humanUlt(B);`);
    equal('bo.ultOn',false,'a controlled driver fired an ultimate');
    equal('bo.ult',1,'and the meter was not spent on the attempt');
    /* The item, which is kept rather than swallowed. */
    equal(`useItem(B)`,false);
    equal('bo.item','can');
    equal('bo.canT',0);
    /* The car itself is not frozen: it is still driving, still collidable,
       still running its clocks. */
    run(`globalThis.wasY = yOf(B); globalThis.wasM = B === 'me' ? G.meters : metersOf(B);
         for(let i=0;i<20;i++) update(1/60);`);
    equal(`(B === 'me' ? G.meters : metersOf(B)) > wasM`,true,'the car stopped moving');
    equal('noContact(B)',false);
    equal('bo.mindT > 0',true);
  }
});
test('a bot under control makes no lane, item, boost or ultimate decision',()=>{
  pair('me','bot','lolanthe','saffron');
  run(`putBeside(B, A, -mindRange()*0.3);
       B.lane = 1; B.x = laneCX(1); G.lane = 0; G.x = laneCX(0);
       B.changeT = 0; B.blind = 0; B.useT = -1;
       B.charge = 1; B.boostLock = false; G.rules.boost = true;
       G.ult = 1; startUlt('me'); update(1/60);`);
  equal('controlsLocked(B)',true);
  /* Charged and armed only once control has already been taken - a bot that
     was ready a frame earlier is entitled to have acted on it. */
  run(`B.item = "can"; B.ult = 1;`);
  run(`globalThis.lane0 = B.lane; B.changeT = 0;
       for(let i=0;i<40;i++) update(1/60);`);
  equal('B.ultOn',false,'a controlled bot fired its ultimate');
  equal('B.item','can','a controlled bot spent its item');
  equal('B.boosting',false,'a controlled bot boosted');
  /* Its lane only ever changes because Lolanthe moved it, never because it
     decided to - so it is out of Lolanthe's lane and not wandering. */
  equal('B.lane !== G.lane',true);
  /* And once control lapses it thinks again. */
  run(`endUlt('me'); for(let i=0;i<400;i++) update(1/60);`);
  equal('B.mindT',0);
  equal('controlsLocked(B)',false);
});
test('control does not cancel an ultimate the victim was already running',()=>{
  pair('me','bot','lolanthe','saffron');
  run(`putBeside(B, A, -mindRange()*0.3);
       bo.ult = 1; startUlt(B); globalThis.wasT = bo.ultT;
       ao.ult = 1; startUlt(A); update(1/60);`);
  equal('controlsLocked(B)',true);
  equal('bo.ultOn',true,'the victim’s own ultimate was cut short');
  assert.ok(run('bo.ultT') < run('wasT'),'and its clock kept running');
  run(`for(let i=0;i<30;i++) update(1/60);`);
  equal('bo.ultOn',true);
});
test('protection clears mind control the way it clears every other debuff',()=>{
  pair('me','bot','lolanthe','saffron');
  run(`putBeside(B, A, -mindRange()*0.3); ao.ult = 1; startUlt(A); update(1/60);`);
  equal('bo.mindT > 0',true);
  run(`bo.invuln = INVULNERABLE_TIME; sweepDebuffs();`);
  equal('bo.mindT',0);
  equal(`conditionOn(B,'mindControlled')`,false);
  equal('controlsLocked(B)',false);
  /* A wreck does the same, and leaves nothing of the notes behind. */
  run(`bo.invuln = 0; update(1/60); globalThis.held = bo.mindT;`);
  assert.ok(run('held') > 0);
  run(`wreckRival(B, 'me');`);
  equal('bo.mindT',0);equal('bo.mindPop',0);equal('bo.mindOut',0);
  /* And so does the flag. */
  run(`bo.dead = 0; bo.invuln = 0; update(1/60);`);
  assert.ok(run('bo.mindT') > 0);
  run(`bo.finished = 1; sweepDebuffs();`);
  equal('bo.mindT',0);
  equal(`JSON.stringify(activeConditions(B))`,'[]');
  run(`bo.finished = null;`);
});
test('Lolanthe destroys nobody merely by touching them',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'lolanthe', 'saffron');
    run(`ao.ult = 1; startUlt(A); putBeside(B, A, -carH*0.4);
         rearEnd(B, {me:A === 'me', obj:A === 'me' ? null : A, lane:laneOf(A), y:yOf(A)});`);
    equal('ao.dead',0);
    equal('bo.dead',0,'an ulting Lolanthe rammed somebody');
    /* An ordinary rear-end, with the ordinary consequences on both sides. */
    equal(`(B === 'me' ? G.slowT : bo.slow) > 0 || bo.shuntT > 0 || ao.shuntT > 0`,true);
  }
});

/* ---- Verdant ----------------------------------------------------- */
test('an invisible Verdant is physically present, in the race and reachable',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'verdant', 'saffron');
    run(`globalThis.hullBefore = JSON.stringify(carHit(A).points.map(p => [p.x - (A === 'me' ? G.x : A.x), p.y - yOf(A)]));
         globalThis.placeBefore = A === 'me' ? G.meters : metersOf(A);
         ao.ult = 1; startUlt(A); for(let i=0;i<20;i++) update(1/60);`);
    equal('verdantUltActive(A)',true);
    near('ao.verdantHide',1);
    /* Hidden from sight and from nothing else. */
    equal('racerDetectable(A)',false);
    equal('noContact(A)',false);
    equal('safeCar(A)',false);
    equal('ao.dead',0);
    equal('invulnerableWho(A)',false);
    equal(`JSON.stringify(carHit(A).points.map(p => [p.x - (A === 'me' ? G.x : A.x), p.y - yOf(A)]))`,
          run('hullBefore'),'hiding changed the hitbox');
    /* Still in the order, and still drawn into the standings. */
    equal(`fieldView(B).some(x => x.who === A)`,true);
    equal(`fieldView(B).find(x => x.who === A).out`,false);
    equal(`fieldView(B).find(x => x.who === A).touch`,true);
    equal(`fieldView(B).find(x => x.who === A).seen`,false);
    /* And the fade goes back the way it came when the ultimate ends. */
    run(`endUlt(A); for(let i=0;i<30;i++) update(1/60);`);
    equal('ao.verdantHide',0);
    equal('racerDetectable(A)',true);
  }
});
test('Verdant destroys whoever runs into it and wins nothing by arriving',()=>{
  for(const [a, b] of PAIRS){
    /* Somebody runs into the back of it: they are destroyed and it reveals. */
    pair(a, b, 'verdant', 'saffron');
    run(`ao.ult = 1; startUlt(A); putBeside(B, A, carH*0.4);
         rearEnd(B, {me:A === 'me', obj:A === 'me' ? null : A, lane:laneOf(A), y:yOf(A)});`);
    equal('bo.dead > 0',true,'the racer that arrived survived');
    equal('ao.dead',0);
    equal('ao.ultOn',true,'the defence cut the ultimate short');
    equal('ao.ultT',15);
    equal('ao.verdantRevealT > 0',true);
    /* The reveal is cosmetic and short, and it lapses on its own. */
    run(`for(let i=0;i<20;i++) update(1/60);`);
    equal('ao.verdantRevealT',0);
    equal('ao.ultOn',true);
    /* And the other way: Verdant running into somebody is an ordinary
       rear-end, not a kill. */
    pair(a, b, 'verdant', 'saffron');
    run(`ao.ult = 1; startUlt(A); putBeside(A, B, -carH*0.4);
         rearEnd(A, {me:B === 'me', obj:B === 'me' ? null : B, lane:laneOf(B), y:yOf(B)});`);
    equal('bo.dead',0,'an ulting Verdant rammed somebody');
    equal('ao.dead',0);
    equal('ao.verdantRevealT',0,'an ordinary contact revealed it');
    equal(`bo.shuntT > 0 || (A === 'me' ? G.slowT : ao.slow) > 0`,true);
  }
});
test('the defence also runs through the ordinary per-frame contact sweep',()=>{
  /* The player drives up the back of a car it cannot see, on the frame loop
     rather than through a direct call. */
  pair('me','bot','saffron','verdant');
  run(`bo.ult = 1; startUlt(B); B.lane = G.lane; B.x = G.x; B.y = playerY - carH*0.2;
       B.changeT = 1e6; B.abs = BASE_SPEED; update(1/60);`);
  equal('G.dead > 0',true,'the player drove into the hidden car and lived');
  equal('B.dead',0);equal('B.ultOn',true);
  equal('B.verdantRevealT > 0',true);
  /* And the other way, from inside updateRival(): a bot running up the back of
     an invisible player is destroyed by it. */
  pair('me','bot','verdant','saffron');
  run(`ao.ult = 1; startUlt(A); B.lane = G.lane; B.x = G.x; B.y = playerY + carH*0.2;
       B.changeT = 1e6; B.abs = BASE_SPEED; updateRival(B, 1/60, 'running');`);
  equal('B.dead > 0',true);
  equal('G.dead',0);equal('G.ultOn',true);
  equal('G.verdantRevealT > 0',true);
});
test('an ulting Verdant and an ulting Flann destroy each other with nothing left',()=>{
  for(const first of ['verdant','flann']) for(const [a, b] of PAIRS){
    pair(a, b, first === 'verdant' ? 'verdant' : 'flann',
               first === 'verdant' ? 'flann' : 'verdant');
    run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
         putBeside(B, A, carH*0.4);
         rearEnd(B, {me:A === 'me', obj:A === 'me' ? null : A, lane:laneOf(A), y:yOf(A)});`);
    equal('ao.dead > 0',true);
    equal('bo.dead > 0',true);
    equal('ao.ult',0,'a meter survived the mutual wreck');
    equal('bo.ult',0,'a meter survived the mutual wreck');
    equal('ao.ultOn',false);equal('bo.ultOn',false);
  }
  /* And through the lane barge, which must agree with the rear-end. */
  pair('me','bot','verdant','flann');
  run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
       B.lane = G.lane; B.x = G.x; B.y = playerY;
       globalThis.out = bumpTarget({me:false,obj:B,lane:B.lane}, 1, 'me');`);
  equal('out','stopped');
  equal('G.dead > 0',true);equal('B.dead > 0',true);
  equal('G.ult',0);equal('B.ult',0);
});
test('a transformed Neela meeting an ulting Verdant is destroyed, with no swap',()=>{
  for(const first of ['neela','verdant']) for(const [a, b] of PAIRS){
    pair(a, b, first === 'neela' ? 'neela' : 'verdant',
               first === 'neela' ? 'verdant' : 'neela');
    run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
         globalThis.N2 = ao.car === 'neela' ? A : B;
         globalThis.V2 = ao.car === 'neela' ? B : A;
         globalThis.n2 = N2 === 'me' ? G : N2; globalThis.v2 = V2 === 'me' ? G : V2;
         putBeside(B, A, carH*0.4);
         /* Taken once the two of them are in position, so this is where they
            were at the instant of contact and not where they started. */
         globalThis.nWas = N2 === 'me' ? G.meters : metersOf(N2);
         globalThis.vWas = V2 === 'me' ? G.meters : metersOf(V2);
         rearEnd(B, {me:A === 'me', obj:A === 'me' ? null : A, lane:laneOf(A), y:yOf(A)});`);
    equal('neelaFormActive(N2)',false);
    equal('n2.dead > 0',true,'Neela survived an ulting Verdant');
    equal('n2.ult',0,'Neela kept fuel');
    equal('v2.dead',0,'Verdant did not survive');
    equal('v2.ultOn',true);
    equal('v2.verdantRevealT > 0',true,'contact happened but nothing was revealed');
    /* No swap: neither of them was teleported anywhere. */
    equal(`Math.abs((N2 === 'me' ? G.meters : metersOf(N2)) - nWas) < 1e-6`,true);
    equal(`Math.abs((V2 === 'me' ? G.meters : metersOf(V2)) - vWas) < 1e-6`,true);
  }
  /* An ordinary, untransformed Neela gets no special handling beyond the
     one-way defence. */
  pair('me','bot','neela','verdant');
  run(`bo.ult = 1; startUlt(B); putBeside(A, B, 0);
       G.y = playerY; globalThis.out = bumpTarget({me:false,obj:B,lane:B.lane}, 1, 'me');`);
  equal('neelaUltActive("me")',false);
  equal('out','stopped');
  equal('G.dead > 0',true);
  equal('B.dead',0);
});
test('the Neela-versus-Flann priority is untouched where no Verdant is involved',()=>{
  pair('me','bot','neela','flann');
  run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
       putBeside(B, A, carH*0.4);
       rearEnd(B, {me:true, obj:null, lane:G.lane, y:playerY});`);
  /* Still the exchange, still ahead of the ram, and still nobody wrecked. */
  equal('G.dead',0);equal('B.dead',0);
  equal('G.ultOn',true);equal('B.ultOn',true);
  equal('G.neelaSwapped',true);
});
test('bots do not aim at what they cannot see, and still collide with it',()=>{
  pair('me','bot','verdant','saffron');
  run(`ao.ult = 1; startUlt(A); B.lane = 1; B.x = laneCX(1); B.y = playerY - carH*3;
       G.lane = 1; G.x = laneCX(1); B.human = false;
       /* Everybody else out of the bot's lane and far up the road, so what is
          in front of it and behind it is the hidden car or nothing. */
       others().forEach(r => { r.y = playerY - 20000; r.lane = 0; r.x = laneCX(0); });
       for(let i=0;i<20;i++) update(1/60);
       globalThis.s = botSense(B);`);
  equal('s.all.find(x => x.who === A).seen',false);
  equal('botTarget(B, s) === null',true,'a bot picked the invisible car as a target');
  /* It is not the car in front or behind either, which is how a bot comes to
     drive into one: nothing told it to leave room. */
  equal('s.front === null && s.back === null',true);
  equal('threatOf(B, s.all.find(x => x.who === A), s.mine)',0);
  equal('softness(s.all.find(x => x.who === A))',0);
  /* It is not in the lane picture either - a person could not see it. */
  equal(`laneRisk(B).every(v => v === 0)`,true);
  equal(`carSeenAt(1, B.y, B) === null`,true);
  /* But it is physically there, so a contact still lands. */
  equal(`carAt(1, playerY, B) !== null || carAt(G.lane, B.y, B) !== null`,true);
  /* And once it is visible again the bot sees it like anybody else. */
  run(`endUlt(A); for(let i=0;i<30;i++) update(1/60); globalThis.s2 = botSense(B);`);
  equal('s2.all.find(x => x.who === A).seen',true);
  equal('threatOf(B, s2.all.find(x => x.who === A), s2.mine) > 0',true);
});
test('both new ultimates value themselves without claiming the other two do not',()=>{
  /* A crowd is worth something to Lolanthe and an empty road is not. */
  pair('me','bot','lolanthe','saffron');
  run(`A === 'me'; globalThis.L = G.rivals[1]; L.car = "lolanthe"; L.human = false;
       L.lane = 1; L.x = laneCX(1); L.y = playerY - 2000; L.dead = 0; L.invuln = 0;
       G.rivals.forEach(r => { if(r !== L) r.y = playerY - 9000; });
       G.lane = 0; G.x = laneCX(0); globalThis.s = botSense(L);`);
  const alone = run('botUltExtra(L, s)');
  assert.equal(alone,0,'an empty road is worth nothing extra');
  run(`G.rivals.forEach(r => { if(r !== L){ r.y = L.y + carH; r.lane = 1;
         r.dead = 0; r.invuln = 0; } });
       globalThis.s = botSense(L);`);
  const crowd = run('botUltExtra(L, s)');
  assert.ok(crowd > alone,'a crowd in its own lane is worth more');
  /* Verdant values it against what is close enough to be a problem. */
  run(`L.car = "verdant"; globalThis.s = botSense(L);`);
  const threatened = run('botUltExtra(L, s)');
  assert.ok(threatened > 0,'traffic all around is worth something to Verdant');
  /* Alone on the road, with nobody within reach in either direction, it is
     worth nothing beyond the pace - which is a different judgement from the
     ram's and from the exchange's, not a copy of either. */
  run(`L.y = playerY - 12000;
       G.rivals.forEach(r => { if(r !== L) r.y = playerY - 30000; });
       globalThis.s = botSense(L);`);
  assert.equal(run('botUltExtra(L, s)'),0,'an empty road is worth nothing extra');
  /* And the other two are exactly as they were. */
  run(`L.car = "saffron"; globalThis.s = botSense(L);`);
  assert.equal(run('botUltExtra(L, s)'),0);
});
test('both clear exactly the solid hazards Neela clears, and no more',()=>{
  for(const car of ['lolanthe','verdant']){
    /* The tumbleweed and the meteor come apart; the puddle still lands. */
    setup(car,'player');
    hit('player','weed');
    equal('G.slowT',0);equal('G.traps.length',0);equal('G.ultOn',true);
    setup(car,'player');
    hit('player','puddle');
    equal('G.blind > 0',true,car+' shrugged off water');
    setup(car,'player');
    hit('player','oil');
    equal('G.slipT > 0',true,car+' shrugged off oil');
    setup(car,'player');
    hit('player','meteor');
    equal('G.dead',0);equal('G.ultOn',true);
  }
});
test('a wreck takes the note and the fade with it, leaving nothing over the car',()=>{
  /* Ending naturally pops the note out; being wrecked does not leave one
     floating over a car that is no longer on the road. */
  pair('me','bot','lolanthe','verdant');
  run(`ao.ult = 1; startUlt(A);`);
  equal('ao.queenPop > 0',true);
  run(`endUlt(A);`);
  equal('ao.queenOut > 0',true,'a natural end should pop the note out');
  pair('me','bot','lolanthe','verdant');
  run(`ao.ult = 1; startUlt(A); wreckRacer(A);`);
  equal('ao.dead > 0',true);
  equal('ao.queenPop',0);equal('ao.queenOut',0,'a wreck left the note behind');
  equal('ao.ultOn',false);
  /* And the same for the fade: no ghost dissolving through the wreck. */
  pair('me','bot','verdant','saffron');
  run(`ao.ult = 1; startUlt(A); for(let i=0;i<20;i++) update(1/60);`);
  near('ao.verdantHide',1);
  run(`wreckRacer(A);`);
  equal('ao.dead > 0',true);
  equal('ao.verdantHide',0);equal('ao.verdantRevealT',0);
  equal('racerViewAlpha(A, A)',1,'the wreck is drawn solid, like any other');
  /* Crossing the line clears both the same way. */
  pair('me','bot','lolanthe','verdant');
  run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
       for(let i=0;i<20;i++) update(1/60);
       G.finishAt = (A === 'me' ? G.meters : metersOf(A)) - 1;
       G.finishAt = Math.min(G.finishAt, (B === 'me' ? G.meters : metersOf(B)) - 1);
       checkFinish();`);
  equal('ao.queenOut',0);equal('ao.queenPop',0);
  equal('bo.verdantHide',0);equal('bo.verdantRevealT',0);
});
test('nothing of either ultimate survives a restart',()=>{
  pair('me','bot','lolanthe','verdant');
  run(`ao.ult = 1; startUlt(A); bo.ult = 1; startUlt(B);
       putBeside(B, A, -mindRange()*0.3);
       for(let i=0;i<20;i++) update(1/60);
       G.mindT = MIND_CONTROL_TIME; G.mindPop = MIND_POP; G.mindOut = 0;
       G.queenPop = QUEEN_POP; G.verdantHide = 1; G.verdantRevealT = 0.1;`);
  run(`G.local = false; G.car = "flann"; G.rules = defaultRules();
       G.mode = 'endless'; startRace(); clearTimers();`);
  equal('G.mindT',0);equal('G.mindPop',0);equal('G.mindOut',0);
  equal('G.queenPop',0);equal('G.queenOut',0);
  equal('G.verdantHide',0);equal('G.verdantRevealT',0);
  equal(`G.rivals.every(r => r.mindT === 0 && r.mindPop === 0 && r.mindOut === 0 &&
                             r.queenPop === 0 && r.queenOut === 0 &&
                             r.verdantHide === 0 && r.verdantRevealT === 0)`,true);
  equal(`JSON.stringify(activeConditions('me'))`,'[]');
});

/* ================================================================
   RHOSYN'S ULTIMATE  -  AERO-GLOW
   ================================================================
   The lifecycle above is shared and stays shared. What Rhosyn adds to it is
   the one power that is not a collision priority: for fifteen seconds its own
   driver is shown a private world, and the shared road has no body at its
   position to interact with in either direction.

   Everything here is about the invariant that makes that safe - there is never
   a second race. The canonical racer goes on being advanced by the same
   simulation as everybody else throughout, which is why the return needs no
   correction, no restored pose and no saved biome. */

/* How far down the road a racer actually is, and what it is doing there. */
const CANON = w => `({m:${w} === 'me' ? G.meters : metersOf(${w}),` +
                   ` lane:(${w} === 'me' ? G : ${w}).lane,` +
                   ` x:(${w} === 'me' ? G : ${w}).x,` +
                   ` biome:G.biome, next:G.next, seam:G.seam})`;

test('the phase is a small explicit state, and the shared lifecycle is untouched',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'rhosyn', 'saffron');
    equal('ao.aeroPhase','off');
    equal('rhosynElsewhere(A)',false);
    equal('aeroGlowViewActive(A)',false);
    /* The shared clock, the shared duration and the shared pace, unchanged. */
    equal('ULT_CHARGE',75);equal('ULT_TIME',15);equal('ULT_SPEED',2);
    run(`ao.ult = 1; if(A === 'me') fireUlt(); else fireUltRival(A);`);
    equal('ao.ultOn',true);equal('ao.ultT',15);equal('ao.ultMax',15);
    /* Departing: unreachable already, still on everybody else's screen. */
    equal('ao.aeroPhase','in');
    near('ao.aeroT',run('AERO_SHIFT'));
    equal('rhosynElsewhere(A)',true);
    equal('aeroGlowViewActive(A)',false,'the view changes hands under white');
    equal('whiteoutActive(A)',true);
    equal('morphFlash(A) > 0',true);
    /* And the white transition is the shared one, not a second renderer. */
    equal('ao.whiteT',run('WHITEOUT_TIME'));
    equal('ao.morphT',run('MORPH_TIME'));
    /* Under full white the view changes hands. */
    run(`for(let i=0;i<40;i++) update(1/60);`);
    equal('ao.aeroPhase','glow');
    equal('ao.aeroT',0);
    equal('aeroGlowViewActive(A)',true);
    /* Fifteen seconds, counted by the one shared clock and no other. */
    run(`for(let i=0;i<60*14;i++) update(1/60);`);
    equal('ao.ultOn',true);
    equal('ao.aeroPhase','glow');
    /* Stop on the frame the meter runs out, which is the frame the return
       starts: the ultimate is over and the car is still away. */
    run(`for(let i=0;i<60*2 && ao.ultOn;i++) update(1/60);`);
    equal('ao.ultOn',false);equal('ao.ultT',0);equal('ao.ult',0);
    equal('ao.ultMax',15);
    equal('ao.aeroPhase','out');
    equal('rhosynElsewhere(A)',true,'protected until it is genuinely back');
    equal('aeroGlowViewActive(A)',true,'still looking at the void, under white');
    equal('whiteoutActive(A)',true);
    equal('morphFlash(A) > 0',true);
    equal('ao.invuln',0,'the two seconds must not start early');
    /* And then it is home, with the shared Invulnerable Condition on it. */
    run(`for(let i=0;i<40;i++) update(1/60);`);
    equal('ao.aeroPhase','off');
    equal('rhosynElsewhere(A)',false);
    equal('aeroGlowViewActive(A)',false);
    equal('ao.aeroT',0);
    equal('ao.aeroHide',0);
    equal('ao.invuln > 0',true);
    /* The meter charges again off exactly the shared clock. */
    run(`globalThis.was = ao.ult; for(let i=0;i<60;i++) update(1/60);`);
    near('ao.ult - was',1/75);
  }
});
test('there is exactly one Rhosyn race position, and Aero-Glow never touches it',()=>{
  pair('me','bot','rhosyn','saffron');
  /* Lay a seam a short way up the road so the canonical race genuinely
     changes biome while the owner is away. */
  run(`ao.ult = 1; startUlt(A); globalThis.at0 = ${CANON("A")};
       globalThis.log = [];`);
  equal('at0.biome','city');
  /* Drive. The phase advances from the same update loop the race does, and
     the racer is steered mid-flight, exactly as a driver would. */
  run(`for(let i=0;i<60*6;i++){
         update(1/60);
         if(i === 90) G.trackT = 0.2;                  /* bring the seam on */
         if(i === 150){ if(A === 'me') move(1); else rivalLaneTo(A, 2); }
         log.push({m:A === 'me' ? G.meters : metersOf(A), biome:G.biome,
                   lane:(A === 'me' ? G : A).lane, phase:ao.aeroPhase});
       }`);
  /* It was away for all of it. */
  equal(`log.every(s => s.phase === 'in' || s.phase === 'glow')`,true);
  /* The one canonical distance went on advancing, monotonically, at the
     ultimate's own double pace - and there is no second metre count anywhere
     that could have been the authoritative one instead. */
  equal(`log.every((s, i) => i === 0 || s.m >= log[i-1].m)`,true);
  equal(`log[log.length-1].m > at0.m + 100`,true);
  equal(`typeof ao.aeroMeters`,'undefined');
  equal(`typeof ao.aeroOrigin`,'undefined');
  equal(`typeof ao.aeroPose`,'undefined');
  equal(`typeof ao.aeroBiome`,'undefined');
  /* The lane answered the controls while it was away. */
  equal(`log[log.length-1].lane`,2);
  /* And the race went through a track change underneath it. */
  equal(`log.some(s => s.biome !== 'city')`,true);
  equal(`G.biome !== 'city'`,true);
  /* Now end it and look: the racer is exactly where the race had already put
     it on that frame. Nothing is restored, so nothing can be restored wrong. */
  run(`globalThis.before = ${CANON("A")}; endUlt(A); globalThis.after = ${CANON("A")};`);
  equal('Math.abs(after.m - before.m) < 1e-9',true,'ending teleported the racer');
  equal('after.lane',run('before.lane'));
  equal('Math.abs(after.x - before.x) < 1e-9',true);
  /* Including the world it comes back into: the biome the race has actually
     reached, never the one it left. */
  equal('after.biome',run('G.biome'));
  equal(`after.biome !== at0.biome`,true,'it came back into the biome it left');
  equal('after.seam',run('G.seam'));
  /* And through the return transition the position is still untouched. */
  run(`globalThis.mid = ${CANON("A")};
       for(let i=0;i<40;i++) update(1/60);`);
  equal('ao.aeroPhase','off');
  equal(`(A === 'me' ? G.meters : metersOf(A)) > mid.m`,true,'it stopped driving');
  /* Nothing was rebased under it: everybody else is where the race left them
     relative to the road, not shifted by somebody coming home. */
  equal('others().every(r => r.finished === null && r.dead === 0)',true);
});
test('G.biome, the seam and the track clock are never touched by Aero-Glow',()=>{
  pair('me','bot','rhosyn','saffron');
  run(`globalThis.seen = new Set();
       ao.ult = 1; startUlt(A);
       for(let i=0;i<60*12;i++){ update(1/60); seen.add(G.biome); if(i===60) G.trackT = 0.2; }`);
  equal(`[...seen].every(b => TRACK_IDS.indexOf(b) >= 0)`,true,'a view became a track');
  equal(`TRACK_IDS.indexOf(G.biome) >= 0`,true);
  equal(`typeof TRACKS.aeroglow`,'undefined');
  equal(`G.next === null || TRACK_IDS.indexOf(G.next) >= 0`,true);
  run(`endUlt(A); for(let i=0;i<40;i++) update(1/60);`);
  equal(`TRACK_IDS.indexOf(G.biome) >= 0`,true);
});

/* ---- the isolation, and its symmetry -----------------------------
   The desired rule in one line: while Rhosyn is in Aero-Glow the shared road
   behaves as if there is no interactable body at Rhosyn's canonical position.
   Both halves of that matter, so every check below is made twice - once with
   the shared road reaching for Rhosyn, and once with Rhosyn reaching out of
   Aero-Glow for the shared road. */
function awayPair(other, theirUlt){
  pair('me','bot','rhosyn',other);
  run(`globalThis.asVictim = w => ({ me:w === 'me', obj:w === 'me' ? null : w,
                                     lane:(w === 'me' ? G : w).lane,
                                     y:w === 'me' ? playerY : w.y });
       ${theirUlt ? 'bo.ult = 1; startUlt(B);' : ''}
       ao.ult = 1; startUlt(A);
       for(let i=0;i<40;i++) update(1/60);
       putBeside(B, A, -carH*0.4);`);
  equal('ao.aeroPhase','glow');
}
test('nothing on the shared road reaches a Rhosyn in Aero-Glow, and it reaches nothing',()=>{
  /* Every contact rule in the game, from both sides. */
  for(const [other, ulting, name] of [['saffron',false,'an ordinary racer'],
                                      ['flann',true,'an ulting Flann'],
                                      ['neela',true,'an alternate-form Neela'],
                                      ['verdant',true,'an ulting Verdant']]){
    awayPair(other, ulting);
    run(`globalThis.at = [${CANON("A")}, ${CANON("B")}];`);
    /* Them into the back of Rhosyn, and Rhosyn into the back of them. */
    run(`rearEnd(B, asVictim(A)); rearEnd(A, asVictim(B));`);
    equal('ao.dead',0,name+' wrecked a car that was not there');
    equal('bo.dead',0,name+' was wrecked by a car that was not there');
    equal('ao.slow || G.slowT',0);
    equal('bo.shuntT || 0',0);
    equal('ao.ultOn',true);
    /* Nobody was swapped, rammed or moved an inch. */
    equal(`Math.abs(${CANON("A")}.m - at[0].m) < 1e-9`,true);
    equal(`Math.abs(${CANON("B")}.m - at[1].m) < 1e-9`,true);
    /* The lane barge, from both sides. */
    run(`globalThis.o1 = bumpTarget(asVictim(A), 1, B);
         globalThis.o2 = bumpTarget(asVictim(B), 1, A);`);
    equal('o1','none');equal('o2','none');
    equal('ao.dead',0);equal('bo.dead',0);
    /* And the queries every offensive system is built on. */
    equal('carAt(laneOf(A), yOf(A), B)',null);
    equal('carAt(laneOf(B), yOf(B), A)',null);
    equal('rearContact(A)',null);
    equal('noContact(A)',true);
    if(other === 'neela') equal('bo.neelaSwapped',false,'the exchange was spent on a ghost');
    if(other === 'verdant') equal('bo.verdantRevealT',0,'it was revealed by nobody');
  }
});
test("Lolanthe's aura cannot reach into Aero-Glow, and Mind Control is refused",()=>{
  awayPair('lolanthe', true);
  run(`putBeside(B, A, -mindRange()*0.4); for(let i=0;i<4;i++) update(1/60);`);
  equal('lolantheUltActive(B)',true);
  equal('ao.mindT',0,'a racer that is not on the road was taken anyway');
  equal(`conditionOn(A,'mindControlled')`,false);
  equal('controlsLocked(A)',false);
  /* Through the one gate the aura asks, which is the same gate an Invulnerable
     racer and an ulting Verdant are refused by. */
  equal('mindTakes(B, A)',false);
  equal('refusesDebuffs(A)',true);
  /* And the shove that comes with it finds nothing to push. */
  equal('mindShove(A)','none');
  equal('ao.aeroPhase','glow');
});
test('shared-road pickups and offensive systems all skip a departed Rhosyn',()=>{
  awayPair('saffron', false);
  /* A bubble row laid exactly on it is not swept up: it cannot see the row,
     and what it leaves is still there for whoever does reach it. */
  run(`G.boxes = [{ y: yOf(A), gone:0, s:0.5, life:BUBBLE_LIFE, blink:0, ph:0, doomed:false }];
       if(A === 'me'){ G.lane = 1; G.x = laneCX(1); } else { A.lane = 1; A.x = laneCX(1); }
       G.rivals.forEach(r => { if(r !== A) r.y = playerY - 9000; });
       updateBubbles(1/60, 0, 'running');`);
  equal('G.boxes.length',1);
  equal('G.boxes[0].gone',0,'it collected a bubble it could not see');
  /* No seeker is aimed at it, by anybody. */
  run(`globalThis.mark = seekerTarget(B);`);
  equal(`mark === null || mark.obj !== A`,true);
  equal(`mark === null || !(mark.me && A === 'me')`,true);
  /* One already in the air waits it out rather than following it home. */
  run(`G.missiles = [{x: A === 'me' ? G.x : A.x, y: yOf(A), vx:0, vy:-100,
                      mark: A, owner: B, life:10, fade:0}];
       updateMissiles(1/60, 0);`);
  equal('G.missiles.length',1,'the seeker reached a car that was not there');
  equal('ao.dead',0);
  equal('markShielded(A)',true);
  /* And it cannot fire one back, or drop oil, or crack a can: the command is
     refused and the item is kept rather than spent into a world it is not in. */
  run(`ao.item = "seeker"; globalThis.used = useItem(A);`);
  equal('used',false);
  equal('ao.item','seeker','a refused item was silently eaten');
  equal('G.missiles.length',1);
  run(`ao.item = "oil"; globalThis.used2 = useItem(A);`);
  equal('used2',false);equal('ao.item','oil');equal('G.slicks.length',0);
  run(`ao.item = null;`);
  /* A driver reading the road does not see it either, so no bot aims at it. */
  run(`globalThis.s = botSense(B);`);
  equal(`s.all.find(x => x.who === A).touch`,false);
  equal(`s.all.find(x => x.who === A).seen`,false);
  equal(`softness(s.all.find(x => x.who === A))`,0);
  equal(`carSeenAt(laneOf(A), yOf(A), B)`,null);
  equal('racerDetectable(A)',false);
  /* But it has not been taken out of the race: it is still in the field, still
     in the order, and neither wrecked nor finished. */
  equal('ao.dead',0);equal('ao.finished',null);
  equal(`racers().length`,run('G.rivals.length + 1'));
  equal(`leaderOf(A) === true || leaderOf(A) === false`,true);
});
/* ---- the two seconds on the way back ----------------------------- */
test('the return grants the existing Invulnerable Condition, and nothing else',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'rhosyn', 'saffron');
    run(`ao.ult = 1; startUlt(A);
         for(let i=0;i<60*15 && ao.ultOn;i++) update(1/60);`);
    equal('ao.aeroPhase','out');
    equal('ao.invuln',0,'the protection started while it was still away');
    run(`for(let i=0;i<40 && ao.aeroPhase !== 'off';i++) update(1/60);`);
    equal('ao.aeroPhase','off');
    /* Exactly the shared Condition, for exactly the shared two seconds. */
    equal('INVULNERABLE_TIME',2);
    equal(`ao.invuln <= INVULNERABLE_TIME && ao.invuln > INVULNERABLE_TIME - 0.05`,true);
    equal('invulnerableWho(A)',true);
    equal('noContact(A)',true);
    equal(`activeConditions(A).indexOf('invulnerable')`,0);
    /* And no second shield anywhere: the Condition is the source of truth. */
    equal(`typeof ao.rhosynImmune`,'undefined');
    equal(`typeof ao.aeroShield`,'undefined');
    equal(`typeof ao.aeroInvuln`,'undefined');
    equal('rhosynElsewhere(A)',false);
    /* Immediate contact is refused, exactly as a respawn's is. */
    run(`globalThis.asVictim = w => ({ me:w === 'me', obj:w === 'me' ? null : w,
                                       lane:(w === 'me' ? G : w).lane,
                                       y:w === 'me' ? playerY : w.y });
         bo.car = "flann"; bo.ult = 1; startUlt(B);
         putBeside(B, A, -carH*0.4);
         rearEnd(B, asVictim(A));`);
    equal('ao.dead',0,'an ulting Flann reached it through the protection');
    /* Two seconds later it is an ordinary racer again. */
    run(`for(let i=0;i<60*2 + 4;i++) update(1/60);`);
    equal('ao.invuln',0);
    equal('noContact(A)',false);
    equal(`activeConditions(A).indexOf('invulnerable')`,-1);
    run(`putBeside(B, A, -carH*0.4); rearEnd(B, asVictim(A));`);
    equal('ao.dead > 0',true,'and now the same contact lands');
  }
});
test('a longer protection already running is never shortened by coming home',()=>{
  pair('me','bot','rhosyn','saffron');
  run(`ao.ult = 1; startUlt(A);
       for(let i=0;i<60*15 && ao.ultOn;i++) update(1/60);
       ao.invuln = 9;
       for(let i=0;i<40 && ao.aeroPhase !== 'off';i++) update(1/60);`);
  equal('ao.aeroPhase','off');
  equal(`ao.invuln > INVULNERABLE_TIME`,true,'max(existing, 2) was not honoured');
});
/* ---- the lifecycle edges ----------------------------------------- */
test('a pause stops the departure, the void and the return dead',()=>{
  pair('me','bot','rhosyn','saffron');
  run(`ao.ult = 1; startUlt(A);
       globalThis.before = {phase:ao.aeroPhase, t:ao.aeroT, ult:ao.ultT,
                            m:A === 'me' ? G.meters : metersOf(A)};
       G.state = 'paused';
       for(let i=0;i<120;i++) update(1/60);`);
  equal('ao.aeroPhase',run('before.phase'));
  near('ao.aeroT',run('before.t'));
  near('ao.ultT',run('before.ult'));
  equal(`Math.abs((A === 'me' ? G.meters : metersOf(A)) - before.m) < 1e-9`,true);
  /* And resuming picks it up exactly where it stopped. */
  run(`G.state = 'running'; for(let i=0;i<40;i++) update(1/60);`);
  equal('ao.aeroPhase','glow');
  equal(`ao.ultT < before.ult`,true);
});
test('crossing the line while away is a real finish, and nothing stays in the void',()=>{
  for(const [a, b] of PAIRS){
    pair(a, b, 'rhosyn', 'saffron');
    run(`ao.ult = 1; startUlt(A);
         for(let i=0;i<60;i++) update(1/60);`);
    equal('ao.aeroPhase','glow');
    /* The canonical distance is what the flag is measured against, and it has
       been advancing all along - so put the line just behind it. */
    run(`G.finishAt = (A === 'me' ? G.meters : metersOf(A)) - 1;
         checkFinish();`);
    equal('ao.finished > 0',true,'Aero-Glow swallowed a legitimate finish');
    /* Cleaned up: no phase, no fade, no ultimate, and no renderer trapped. */
    equal('ao.aeroPhase','off');
    equal('ao.aeroT',0);equal('ao.aeroHide',0);
    equal('ao.ultOn',false);
    equal('rhosynElsewhere(A)',false);
    equal('aeroGlowViewActive(A)',false);
    equal('racerViewAlpha(A, A)',1);
    /* A finisher is out of play and wears no badge, this one included. */
    equal(`JSON.stringify(activeConditions(A))`,'[]');
    equal('ao.invuln',0,'a finisher was handed the return protection');
    run(`G.finishAt = 0; ao.finished = null;`);
  }
});
test('a wreck cannot reach it, and a forced one still cleans up after itself',()=>{
  /* The ordinary destruction path refuses, because it asks the same question
     every contact asks: there is no body there to wreck. */
  pair('bot','me','rhosyn','saffron');
  run(`ao.ult = 1; startUlt(A); for(let i=0;i<60;i++) update(1/60); wreckRacer(A);`);
  equal('ao.dead',0,'a wreck reached a car that was not on the road');
  equal('ao.aeroPhase','glow');
  equal('ao.ultOn',true);
  /* A forced or debug lifecycle path is not something a race can do, but the
     cleanup has to be robust to it: no phase, no fade and no ultimate left
     behind, and no renderer trapped in the void over a wreck. */
  run(`wreckRival(A, undefined, true);`);
  equal('ao.dead > 0',true);
  equal('ao.aeroPhase','off');
  equal('ao.aeroT',0);equal('ao.aeroHide',0);
  equal('ao.ultOn',false);
  equal('aeroGlowViewActive(A)',false);
  equal('racerViewAlpha(A, A)',1);
  /* Player one's own destruction is the forced path by construction, and
     clears exactly the same state. */
  pair('me','bot','rhosyn','saffron');
  run(`ao.ult = 1; startUlt(A); for(let i=0;i<60;i++) update(1/60); destroyCar();`);
  equal('G.dead > 0',true);
  equal('G.aeroPhase','off');equal('G.aeroT',0);equal('G.aeroHide',0);
  equal('G.ultOn',false);
  equal('aeroGlowViewActive("me")',false);
});
test('nothing of Aero-Glow survives a restart',()=>{
  pair('me','bot','rhosyn','saffron');
  run(`ao.ult = 1; startUlt(A); for(let i=0;i<60;i++) update(1/60);`);
  equal('G.aeroPhase','glow');
  run(`G.local = false; G.car = "flann"; G.rules = defaultRules();
       G.mode = 'endless'; startRace(); clearTimers();`);
  equal('G.aeroPhase','off');equal('G.aeroT',0);equal('G.aeroHide',0);
  equal('rhosynElsewhere("me")',false);
  equal('aeroGlowViewActive("me")',false);
  equal(`G.rivals.every(r => r.aeroPhase === 'off' && r.aeroT === 0 && r.aeroHide === 0)`,true);
  /* And leaving the race takes it with it too. */
  run(`G.car = "rhosyn"; startRace(); clearTimers(); G.state = 'running';
       G.ult = 1; startUlt('me'); for(let i=0;i<60;i++) update(1/60);`);
  equal('G.aeroPhase','glow');
  run(`leave(); G.car = "rhosyn"; startRace(); clearTimers();`);
  equal('G.aeroPhase','off');
  equal('aeroGlowViewActive("me")',false);
});

/* Saffron uses the same state machine for all three driver types. */
for(const kind of ['player','bot','local']){
  test('saffron/'+kind+' flight, mind control, drop, geometry and cleanup',()=>{
    setup('saffron',kind);
    equal('racerModel(who).key','saffronAlt');equal('o.saffronPhase','rise');
    equal('o.whiteT',run('WHITEOUT_TIME'));equal('o.morphT',run('MORPH_TIME'));
    equal('clearsSolidHazards(who)',false);equal('refusesDebuffs(who)',false);
    run('globalThis.pose=JSON.stringify(racerWorldPose(who));tickSaffron(who,MORPH_TIME);');
    equal('o.saffronPhase','air');equal('o.saffronLift',1);
    equal('JSON.stringify(racerWorldPose(who))===pose',true);
    near('racerDims(who).w/laneW',2);
    run(`o.lane=1;o.mindSide=1;o.boosting=true;
         globalThis.target=who==='me'?G.rivals[0]:'me';
         globalThis.tgt=target==='me'?G:target;
         tgt.car='lolanthe';tgt.dead=0;tgt.invuln=0;tgt.finished=null;
         applyMindControl(who);o.mindSide=1;mindShove(who);tickUlt(who,.25);`);
    equal('mindTakes(target,who)',true);equal('o.mindT',3);
    equal('controlsLocked(who)',true);equal('o.boosting',false);equal('o.lane',2);
    near('o.ultT',14.75);
    // Place the other racer under the canonical road footprint.
    run(`tgt.x=o.x;tgt.lane=o.lane;if(target==='me') playerY=o.y;else tgt.y=playerY;
         o.mindT=0;tickUlt(who,20);`);
    equal('o.saffronPhase','drop');equal('racerModel(who).key','saffron');
    equal('o.saffronLift',1);
    run('globalThis.pose=JSON.stringify(racerWorldPose(who));tickSaffron(who,.05);');
    equal('o.saffronLift',1);equal('tgt.dead',0);
    run('tickSaffron(who,1);');
    equal('tgt.dead>0',true);equal('o.dead',0);equal('o.saffronPhase','off');
    equal('JSON.stringify(racerWorldPose(who))===pose',true);
    equal('swapGuarded(who)',true);equal('noContact(who)',false);
    setup('saffron',kind);run('o.finished=1;tickSaffron(who,1);');
    equal('o.saffronPhase','off');equal('o.saffronLift',0);
  });
  test('saffron/'+kind+' intercepts descending meteor without a ground blast',()=>{
    setup('saffron',kind);run(`tickSaffron(who,MORPH_TIME);
      globalThis.mo={kind:'meteor',x:o.x,y:racerY(who),r:80,mr:18,max:1,phase:0,t:0};
      mo.fall=(saffronAltitude(who)/METEOR_ALT)*rockLead(mo);
      G.fx=[];G.traps=[mo];updateTraps(0,0,'running');`);
    equal('G.traps.length',0);equal('mo.phase',0);equal('o.dead',0);equal('G.fx.length>0',true);
    equal('clearsSolidHazards(who)',false);
    setup('saffron',kind);run(`tickSaffron(who,MORPH_TIME);
      globalThis.mo={kind:'meteor',x:o.x+roadW*3,y:racerY(who),r:80,mr:18,max:1,phase:0,t:0,fall:.02};
      G.traps=[mo];updateTraps(.03,0,'running');`);
    equal('mo.phase',1);equal('o.dead',0);
  });
}
test('Saffron touchdown resolves every overlap and respects protection',()=>{
  for(const state of ['ordinary','invuln','finished','aero','air','distant']){
    setup('saffron','player');
    run(`globalThis.v=G.rivals[0];v.car='rhosyn';v.x=G.x;v.y=playerY;v.lane=G.lane;
      v.dead=0;v.invuln=0;v.finished=null;
      ${state==='invuln'?'v.invuln=2;':state==='finished'?'v.finished=1;':state==='aero'?'startUlt(v);':state==='air'?"v.car='saffron';startUlt(v);":state==='distant'?'v.x+=roadW*2;':''}
      endUlt('me');tickSaffron('me',1);`);
    equal('v.dead>0',state==='ordinary');
  }
  setup('saffron','player');
  run(`globalThis.v=G.rivals[0];v.car='flann';v.x=G.x;v.y=playerY;v.invuln=0;
       globalThis.v2={...v};G.rivals.push(v2);endUlt('me');tickSaffron('me',1);`);
  equal('v.dead>0 && v2.dead>0',true);
});
test('Saffron finish never triggers a delayed touchdown; paused flight clocks hold',()=>{
  setup('saffron','player');run(`tickSaffron('me',MORPH_TIME);G.finishAt=G.meters+1;
    G.meters+=2;checkFinish();tickSaffron('me',1);`);
  equal('G.saffronPhase','off');equal('G.saffronLift',0);equal('G.ultOn',false);
  setup('saffron','player');run(`G.state='paused';globalThis.before=G.saffronT;update(.1);`);
  equal('G.saffronT===before',true);
});
test('Aero-Glow DOM and canvas distance HUD is private and restores current track',()=>{
  setup('rhosyn','player');run(`tickAeroGlow('me',AERO_SHIFT+AERO_FADE);paintHUD(true);`);
  equal('$("#trackName").textContent',run('t("aeroGlow")'));
  equal('$(".readout").style.display','none');
  run(`curTrackKey=TRACKS.desert.key;endUlt('me');tickAeroGlow('me',AERO_SHIFT+AERO_FADE);paintHUD(true);`);
  equal('$("#trackName").textContent',run('t(curTrackKey)'));
  equal('$(".readout").style.display','');
});

test('leaving the race clears every Saffron flight and transition',()=>{
  setup('saffron','player');run(`startUlt(G.rivals[0]);leave();`);
  equal('G.saffronPhase','off');equal('G.saffronLift',0);equal('G.whiteT',0);equal('G.morphT',0);
  equal('G.rivals[0].saffronPhase','off');equal('G.rivals[0].ultOn',false);equal('G.ultOn',false);
});

console.log(`\n${checks} ultimate regression checks passed (DOM/Canvas doubles; no physical controller or visual QA).`);
