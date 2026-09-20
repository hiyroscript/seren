#!/usr/bin/env node
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f=fixture(),{run}=f; f.boot(); f.$('[data-lang="en"]').click();
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('  ok  Cole: '+name);};
const eq=(code,value)=>assert.equal(run(code),value,code);
const near=(code,value)=>assert.ok(Math.abs(run(code)-value)<1e-8,code);
function setup(kind='player'){
  run(`G.local=false;G.players=1;G.mode='endless';G.car='cole';G.rules=defaultRules();
    G.rules.bots=1;G.rules.traps=false;G.rules.bubbles=false;startRace();clearTimers();G.state='running';
    globalThis.R=G.rivals[0];R.car='cole';R.human=${kind==='local'};R.changeT=1e6;
    R.m=-10000;globalThis.who=${kind==='player'?'"me"':'R'};globalThis.o=who==='me'?G:who;`);
}
test('seventh identity and full local fields',()=>{
  eq('CAR_IDS.join(",")','flann,neela,lolanthe,verdant,rhosyn,saffron,cole');eq('FIELD_SIZE',7);
  for(const n of [1,2,3,4]){
    run(`G.local=${n>1};G.players=${n};G.picks=CAR_IDS.slice(0,${n});G.car=G.picks[0];G.rules=defaultRules();startRace();`);
    eq('G.rivals.length+1',7);eq('G.rivals.filter(r=>!r.human).length',7-n);
    eq('new Set([G.car,...G.rivals.map(r=>r.car)]).size',7);
  }
});
for(const kind of ['player','bot','local']){
 test(kind+' switches both ways, preserves pose/boost/ultimate and uses shared flashes',()=>{
  setup(kind);eq('o.coleBike',false);eq('o.coleSwitchT',0);
  run(`o.boosting=true;o.ult=1;startUlt(who);globalThis.pose=JSON.stringify(racerWorldPose(who));
    globalThis.charge=o.charge;globalThis.clock=o.ultT;`);
  eq('switchColeForm(who)',true);eq('racerModel(who).sprite','vtm_cole.PNG');eq('o.coleSwitchT',2);
  eq('o.whiteT',run('WHITEOUT_TIME'));eq('o.morphT',run('MORPH_TIME'));
  eq('JSON.stringify(racerWorldPose(who))',run('pose'));eq('o.charge',run('charge'));eq('o.ultT',run('clock'));eq('o.boosting',true);
  for(let i=0;i<30;i++)eq('switchColeForm(who)',false);
  eq('o.coleSwitchT',2);run('tickCole(who,1.999);');eq('canColeSwitch(who)',false);
  run('tickCole(who,.0011);');eq('switchColeForm(who)',true);eq('racerModel(who).sprite','v_cole.PNG');eq('o.ultT',15);
 });
 test(kind+' gate rejects locked, wrecked, finished, countdown and paused requests',()=>{
  for(const state of ["G.state='countdown'","G.state='paused'","o.dead=1","o.finished=7","o.mindT=1","o.car='flann'"]){
    setup(kind);run(state);eq('switchColeForm(who)',false);eq('o.coleBike',false);eq('o.coleSwitchT',0);
  }
 });
 test(kind+' cooldown freezes on pause and form survives actual wreck/respawn',()=>{
  setup(kind);run(`switchColeForm(who);G.state='paused';update(1);`);eq('o.coleSwitchT',2);
  run(`G.state='running';update(.5);`);near('o.coleSwitchT',1.5);
  run('wreckRacer(who);');eq('o.coleBike',true);eq('o.dead>0',true);
  run('for(let i=0;i<65;i++)update(.05);');eq('o.dead',0);eq('o.coleBike',true);eq('o.coleSwitchT',0);
  run('startRace();');eq('G.coleBike',false);eq('G.rivals.every(r=>!r.coleBike && r.coleSwitchT===0)',true);
 });
 test(kind+' exact pace stacking with tier, boost, ultimate, Slow, can and shunt',()=>{
  setup(kind);
  for(const bike of [false,true])for(const boost of [false,true])for(const ult of [false,true])for(const debuff of [false,true]){
    run(`o.coleBike=${bike};o.boosting=${boost};o.ultOn=${ult};G.tier=3;
      o.slow=o.slowT=${debuff?2:0};o.canT=o.shuntT=${debuff?2:0};`);
    const expected=run('BASE_SPEED*speedMult()')*(bike?1.5:1)*(boost?(bike?1.8:1.5):1)*(ult?(bike?2.3:2):1)*(debuff?.5*run('CAN_SPEED*SHUNT_BOOST'):1);
    near('racerPace(who)',expected);
  }
  run('o.boosting=false;o.ultOn=false;o.canT=o.shuntT=o.slowT=o.slow=0;o.coleBike=true;');
  eq('conditionOn(who,"boosted")',false);
 });
 test(kind+' toggling during boost and ultimate changes the smoothed target without resetting either',()=>{
  setup(kind);run(`o.human=true;o.boosting=true;o.wantBoost=true;G.keyBoost=true;o.ult=1;startUlt(who);
    globalThis.carPace=racerPace(who);switchColeForm(who);globalThis.bikePace=racerPace(who);
    if(who==='me')G.speed=carPace;else o.abs=carPace;update(.01);`);
  near('bikePace/carPace',1.5*1.8*2.3/(1.5*2));
  const speed=run("who==='me'?G.speed:o.abs");assert.ok(speed>run('carPace')&&speed<run('bikePace'));
  eq('o.boosting',true);near('o.ultT',14.99);
 });
}
test('both forms retain normal puddles and combat while the ultimate clears only solid hazards',()=>{
 for(const kind of ['player','bot','local'])for(const bike of [false,true])for(const hazard of ['puddle','weed','meteor']){
  setup(kind);run(`o.coleBike=${bike};o.ult=1;startUlt(who);globalThis.x=o.x;globalThis.y=who==='me'?playerY:o.y;`);
  run(hazard==='puddle'?`G.traps=[{kind:'puddle',x,y,rx:80,ry:50,s:.5,hit:0,nm:0}];`:
      hazard==='weed'?`G.traps=[{kind:'weed',x,y,r:25,vx:0,fall:1,age:0,rot:0,hit:0,nm:0}];`:
      `G.traps=[{kind:'meteor',x,y,r:80,mr:18,fall:0,max:1,phase:0,t:0}];`);
  run(hazard==='meteor'||kind==='player'?`updateTraps(0,0,'running');`:`updateRival(o,0,'running');`);
  eq('o.dead',0);eq('invulnerableWho(who)',false);eq('flannUltActive(who)',false);
  if(hazard==='puddle'){eq('o.blind',run('BLIND_TIME'));eq('G.traps.length',1);}
  if(hazard==='weed')eq('G.traps.length',0);
  run('applyMindControl(who);');eq('controlsLocked(who)',true);eq('switchColeForm(who)',false);
 }
});
test('crossing the actual finish line preserves motorcycle form and forbids switching',()=>{
 for(const kind of ['player','bot','local']){
  setup(kind);run(`o.coleBike=true;G.finishAt=100;G.mode='bots';if(who==='me')G.meters=101;else o.m=101;checkFinish();`);
  eq('o.finished',1);eq('o.coleBike',true);eq('racerModel(who).sprite','vtm_cole.PNG');eq('switchColeForm(who)',false);
 }
});
test('bots use the shared switch after the opening reaction, human seats stay in control',()=>{
 setup('bot');run('R.changeT=.1;update(.05);');eq('R.coleBike',false);run('update(.06);');eq('R.coleBike',true);eq('R.coleSwitchT',2);eq('R.whiteT',run('WHITEOUT_TIME'));
 setup('local');run('R.changeT=0;update(.1);');eq('R.coleBike',false);
});
test('HUD, keyboard and controller all obey the same cooldown; held inputs do not retrigger',()=>{
 setup();run('show("race");paintHUD(true);');f.click('coleSwitch');eq('G.coleBike',true);eq('G.coleSwitchT',2);
 f.document.dispatch('keydown',{key:'q',target:f.$('#cv')});eq('G.coleBike',true);eq('G.coleSwitchT',2);
 const pad={index:0,connected:true,buttons:[],axes:[0,0,0,0]};f.pads[0]=pad;pad.buttons[4]={pressed:true,value:1};
 run('G.pad=0;G.padId=null;padPoll();padDrive("me",.01);');eq('G.coleBike',true);eq('G.coleSwitchT',2);
 run('tickCole("me",2);padDrive("me",.01);');eq('G.coleBike',true);
 pad.buttons[4]={pressed:false};run('padPoll();padDrive("me",0);');pad.buttons[4]={pressed:true};run('padPoll();padDrive("me",0);');eq('G.coleBike',false);
 run('tickCole("me",2);');f.document.dispatch('keydown',{key:'q',repeat:true,target:f.$('#cv')});eq('G.coleBike',false);
 f.document.dispatch('keydown',{key:'q',repeat:false,target:f.$('#cv')});eq('G.coleBike',true);
});
test('every local seat can transform through L1 with isolated whiteout',()=>{
 for(let i=0;i<4;i++)f.pads[i]={index:i,connected:true,buttons:[],axes:[0,0,0,0]};
 for(let seat=0;seat<4;seat++){
  run(`G.local=true;G.players=4;G.picks=['flann','neela','lolanthe','verdant'];G.picks[${seat}]='cole';G.car=G.picks[0];G.rules=defaultRules();G.padIds=[0,1,2,3];startRace();G.state='running';padPoll();`);
  f.pads[seat].buttons[4]={pressed:true};run(`padPoll();padDrive(G.humans[${seat}],0);`);
  eq(`coleBikeActive(G.humans[${seat}])`,true);eq('G.humans.filter(whiteoutActive).length',1);
  f.pads[seat].buttons[4]={pressed:false};
 }
});
test('button localization, visibility, rules, disabled state and per-view occupied width',()=>{
 setup();
 for(const lang of ['en','fr']){
  run(`chooseLang('${lang}');`);
  for(const bubbles of [false,true])for(const ults of [false,true]){
    run(`G.rules.bubbles=${bubbles};G.rules.ults=${ults};paintHUD(true);`);
    eq('$("#coleSwitch").style.display','');eq('$("#coleSwitch").disabled',false);
    eq('hudActionCount(G)',1+Number(bubbles)+Number(ults));
    assert.match(run('$("#coleSwitch").getAttribute("aria-label")'),/Cole/);
    for(const width of [200,250,390,700])run(`W=${width};VOWN='me';G.local=true;globalThis.z=hudZones();
      if(hudSide()+hudShieldWidth(G)+8 > z.actsLeft+1e-8)throw Error('shield/action overlap');`);
  }
 }
 run('G.local=false;G.state="countdown";paintHUD(true);');eq('$("#coleSwitch").disabled',true);eq('$("#coleSwitch").getAttribute("aria-disabled")','true');
 run('G.state="running";switchColeForm("me");paintHUD(true);');eq('$("#coleSwitchTime").textContent','2.0');
 run('tickCole("me",2);paintHUD(true);');eq('$("#coleSwitch").disabled',false);
 run('G.car="flann";G.rules=defaultRules();paintHUD(true);');eq('$("#coleSwitch").style.display','none');eq('hudActionWidth(G)',120);
});
test('seven starting hulls never overlap across selected cars and view sizes',()=>{
 for(const car of run('CAR_IDS'))for(const width of [200,390,900]){
  run(`G.local=false;G.car='${car}';G.rules=defaultRules();startRace();W=${width};H=844;layout();spawnRivals();
    globalThis.all=['me',...G.rivals];`);
  for(let i=0;i<7;i++)for(let j=i+1;j<7;j++)eq(`hitPolygonsOverlap(carHit(all[${i}]).points,carHit(all[${j}]).points)`,false);
 }
});
test('all seven parking marks are distinct, clear, ordered and framed in every finisher view',()=>{
 for(const width of [200,390,900]){
  run(`G.local=false;G.car='cole';G.rules=defaultRules();startRace();W=${width};H=844;layout();spawnRivals();G.finishAt=1000;
    G.coleBike=true;G.parkRot=0;globalThis.all=['me',...G.rivals];
    all.forEach((who,i)=>{const o=who==='me'?G:who;o.finished=i+1;o.lane=parkLaneFor(i+1);o.x=laneCX(o.lane);o.tilt=0;
      if(who==='me')G.meters=parkMeters(i+1);else o.m=o.parkM=parkMeters(i+1);});`);
  eq('new Set(all.map((w,i)=>parkMeters(i+1))).size',7);
  for(let i=0;i<7;i++){
    for(let j=i+1;j<7;j++)eq(`hitPolygonsOverlap(carHit(all[${i}]).points,carHit(all[${j}]).points)`,false);
    eq(`all.every(w=>carHit(w).points.every(p=>p.y+camDy(all[${i}])>0 && p.y+camDy(all[${i}])<H))`,true);
  }
  run('paintHUD(true);');eq('$("#posRow7").style.display','');eq('placeWord(7)',run('t("place7")'));
 }
});
console.log(`\n${checks} Cole checks passed.`);
