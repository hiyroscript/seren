#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
import {fixture} from './game-fixture.mjs';
const f=fixture(),{run}=f; f.boot(); f.$('[data-lang="en"]').click();
run('cv.getBoundingClientRect=()=>({width:390,height:844,left:0,top:0});');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('  ok  Aureolin: '+name);};
const eq=(code,value)=>assert.equal(run(code),value,code);
const near=(code,value,epsilon=1e-8)=>assert.ok(Math.abs(run(code)-value)<epsilon,`${code}: ${run(code)} != ${value}`);
function setup(kind='player'){
 run(`G.local=false;G.players=1;G.mode='endless';G.car='aureolin';G.rules=defaultRules();
 G.rules.bots=2;G.rules.traps=false;G.rules.bubbles=false;startRace();clearTimers();G.state='running';
 globalThis.R=G.rivals[0];globalThis.T=G.rivals[1];
 R.car='aureolin';R.human=${kind==='local'};R.changeT=1e6;R.m=-1000;T.m=-2000;T.changeT=1e6;
 globalThis.who=${kind==='player'?'"me"':'R'};globalThis.o=who==='me'?G:who;
 G.traps=[];G.slicks=[];G.boxes=[];G.nextTrap=G.nextRow=1e9;show('race');`);
}
function target(car='cole'){
 run(`T.car='${car}';T.invuln=0;T.dead=0;T.finished=null;T.x=o.x;T.tilt=0;T.m=metersOf(who)+20;`);
}
function bullet(){run('fireAureolinBullet(who);globalThis.p=G.aureolinBullets.at(-1);');}
for(const kind of ['player','bot','local']){
 test(kind+' form, cooldown, whiteout, pose preservation and all permission gates',()=>{
  setup(kind);eq('racerModel(who).sprite','v_aureolin.PNG');
  run(`o.aureolinHeat=.4;o.charge=.7;o.shield=4;o.boosting=true;o.ult=1;startUlt(who);
   o.aureolinHeat=.4;globalThis.pose=JSON.stringify(racerWorldPose(who));globalThis.clock=o.ultT;`);
  eq('switchVehicleForm(who)',true);eq('racerModel(who).sprite','vtm_aureolin.PNG');
  eq('o.aureolinSwitchT',2);eq('o.whiteT',run('WHITEOUT_TIME'));eq('o.morphT',run('MORPH_TIME'));
  eq('JSON.stringify(racerWorldPose(who))',run('pose'));eq('o.charge',.7);eq('o.shield',4);eq('o.aureolinHeat',.4);eq('o.ultT',run('clock'));eq('o.boosting',true);
  eq('switchVehicleForm(who)',false);run('tickAureolin(who,1.999);');eq('canVehicleSwitch(who)',false);
  run('tickAureolin(who,.001);');eq('switchVehicleForm(who)',true);
  for(const gate of ["G.state='paused'","G.state='countdown'","o.dead=1","o.finished=9","o.mindT=1"]){
   setup(kind);run(gate);eq('switchVehicleForm(who)',false);eq('fireAureolinBullet(who)',false);eq('fireAureolinRockets(who)',false);
  }
 });
 test(kind+' selected form survives wreck and finish; new race clears all state',()=>{
  setup(kind);run('switchVehicleForm(who);o.aureolinSlows=[1,1.5];o.wantFire=true;wreckRacer(who);');
  eq('o.aureolinArmed',true);eq('o.aureolinSlows.length',0);eq('o.wantFire',false);
  run('for(let i=0;i<65;i++)update(.05);');eq('o.dead',0);eq('o.aureolinArmed',true);
  run('o.invuln=0;G.finishAt=100;if(who==="me")G.meters=101;else o.m=101;checkFinish();');
  eq('o.finished !== null',true);eq('switchVehicleForm(who)',false);eq('o.aureolinArmed',true);
  run('startRace();');eq('G.aureolinArmed',false);eq('G.aureolinHeat',1);eq('G.aureolinBullets.length+G.aureolinRockets.length',0);
  eq('[G,...G.rivals].every(r=>!r.aureolinArmed && r.aureolinHeat===1 && !r.aureolinOverheated && !r.aureolinFireT && !r.aureolinRocketT && !r.aureolinSwitchT && !r.aureolinSlows.length)',true);
 });
 test(kind+' rapid cadence, sixty-shot capacity, full-recharge latch and voluntary release',()=>{
  for(const fps of [20,30,60,144]){
   setup(kind);run(`switchVehicleForm(who);o.wantFire=true;for(let i=0;i<${fps*4};i++)tickAureolin(who,1/${fps});`);
   eq('G.aureolinBullets.length',60);eq('o.aureolinHeat',0);eq('o.aureolinOverheated',true);
   run('tickAureolin(who,1.75);');near('o.aureolinHeat',.5);eq('fireAureolinBullet(who)',false);
   run('tickAureolin(who,1.749);');eq('fireAureolinBullet(who)',false);run('tickAureolin(who,.001);');eq('o.aureolinHeat',1);eq('o.aureolinOverheated',false);eq('fireAureolinBullet(who)',true);
  }
  setup(kind);run('switchVehicleForm(who);o.wantFire=true;tickAureolin(who,1);o.wantFire=false;tickAureolin(who,.5);');
  eq('G.aureolinBullets.length',15);eq('o.aureolinOverheated',false);near('o.aureolinHeat',.75+.5/3.5);eq('fireAureolinBullet(who)',true);
 });
 test(kind+' normal form cannot fire, ultimate refills/auto-fires, and Mind Control cancels every route',()=>{
  setup(kind);target();run('o.aureolinHeat=0;o.aureolinOverheated=true;startUlt(who);');
  eq('o.aureolinHeat',1);eq('o.aureolinOverheated',false);run('tickAureolin(who,1);');eq('G.aureolinBullets.length+G.aureolinRockets.length',0);
  run('switchVehicleForm(who);tickAureolin(who,1);');eq('G.aureolinBullets.length',15);eq('G.aureolinRockets.length',2);eq('o.aureolinHeat',1);
  run('o.wantFire=o.keyFire=o.ptrFire=o.padFire=true;applyMindControl(who);');eq('o.wantFire||o.keyFire||o.ptrFire||o.padFire',false);
  run('tickAureolin(who,1);botAureolinWeapons(R);');eq('G.aureolinBullets.length',15);eq('G.aureolinRockets.length',2);
  run('endUlt(who);');eq('o.aureolinHeat',1);
 });
 test(kind+' exact independent slows compose with generic pace and clear on cleanse',()=>{
  setup(kind);run('switchVehicleForm(who);');bullet();target();
  run('T.coleBike=true;T.boosting=true;T.slow=1;T.canT=T.shuntT=1;T.ultOn=true;globalThis.pace=racerPace(T);hitAureolinRacer(p,T);');
  near('racerPace(T)/pace',.9);eq('conditionOn(T,"slowed")',true);
  run('tickAureolinSlows(T,.5);hitAureolinRacer(p,T);');near('racerPace(T)/pace',.8);
  run('tickAureolinSlows(T,1);');eq('T.aureolinSlows.length',1);near('T.aureolinSlows[0]',.5);
  run('for(let i=0;i<20;i++)hitAureolinRacer(p,T);');eq('racerPace(T)',0);
  run('clearDebuffs(T);');eq('T.aureolinSlows.length',0);eq('conditionOn(T,"slowed")',false);
  run('T.cleanseT=1;hitAureolinRacer(p,T);');eq('T.aureolinSlows.length',0);
  run('T.cleanseT=0;hitAureolinRacer(p,"me");');eq('G.aureolinSlows.length',kind==='player'?0:1);
 });
}
test('ninth identity and full fields for one to four human seats',()=>{
 eq('CAR_IDS[8]','aureolin');eq('CAR_IDS.length',9);eq('FIELD_SIZE',9);
 for(let n=1;n<=4;n++){
  run(`G.local=${n>1};G.players=${n};G.picks=['aureolin',...CAR_IDS.filter(c=>c!=='aureolin')].slice(0,${n});G.car=G.picks[0];G.rules=defaultRules();startRace();`);
  eq('G.rivals.length',8);eq('G.rivals.filter(r=>!r.human).length',9-n);eq('new Set([G.car,...G.rivals.map(r=>r.car)]).size',9);
 }
});
test('source PNG dimensions, measured bounds, independent hulls, uniform size and tilt',()=>{
 for(const file of ['v_aureolin.PNG','vtm_aureolin.PNG','vp_aureolinb.PNG','vp_aureolinr.PNG']){
  const png=fs.readFileSync(new URL('../'+file,import.meta.url));
  assert.equal(png.readUInt32BE(16),file.startsWith('vp_')?1254:1024);
  assert.equal(png.readUInt32BE(20),file.startsWith('vp_')?1254:1536);
  f.images.find(i=>i.src===file).load(png.readUInt32BE(16),png.readUInt32BE(20));
 }
 setup();
 for(const armed of [false,true])for(const width of [200,390,900])for(const tilt of [-.3,0,.3]){
  run(`W=${width};H=844;layout();G.aureolinArmed=${armed};G.tilt=${tilt};globalThis.model=racerModel('me');globalThis.dim=racerDims('me');globalThis.fr=spriteFrame(model,dim.w,dim.h);`);
  near('fr.sw/fr.sh',1024/1536);eq('fr.vw/carW > 1 && fr.vw/carW < 1.2',true);
  eq('model.hitShape!==CAR_HIT_RECT && model.hitShape!==CARS.cole.hitShape',true);
  for(const [px,py,hit] of [[512,300,true],[512,1100,true],[150,70,false],[850,70,false],[10,750,false]]){
   run(`globalThis.point=modelAnchorWorld('me',[${px}/1024,${py}/1536]);`);
   eq('insideHitPolygon(carHit().points,point.x,point.y)',hit);
  }
  run(`R.aureolinArmed=${armed};R.tilt=G.tilt;`);
  eq('JSON.stringify(carHit("me",100,200))',run('JSON.stringify(carHit(R,100,200))'));
 }
 eq('JSON.stringify(CARS.aureolin.hitShape)!==JSON.stringify(CARS.aureolin.altForm.hitShape)',true);
});
test('bullet and paired rockets originate exactly at their artwork anchors at every tilt/size',()=>{
 setup();target();run('switchVehicleForm(who);startUlt(who);');
 for(const width of [200,390,900])for(const tilt of [-.3,0,.3]){
  run(`W=${width};layout();G.tilt=${tilt};G.aureolinBullets=[];G.aureolinRockets=[];G.aureolinRocketT=0;fireAureolinBullet(who);fireAureolinRockets(who);
  globalThis.model=racerModel(who);globalThis.dim=racerDims(who);globalThis.fr=spriteFrame(model,dim.w,dim.h);`);
  const anchors=[[509,498],[161,963],[858,963]];
  anchors.forEach(([x,y],i)=>{
   run(`globalThis.a=spriteAnchor(fr,[${x}/1024,${y}/1536]);globalThis.p=${i===0?'G.aureolinBullets[0]':`G.aureolinRockets[${i-1}]`};`);
   near('p.x',run('G.x+a.x*Math.cos(G.tilt)-a.y*Math.sin(G.tilt)'));
   near('p.y',run('playerY+a.x*Math.sin(G.tilt)+a.y*Math.cos(G.tilt)'));
  });
  eq('Math.hypot(G.aureolinRockets[0].x-G.aureolinRockets[1].x,G.aureolinRockets[0].y-G.aureolinRockets[1].y)>racerDims(who).w*.7',true);
 }
});
test('range is launch-fixed, exactly doubled in ultimate, finite and independent of scrolling',()=>{
 setup();run('switchVehicleForm(who);');bullet();run('globalThis.range=p.range;startUlt(who);');eq('p.range',run('range'));bullet();near('p.range/range',2);
 run('endUlt(who);switchVehicleForm(who);G.meters+=500;');eq('p.range',run('range*2'));
 run('updateAureolinProjectiles(2);');eq('G.aureolinBullets.length',0);
});
test('rocket pairs, cooldown, dynamic progress priority, protection and forward-only expiry',()=>{
 setup();target();run('switchVehicleForm(who);startUlt(who);');eq('fireAureolinRockets(who)',true);eq('G.aureolinRockets.length',2);eq('o.aureolinHeat',1);
 eq('fireAureolinRockets(who)',false);run('tickAureolin(who,1.999);');eq('G.aureolinRockets.length',2);run('tickAureolin(who,.001);');eq('G.aureolinRockets.length',4);
 eq('aureolinTarget(who,"rocket")===T',true);run('R.car="cole";R.m=10;');eq('aureolinTarget(who,"rocket")===R',true);
 run('updateAureolinProjectiles(.001);');eq('G.aureolinRockets.every(p=>p.target===R)',true);
 run('R.m=30;updateAureolinProjectiles(.001);');eq('G.aureolinRockets.every(p=>p.target===T)',true);
 run('T.car="rhosyn";startUlt(T);');eq('aureolinTarget(who,"rocket")===R',true);
 for(const protectedState of ['R.invuln=1','R.dead=1','R.finished=1','R.m=-1']){
  run(`R.invuln=R.dead=0;R.finished=null;R.m=30;${protectedState};`);eq('aureolinTarget(who,"rocket")',null);
 }
 run('for(let i=0;i<100;i++)updateAureolinProjectiles(.05);');eq('G.aureolinRockets.length',0);eq('T.shield',6);
});
test('both rockets deal one half-unit each through ordinary ultimates and use shared wrecks',()=>{
 for(const car of ['cole','neela','lolanthe','dhaval','aureolin','saffron']){
  setup();target(car);run('switchVehicleForm(who);startUlt(who);startUlt(T);fireAureolinRockets(who);globalThis.p=G.aureolinRockets[0];');
  eq('hitAureolinRacer(p,T)',true);eq('T.shield',5);eq('hitAureolinRacer(G.aureolinRockets[1],T)',true);eq('T.shield',4);
  run('T.shield=1;hitAureolinRacer(p,T);');eq('T.shield',0);eq('T.dead>0',true);
 }
});
test('Flann absorbs, Verdant reveals only, Rhosyn is unreachable, Saffron escapes bullets',()=>{
 for(const car of ['flann','verdant','rhosyn','saffron'])for(const kind of ['bullet','rocket']){
  setup();target(car);run('switchVehicleForm(who);startUlt(who);startUlt(T);fireAureolinBullet(who);fireAureolinRockets(who);');
  if(car==='rhosyn'&&kind==='rocket')run('globalThis.p={owner:who,kind:"rocket",x:T.x,m:T.m,get y(){return parkY(this.m)}};');
  else run(`globalThis.p=${kind==='bullet'?'G.aureolinBullets[0]':'G.aureolinRockets[0]'};`);
  eq('hitAureolinRacer(p,T)',car!=='rhosyn' && !(car==='saffron'&&kind==='bullet'));
  eq('T.aureolinSlows.length',0);eq('T.shield',car==='saffron'&&kind==='rocket'?5:6);eq('T.ultOn',true);
  if(car==='verdant')eq('T.verdantRevealT',run('VERDANT_REVEAL'));
 }
});
test('swept fast bullets hit actual tilted hulls, miss transparent corners and never hit owner',()=>{
 for(const tilt of [-.28,0,.28])for(const width of [200,390,900]){
  setup();run(`W=${width};layout();switchVehicleForm(who);T.tilt=${tilt};`);target('aureolin');run(`T.tilt=${tilt};`);bullet();
  run('p.range=1e6;p.speed=1e5;updateAureolinProjectiles(.01);');eq('T.aureolinSlows.length',1);eq('G.aureolinBullets.length',0);eq('G.aureolinSlows.length',0);
  bullet();run('p.x=T.x+racerDims(T).w*.7;p.range=1e6;p.speed=1e5;updateAureolinProjectiles(.01);');eq('T.aureolinSlows.length',1);
 }
});
test('hazard sweeps destroy weed, physical meteor and oil, leaving puddles and pickups untouched',()=>{
 for(const kind of ['bullet','rocket'])for(const hazard of ['weed','meteor','oil','puddle']){
  setup();target();run('switchVehicleForm(who);startUlt(who);fireAureolinBullet(who);fireAureolinRockets(who);');
  run(`globalThis.p=${kind==='bullet'?'G.aureolinBullets[0]':'G.aureolinRockets[0]'};
   G.aureolinBullets=${kind==='bullet'?'[p]':'[]'};G.aureolinRockets=${kind==='rocket'?'[p]':'[]'};
   R.m=T.m=-1000;p.range=1e6;p.speed=1e5;globalThis.x=p.x;globalThis.y=p.y-100;
   G.boxes=[{x,y}];`);
  if(hazard==='oil')run('G.slicks=[{x,y,rx:15,ry:25,rot:.2,s:.5,jit:.2}];');
  else run(`G.traps=[${hazard==='weed'?"{kind:'weed',x,y,r:20}":hazard==='meteor'?"{kind:'meteor',x,y,mr:20,fall:0,max:1,phase:0}":"{kind:'puddle',x,y,rx:30,ry:20,s:.5,hit:0}"}];`);
  run('updateAureolinProjectiles(.01);');eq('G.boxes.length',1);eq('G.blind',0);
  eq('G.traps.length+G.slicks.length',hazard==='puddle'?1:0);
  eq('G.aureolinBullets.length+G.aureolinRockets.length',hazard==='puddle'?1:0);
 }
});
test('both forms clear solid ultimate hazards but retain puddle effects',()=>{
 for(const armed of [false,true])for(const kind of ['player','bot','local'])for(const hazard of ['weed','meteor','puddle']){
  setup(kind);run(`o.aureolinArmed=${armed};startUlt(who);globalThis.x=o.x;globalThis.y=racerY(who);`);
  run(`G.traps=[${hazard==='weed'?"{kind:'weed',x,y,r:25,vx:0,fall:1,age:0,rot:0,hit:0,nm:0}":hazard==='meteor'?"{kind:'meteor',x,y,r:80,mr:18,fall:0,max:1,phase:0,t:0}":"{kind:'puddle',x,y,rx:80,ry:50,s:.5,hit:0,nm:0}"}];`);
  run(hazard==='meteor'||kind==='player'?"updateTraps(0,0,'running');":"updateRival(o,0,'running');");
  eq('o.dead',0);if(hazard==='puddle'){eq('o.blind',run('BLIND_TIME'));eq('G.traps.length',1);}else if(hazard==='weed')eq('G.traps.length',0);
 }
});
test('mobile gestures distinguish fire, boost, steering and taps; release and cancel stop fire',()=>{
 const cv=f.$('#cv');setup();run('switchVehicleForm(who);');
 const down=()=>cv.dispatch('pointerdown',{pointerId:1,clientX:100,clientY:100});
 down();cv.dispatch('pointermove',{pointerId:1,clientX:102,clientY:150});eq('G.ptrFire',true);eq('G.ptrBoost',false);cv.dispatch('pointerup',{pointerId:1});eq('G.ptrFire',false);eq('G.lastTap',-9);
 down();cv.dispatch('pointermove',{pointerId:1,clientX:102,clientY:50});eq('G.ptrBoost',true);eq('G.ptrFire',false);cv.dispatch('pointerup',{pointerId:1});eq('G.ptrBoost',false);
 down();cv.dispatch('pointermove',{pointerId:1,clientX:155,clientY:105});eq('G.lane',2);eq('G.ptrFire',false);cv.dispatch('pointercancel',{pointerId:1});
 down();cv.dispatch('pointerup',{pointerId:1});eq('G.lastTap',0);down();cv.dispatch('pointerup',{pointerId:1});eq('G.lastTap',-9);
 down();cv.dispatch('pointermove',{pointerId:1,clientX:100,clientY:150});cv.dispatch('pointercancel',{pointerId:1});eq('G.ptrFire',false);
});
test('keyboard and every local pad seat use shared form/fire gates and fresh releases after control',()=>{
 setup();f.document.dispatch('keydown',{key:'q',target:f.$('#cv')});eq('G.aureolinArmed',true);
 f.document.dispatch('keydown',{key:'s',target:f.$('#cv')});eq('G.keyFire',true);f.document.dispatch('keyup',{key:'s'});eq('G.keyFire',false);
 f.document.dispatch('keydown',{key:'ArrowDown',target:f.$('#cv')});run('applyMindControl("me");');eq('G.keyFire',false);run('G.mindT=0;');
 f.document.dispatch('keydown',{key:'ArrowDown',repeat:true,target:f.$('#cv')});eq('G.keyFire',false);f.document.dispatch('keyup',{key:'ArrowDown'});f.document.dispatch('keydown',{key:'ArrowDown',target:f.$('#cv')});eq('G.keyFire',true);
 for(let i=0;i<4;i++)f.pads[i]={index:i,connected:true,buttons:[],axes:[0,0,0,0]};
 for(let seat=0;seat<4;seat++){
  run(`G.local=true;G.players=4;G.picks=['flann','neela','cole','dhaval'];G.picks[${seat}]='aureolin';G.car=G.picks[0];G.rules=defaultRules();G.padIds=[0,1,2,3];startRace();G.state='running';`);
  f.pads[seat].buttons[4]={pressed:true};f.pads[seat].axes[3]=1;run(`padPoll();padDrive(G.humans[${seat}],0);padDrive(G.humans[${seat}],0);globalThis.o=G.humans[${seat}]==='me'?G:G.humans[${seat}];`);
  eq('o.aureolinArmed',true);eq('o.padFire||o.wantFire',true);eq('G.humans.filter(whiteoutActive).length',1);
  f.pads[seat].axes[3]=0;f.pads[seat].buttons[4]={pressed:false};run(`padPoll();padDrive(G.humans[${seat}],0);`);eq('o.padFire||o.wantFire',false);
  f.pads[seat].buttons[13]={pressed:true};run(`padPoll();padDrive(G.humans[${seat}],0);`);eq('o.padFire||o.wantFire',true);f.pads[seat].buttons[13]={pressed:false};
 }
});
test('AI deliberately arms and fires at plausible targets without changing physical rules',()=>{
 setup('bot');target();run('R.changeT=0;botAureolinWeapons(R);');eq('R.aureolinArmed',true);eq('R.wantFire',true);
 run('R.aureolinOverheated=true;R.aureolinHeat=.3;tickAureolin(R,.1);');eq('G.aureolinBullets.length',0);
 run('applyMindControl(R);botAureolinWeapons(R);');eq('R.wantFire',false);
 setup('local');target();run('R.changeT=0;botAureolinWeapons(R);');eq('R.aureolinArmed',false);
});
test('pause freezes all new timers and projectiles; changing form/ending ult preserves in-flight objects',()=>{
 setup();target();run('switchVehicleForm(who);startUlt(who);fireAureolinBullet(who);fireAureolinRockets(who);G.aureolinSlows=[1];G.aureolinHeat=.5;G.state="paused";globalThis.snapshot=JSON.stringify([G.aureolinBullets,G.aureolinRockets,G.aureolinHeat,G.aureolinSwitchT,G.aureolinRocketT,G.aureolinSlows]);update(1);');
 eq('JSON.stringify([G.aureolinBullets,G.aureolinRockets,G.aureolinHeat,G.aureolinSwitchT,G.aureolinRocketT,G.aureolinSlows])',run('snapshot'));
 run('G.state="running";endUlt(who);G.aureolinSwitchT=0;switchVehicleForm(who);');eq('G.aureolinBullets.length',1);eq('G.aureolinRockets.length',2);
 eq('fireAureolinBullet(who)',false);run('leave();');eq('G.aureolinBullets.length+G.aureolinRockets.length',0);
});
test('nine starting polygons never overlap for any selected racer or representative viewport',()=>{
 for(const car of run('CAR_IDS'))for(const [width,height] of [[200,844],[390,844],[900,844],[844,390]]){
  run(`G.local=false;G.car='${car}';G.rules=defaultRules();startRace();W=${width};H=${height};layout();spawnRivals();globalThis.all=['me',...G.rivals];`);
  for(let i=0;i<9;i++)for(let j=i+1;j<9;j++)eq(`hitPolygonsOverlap(carHit(all[${i}]).points,carHit(all[${j}]).points)`,false);
 }
});
test('EN/FR selection, garage, ninth standings, meter accessibility and narrow local HUD geometry',()=>{
 for(const lang of ['en','fr']){
  setup();run(`chooseLang('${lang}');paintHUD(true);garageTab='cars';buildGarage();`);
  assert.ok(f.$('#carAureolin'));assert.ok(f.$('#posRow9'));assert.ok(f.$('#garageBody').innerHTML.includes('data-car="aureolin"'));
  for(const key of ['aureolin','aureolinUlt','hudAureolinSwitch','aureolinNormal','aureolinArmed','weaponHeat','weaponOverheated','place9'])eq(`STR.${key}.${lang}.length>0`,true);
  eq('placeWord(9)',lang==='en'?'9th':'9e');assert.match(f.$('#coleSwitch').getAttribute('aria-label'),/Aureolin/);
  for(const boost of [false,true])for(const bubbles of [false,true])for(const ults of [false,true]){
   run(`G.rules.boost=${boost};G.rules.bubbles=${bubbles};G.rules.ults=${ults};G.aureolinHeat=.25;G.aureolinOverheated=true;paintHUD(true);`);
   eq('$("#weaponWrap").style.display','');eq('$("#meterRail").style.display','');eq('$("#weaponWrap").getAttribute("role")','meter');eq('$("#weaponWrap").getAttribute("aria-valuenow")','25');eq('$("#weaponWrap").getAttribute("aria-valuetext")',run('t("weaponOverheated")'));
   for(const width of [180,200,250,390,700]){
    run(`W=${width};H=844;G.local=true;VOWN='me';globalThis.z=hudZones();hudMeters(G);hudActions(G);hudShield(G);`);
    eq('hudSide()+hudShieldWidth(G)+8<=z.actsLeft+1e-8',true);eq('z.readBottom<z.actsTop',true);
    eq('HUD_SHIELD_BOT+hudMeterExtra(G)>HUD_RAIL_BOT+HUD_RAIL_H+hudMeterExtra(G)',true);
   }
  }
  run('G.car="flann";paintHUD(true);');eq('$("#weaponWrap").style.display','none');eq('hudMeterExtra(G)',0);
 }
});
test('both physical homing rockets reach road and airborne targets, never splash at expiration',()=>{
 for(const car of ['cole','saffron'])for(const tilt of [-.25,.25]){
  setup();target(car);run(`switchVehicleForm(who);startUlt(who);G.tilt=${tilt};T.m=35;T.x=G.x+20;
   if(T.car==='saffron'){startUlt(T);tickSaffron(T,1);}fireAureolinRockets(who);
   for(let i=0;i<300 && G.aureolinRockets.length;i++)updateAureolinProjectiles(1/60);`);
  eq('T.shield',4);eq('G.aureolinRockets.length',0);
 }
 setup();target();run('switchVehicleForm(who);startUlt(who);fireAureolinRockets(who);R.m=T.m=-1000;G.aureolinRockets.forEach(p=>{p.life=.001;});updateAureolinProjectiles(.1);');eq('T.shield',6);eq('G.aureolinRockets.length',0);
});
test('projectile draw uses each cached full PNG with uniform scale, heading and no simulation writes',()=>{
 setup();target();run('switchVehicleForm(who);startUlt(who);fireAureolinBullet(who);fireAureolinRockets(who);CT=-1e6;CB=1e6;');
 const draws=[],rotations=[];const original=f.ctx.drawImage,rotate=f.ctx.rotate;
 f.ctx.drawImage=(image,...args)=>draws.push([image.src,...args]);f.ctx.rotate=a=>rotations.push(a);
 run('globalThis.before=JSON.stringify([G.aureolinBullets,G.aureolinRockets]);drawAureolinProjectiles();');
 eq('JSON.stringify([G.aureolinBullets,G.aureolinRockets])',run('before'));
 assert.deepEqual(draws.map(d=>d[0]),['vp_aureolinb.PNG','vp_aureolinr.PNG','vp_aureolinr.PNG']);
 for(const d of draws)assert.equal(d[3],d[4],'square full PNG keeps its aspect ratio');
 assert.equal(rotations.length,3);assert.equal(f.images.length,17);
 f.ctx.drawImage=original;f.ctx.rotate=rotate;
});
test('relative sweeps also catch a fast crossing racer or moving hazard',()=>{
 setup();run('switchVehicleForm(who);');bullet();target();
 run('p.speed=0;T.m=p.m;T.x=p.x-100;globalThis.frame=aureolinFrame();T.x+=200;updateAureolinProjectiles(.05,frame);');eq('T.aureolinSlows.length',1);
 setup();run('switchVehicleForm(who);');bullet();
 run('p.speed=0;G.traps=[{kind:"weed",x:p.x-100,y:p.y,r:15}];globalThis.frame=aureolinFrame();G.traps[0].x+=200;updateAureolinProjectiles(.05,frame);');eq('G.traps.length',0);
});
test('actual projectile contacts honor special ultimates and choose the first solid contact',()=>{
 for(const kind of ['bullet','rocket'])for(const car of ['flann','verdant','rhosyn','saffron']){
  setup();target(car);run('switchVehicleForm(who);startUlt(who);startUlt(T);if(T.car==="saffron")tickSaffron(T,1);');
  run(`globalThis.p=aureolinProjectile(who,'${kind}',racerModel(who).turretMuzzle);
    p.x=T.x;p.m=G.meters+(playerY-(racerY(T)-(p.kind==='rocket'?saffronAltitude(T):0)+100))*.075;p.speed=20000;p.range=1e6;
    updateAureolinProjectiles(.01);`);
  const unreachable=car==='rhosyn'||(car==='saffron'&&kind==='bullet');
  eq('G.aureolinBullets.length+G.aureolinRockets.length',unreachable?1:0);
  eq('T.aureolinSlows.length',0);eq('T.shield',car==='saffron'&&kind==='rocket'?5:6);
 }
 setup();target();run('switchVehicleForm(who);T.m=30;R.m=10;R.car="cole";R.x=G.x;');bullet();run('p.speed=20000;p.range=1e6;updateAureolinProjectiles(.05);');eq('R.aureolinSlows.length',1);eq('T.aureolinSlows.length',0);
});

