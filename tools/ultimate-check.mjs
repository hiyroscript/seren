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
    /* Flann's ultimate is collision priority and not the Invulnerable
       Condition: it changes who loses a contact, never whether the contact
       can happen at all. So every answer above is the same for all six. */
    equal('flannUltActive(who)',car === 'flann');
  });
  test(label + ' collision priority: ' + (car === 'flann' ? 'the ram' : 'ordinary barging'),()=>{
    setup(car,kind);
    run(`globalThis.attacker = who === 'me' ? G.rivals[0] : 'me';
         globalThis.att = attacker === 'me' ? G : attacker;
         globalThis.victim = {me:who==='me',obj:who==='me'?null:o,lane:1};
         o.lane = 1;
         globalThis.outcome = bumpTarget(victim,1,attacker);`);
    if(car === 'flann'){
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
    /* The two solid hazards are Flann's to smash while its ultimate runs;
       water, oil and a guided missile are not, for anybody. */
    const smashed = car === 'flann' && (type === 'weed' || type === 'meteor');
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
   pairs with exactly one Flann in them behave differently: two ulting Flanns
   cannot smash each other, so they fall back to the ordinary shunt like
   anybody else. */
test('rear contact between every pair of ulting cars, ordinary except the ram',()=>{
  for(const car of cars) for(const rival of cars){
    const meRam = car === 'flann' && rival !== 'flann';
    const themRam = rival === 'flann' && car !== 'flann';
    setup(car,'player');run(`globalThis.r=G.rivals[0];r.car=${JSON.stringify(rival)};r.lane=G.lane;r.y=playerY-carH*0.5;startUlt(r);
      rearEnd('me',{me:false,obj:r,lane:r.lane,y:r.y});`);
    if(meRam){
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
  run(`G.local = false; G.car = ${kind === 'player' ? '"flann"' : '"phantom"'};
       G.rules = defaultRules(); G.rules.bots = 1; G.rules.boost = false;
       G.rules.bubbles = false; G.mode = 'endless'; startRace(); G.state = 'running';
       G.nextTrap = 1e9; G.nextRow = 1e9;
       G.traps = []; G.slicks = []; G.missiles = []; G.boxes = []; G.fx = [];
       G.dead = 0; G.invuln = 0; G.finished = null; G.slowT = 0; G.blind = 0;
       G.slipT = 0; G.shuntT = 0; G.bumpCD = 0; G.lane = 1; G.x = laneCX(1);
       globalThis.rvl = G.rivals[0];
       rvl.car = ${kind === 'player' ? '"phantom"' : '"flann"'}; rvl.human = ${kind === 'local'};
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
  for(const car of ['flann','phantom']){
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

/* The other five keep the ultimate they always had. */
for(const car of ['phantom','bolt','timestamp','rose','siren'])
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

console.log(`\n${checks} ultimate regression checks passed (DOM/Canvas doubles; no physical controller or visual QA).`);
