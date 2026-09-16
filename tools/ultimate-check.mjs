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
  test(label + ' no immunity, no cleanse and it is still reachable',()=>{
    setup(car,kind,false);
    run(`if(who === 'me'){G.slowT=2;G.slipT=3;G.blind=1;}else{o.slow=2;o.slip=3;o.blind=1;} startUlt(who);`);
    equal(`who === 'me' ? G.slowT : o.slow`,2);
    equal(`who === 'me' ? G.slipT : o.slip`,3);equal('o.blind',1);
    equal('refusesDebuffs(who)',false);equal('noContact(who)',false);
    equal('invulnerableWho(who)',false);
    equal(`who === 'me' ? playerUntouchable() : safeCar(who)`,false);
    /* Neither car-specific ultimate is the Invulnerable Condition: both are
       collision priority, changing who loses a contact rather than whether the
       contact can happen at all. So every answer above is the same for all
       six, and the predicates below are the only thing that differs. */
    equal('flannUltActive(who)',car === 'flann');
    equal('neelaUltActive(who)',car === 'neela');
    equal('neelaFormActive(who)',car === 'neela');
    equal('clearsSolidHazards(who)',car === 'flann' || car === 'neela');
    equal('neelaCanSwap(who)',car === 'neela');
  });
  const priority = car === 'flann' ? 'the ram'
                 : car === 'neela' ? 'the exchange' : 'ordinary barging';
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
      /* Barging into an ulting Flann wrecks the barger. Flann does not move
         lane, is not slowed, and keeps its ultimate. */
      equal('outcome','stopped');
      equal('o.lane',1);equal('o.dead',0);equal('o.ultOn',true);
      equal(`who === 'me' ? G.slowT : o.slow`,0);
      equal('att.dead > 0',true);
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
    } else {
      equal('outcome','moved');
      equal('o.lane',2);equal('o.dead',0);
      run(`globalThis.outcome = bumpTarget({me:who==='me',obj:who==='me'?null:o,lane:2},1,attacker);`);
      equal('outcome','wrecked');
      equal('o.dead > 0',true);equal('o.ultOn',false);
    }
  });
  for(const type of ['puddle','weed','oil','meteor','seeker']){
    /* The two solid hazards are Flann's and Neela's to smash while their
       ultimates run; water, oil and a guided missile are not, for anybody. */
    const smashed = (car === 'flann' || car === 'neela') &&
                    (type === 'weed' || type === 'meteor');
    test(label + (smashed ? ' smashes ' : ' vulnerable to ') + type,()=>{
      setup(car,kind);hit(kind,type);
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
/* Every pair of cars, both ulting, running into each other's backs. Only the
   pairs with exactly one Flann or exactly one Neela in them behave
   differently: two ulting Flanns cannot smash each other and two
   alternate-form Neelas cannot trade places with each other, so both of those
   pairs fall back to the ordinary shunt like anybody else.

   A Flann and a Neela meeting is the exchange rather than the kill: the swap
   is settled first because the contact spends Neela's form either way, and
   spending it on a wreck would leave a car destroyed and a swap still owed. */
test('rear contact between every pair of ulting cars, ordinary except the ram and the exchange',()=>{
  for(const car of cars) for(const rival of cars){
    const swap = (car === 'neela') !== (rival === 'neela');
    const meRam = !swap && car === 'flann' && rival !== 'flann';
    const themRam = !swap && rival === 'flann' && car !== 'flann';
    setup(car,'player');run(`globalThis.r=G.rivals[0];r.car=${JSON.stringify(rival)};r.lane=G.lane;r.y=playerY-carH*0.5;startUlt(r);
      globalThis.beforeM=[G.meters,metersOf(r)];
      rearEnd('me',{me:false,obj:r,lane:r.lane,y:r.y});`);
    if(swap){
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
    } else if(meRam){
      /* Driving into the back of somebody while on fire destroys them, and
         the ram takes none of the ordinary rear-end consequence for it. */
      equal('r.dead > 0',true);equal('G.dead',0);
      equal('G.slowT',0);equal('r.shuntT',0);equal('G.ultOn',true);
    } else if(themRam){
      /* And rear-ending an ulting Flann destroys the car that did it. */
      equal('G.dead > 0',true);equal('r.dead',0);
      equal('G.slowT',0);equal('r.shuntT',0);equal('r.ultOn',true);
    } else {
      equal('G.slowT > 0',true);equal('r.shuntT > 0',true);equal('r.dead',0);equal('G.dead',0);
      /* The shove reads as Boosted, exactly as ordinary boost does. */
      equal(`activeConditions(r).indexOf('boosted') >= 0`,true);
    }
    run(`endUlt('me');endUlt(r);`);
    equal('r.dead > 0',meRam);equal('G.dead > 0',themRam);
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
  run(`G.local = false; G.car = ${kind === 'player' ? '"flann"' : '"bolt"'};
       G.rules = defaultRules(); G.rules.bots = 1; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); G.state = 'running';
       G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       globalThis.rvl = G.rivals[0];
       rvl.car = ${kind === 'player' ? '"bolt"' : '"flann"'}; rvl.human = ${kind === 'local'};
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

  test(tag + ' wrecks whatever it rear-ends, and whatever rear-ends it',()=>{
    /* Flann into the back of somebody. */
    duel(kind);
    run(`rearEnd(F, asVictim(X));`);
    equal('xo.dead > 0',true);equal('fo.dead',0);equal('fo.ultOn',true);
    equal(`F==='me' ? G.slowT : F.slow`,0);          /* no rear-end Slow for the ram */
    equal(`X==='me' ? G.shuntT : X.shuntT`,0);       /* and nobody was shoved along */
    /* Somebody into the back of Flann. */
    duel(kind);
    run(`rearEnd(X, asVictim(F));`);
    equal('xo.dead > 0',true);equal('fo.dead',0);equal('fo.ultOn',true);
    equal(`F==='me' ? G.shuntT : F.shuntT`,0);       /* Flann is not shunted */
    equal(`X==='me' ? G.slowT : X.slow`,0);
    /* Expired, both directions go straight back to the ordinary shunt. */
    duel(kind,false);
    run(`rearEnd(F, asVictim(X));`);
    equal('xo.dead',0);equal('fo.dead',0);
    equal(`F==='me' ? G.slowT : F.slow`,run('BUMP_SLOW*0.7'));
    equal(`(X==='me' ? G.shuntT : X.shuntT) > 0`,true);
  });

  test(tag + ' takes a lane by destroying what is in it, and cannot be barged out',()=>{
    /* Flann barging out: the other car is destroyed rather than shoved. */
    duel(kind);
    run(`globalThis.outcome = bumpTarget(asVictim(X), 1, F);`);
    equal('outcome','rammed');
    equal('xo.dead > 0',true);equal('xo.lane',1);    /* destroyed, not moved across */
    equal('fo.dead',0);equal('fo.ultOn',true);
    equal(`F==='me' ? G.slowT : F.slow`,0);
    /* Somebody barging in: the barger is destroyed and Flann keeps its lane. */
    duel(kind);
    run(`globalThis.outcome = bumpTarget(asVictim(F), 1, X);`);
    equal('outcome','stopped');
    equal('fo.lane',1);equal('fo.dead',0);equal('fo.ultOn',true);
    equal('xo.dead > 0',true);
    /* And through the real lane-change entry points, which must not go on to
       move a car they have just wrecked into the lane it was reaching for. */
    duel(kind);
    run(`xo.lane = 0; xo.x = laneCX(0); fo.lane = 1; fo.x = laneCX(1);
         ${kind === 'player' ? 'rivalLaneTo(X, 1)' : 'move(1)'};`);
    equal('xo.dead > 0',true);
    equal('xo.lane',0);                              /* the lane change died with it */
    equal('fo.lane',1);
    equal('fo.dead',0);equal('fo.ultOn',true);
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
  for(const car of ['flann','bolt']){
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

/* The other four keep the ultimate they always had. */
for(const car of ['bolt','timestamp','rose','siren'])
  test(car + ' gains no collision or hazard power from its ultimate',()=>{
    run(`G.local=false;G.car=${JSON.stringify(car)};G.rules=defaultRules();
         G.rules.bots=1;G.rules.bubbles=false;G.mode='endless';startRace();
         G.state='running';G.nextTrap=1e9;G.nextRow=1e9;G.traps=[];
         G.dead=0;G.invuln=0;G.slowT=0;G.blind=0;G.lane=1;
         globalThis.rvl=G.rivals[0];rvl.car=${JSON.stringify(car)};rvl.dead=0;rvl.invuln=0;
         rvl.slow=0;rvl.blind=0;rvl.shuntT=0;rvl.bumpCD=0;rvl.changeT=1e6;rvl.lane=1;
         rvl.x=G.x;rvl.y=playerY-carH*0.4;
         G.ult=1;startUlt('me');rvl.ult=1;startUlt(rvl);`);
    equal('flannUltActive("me")',false);equal('flannUltActive(rvl)',false);
    /* tumbleweed still slows it */
    weedOn('"me"');run(`updateTraps(0,0,'running');`);
    equal('G.slowT > 0',true);equal('G.traps.length',0);
    /* meteor still wrecks it - and the rival beside it, which is the ordinary
       blast rule and is why both are put back on the road below */
    blastOn('"me"');run(`updateTraps(0,0,'running');`);
    equal('G.dead > 0',true);equal('rvl.dead > 0',true);
    /* puddle still blinds it */
    run(`G.dead=0;G.invuln=0;G.slowT=0;G.ult=1;startUlt('me');
         rvl.dead=0;rvl.invuln=0;rvl.slow=0;rvl.ult=1;startUlt(rvl);
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
    /* Firing Neela's ultimate whites its own view out for a moment, and that
       is the ordinary Obscured Condition rather than a badge of its own - so
       it shows up here, derived from the whiteout timer and not from `blind`.
       Run it off, and the rest of this is the shared path every car takes. */
    if(car === 'neela'){
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
  run(`G.local = false; G.car = ${nSide === 'me' ? '"neela"' : '"bolt"'};
       G.rules = defaultRules(); G.rules.bots = 5; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); clearTimers();
       G.state = 'running'; G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       G.tilt = 0; G.whiteT = 0; G.morphT = 0; G.swapGuard = 0;
       G.rivals.forEach((r, i) => {
         r.car = "bolt"; r.human = false; r.dead = 0; r.invuln = 0;
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
  equal('G.whiteT',run('NEELA_WHITEOUT'));
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
    equal('ramWinner(N, V)',null);
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

console.log(`\n${checks} ultimate regression checks passed (DOM/Canvas doubles; no physical controller or visual QA).`);