/* Decode RGBA8 source alpha without adding a build/runtime dependency. */
function pngAlpha(file){
 const data=fs.readFileSync(new URL('../'+file,import.meta.url)),chunks=[];
 const w=data.readUInt32BE(16),h=data.readUInt32BE(20);assert.equal(data[24],8);assert.equal(data[25],6);
 for(let at=8;at<data.length;){const n=data.readUInt32BE(at);if(data.toString('ascii',at+4,at+8)==='IDAT')chunks.push(data.subarray(at+8,at+8+n));at+=12+n;}
 const raw=inflateSync(Buffer.concat(chunks)),out=Buffer.alloc(w*h*4),stride=w*4;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 let pos=0;
 for(let y=0;y<h;y++){
  const filter=raw[pos++];assert.ok(filter<=4);
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=4?out[i-4]:0,b=y?out[i-stride]:0,c=y&&x>=4?out[i-stride-4]:0;
   out[i]=(raw[pos++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
  }
 }
 return {w,h,at:(x,y)=>out[(y*w+x)*4+3],bounds(cutoff){
  let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(out[(y*w+x)*4+3]>=cutoff){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  return [x0,y0,x1-x0+1,y1-y0+1];
 }};
}
test('actual alpha pixels confirm the bounds and solid body hull samples',()=>{
 const expected={
  'v_aureolin.PNG':[149,50,726,1398], 'vtm_aureolin.PNG':[120,35,781,1453],
  'vp_aureolinb.PNG':[572,82,110,1092], 'vp_aureolinr.PNG':[486,102,282,997]
 };
 for(const [file,bounds] of Object.entries(expected)){
  const png=pngAlpha(file);assert.deepEqual(png.bounds(100),bounds,file);
  if(file.startsWith('vp_'))continue;
  setup();run(`G.aureolinArmed=${file.startsWith('vtm_')};`);
  const hull=run('racerModel("me").hitShape'),k=Math.min(1/bounds[2],1.86/bounds[3]);
  for(const [u,v] of hull){
   const x=Math.round(u/k+bounds[0]+bounds[2]/2),y=Math.round(v*1.86/k+bounds[1]+bounds[3]/2);
   assert.ok(png.at(x,y)>=100,`${file}: solid hull vertex ${x},${y}`);
  }
 }
});

console.log(`\n${checks} Aureolin checks passed (shared simulation, DOM/Canvas doubles; physical hardware separate).`);
