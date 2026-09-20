#!/usr/bin/env node
/* Dhaval/Cleansed integration through real collision and update paths. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f=fixture(), {run}=f; f.boot();
run('cv.getBoundingClientRect=()=>({width:400,height:800,left:0,top:0});');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('  ok  Dhaval: '+name);};
const eq=(code,value)=>assert.equal(run(code),value,code);
function setup(kind='player',car='flann'){
 run(`G.local=false;G.players=1;G.mode='endless';G.car='${car}';G.rules=defaultRules();G.rules.bots=1;
  G.rules.bubbles=false;G.rules.boost=false;startRace();clearTimers();G.state='running';G.nextTrap=G.nextRow=1e9;
  globalThis.R=G.rivals[0];R.car='${car}';R.human=${kind==='local'};R.changeT=1e9;
  placeRivalAtY(R,playerY-2000);R.x=laneCX(0);R.lane=R.dodgeLane=0;
  globalThis.who=${kind==='player'?'"me"':'R'};globalThis.o=who==='me'?G:who;
  globalThis.source=who==='me'?R:'me';globalThis.src=source==='me'?G:source;
  src.car='dhaval';src.ult=1;startUlt(source);`);
}
function collide(kind){
 run(`globalThis.hx=o.x;globalThis.hy=racerY(who);G.traps=[${kind==='weed'?"{kind:'weed',x:hx,y:hy,r:25,vx:0,fall:1,age:0,rot:0,hit:0,nm:0}":kind==='meteor'?"{kind:'meteor',x:hx,y:hy,r:80,mr:18,fall:0,max:1,phase:0,t:0}":"{kind:'puddle',x:hx,y:hy,rx:80,ry:50,s:.5,hit:0,nm:0}"}];
  ${kind==='meteor'?"updateTraps(0,0,'running');":"if(who==='me')updateTraps(0,0,'running');else updateRival(o,0,'running');"}`);
}
test('eight distinct identities and correct full-field bot counts for 1–4 humans',()=>{
 eq('CAR_IDS.length',8);eq('CAR_IDS[7]','dhaval');eq('FIELD_SIZE',8);
 for(let n=1;n<=4;n++){
  run(`G.local=${n>1};G.players=${n};G.picks=CAR_IDS.slice(0,${n});G.car=G.picks[0];G.rules=defaultRules();startRace();clearTimers();`);
  eq('G.rivals.length',7);eq('G.rivals.filter(r=>!r.human).length',8-n);
  eq('new Set([G.car,...G.rivals.map(r=>r.car)]).size',8);
 }
});
for(const kind of ['player','bot','local']){
 test(kind+' aura eligibility, radius, refresh, tail and new episode',()=>{
  setup(kind);run('dhavalAuras();');eq('dhavalObscured(who)',false);
  run('placeRivalAtY(R,playerY);dhavalAuras();');eq('dhavalObscureLevel(who)',1);eq('dhavalObscured(source)',false);
  run('increaseDhavalObscure(who);tickDhavalConditions(who,1);dhavalAuras();');eq('o.dhavalObscureT',3);eq('dhavalObscureLevel(who)',2);
  run('placeRivalAtY(R,playerY-dhavalRange()-.01);tickDhavalConditions(who,3);dhavalAuras();');eq('o.dhavalObscureLevel',0);
  run('placeRivalAtY(R,playerY);dhavalAuras();');eq('dhavalObscureLevel(who)',1);
  for(const state of ['o.dead=1','o.finished=1','o.invuln=1']){
   setup(kind);run(`placeRivalAtY(R,playerY);${state};dhavalAuras();`);eq('dhavalObscured(who)',false);
  }
 });
 test(kind+' genuine contacts escalate once, shields count, misses/spent hazards do not',()=>{
  setup(kind);run('applyDhavalObscure(who,source);');
  for(let level=2;level<=5;level++){
   collide('puddle');eq('dhavalObscureLevel(who)',level);eq('o.shield',7-level);
   run("if(who==='me')updateTraps(0,0,'running');else updateRival(o,0,'running');");eq('dhavalObscureLevel(who)',level);
  }
  collide('weed');eq('dhavalObscureLevel(who)',5);
  run('clearDhavalObscure(who);');eq('o.dhavalObscureLevel',0);
  setup(kind);run('applyDhavalObscure(who,source);');collide('puddle');run('G.traps[0].hit=0;G.traps[0].x=-1000;');
  run("if(who==='me')updateTraps(0,0,'running');else updateRival(o,0,'running');");eq('dhavalObscureLevel(who)',2);
 });
 for(const car of ['rhosyn','verdant'])test(kind+' '+car+' clears on activation and refuses new aura',()=>{
  setup(kind,car);run('applyDhavalObscure(who,source);');eq('dhavalObscureLevel(who)',1);
  run('o.ult=1;startUlt(who);');eq('dhavalObscured(who)',false);
  eq('applyDhavalObscure(who,source)',false);eq('noContact(who)',car==='rhosyn');
  run('endUlt(who);');if(car==='rhosyn')run('tickAeroGlow(who,2);');eq('dhavalObscured(who)',false);
 });
 test(kind+' ulting Lolanthe converts aura into a refreshed three-second cleanse',()=>{
  setup(kind,'lolanthe');run('applyDhavalObscure(who,source);o.blind=2;o.mindT=2;if(who===\'me\'){o.slowT=2;o.slipT=2;}else{o.slow=2;o.slip=2;}o.ult=1;startUlt(who);applyDhavalObscure(who,source);');
  eq('o.ultOn',true);eq('o.cleanseT',3);eq('dhavalObscured(who)',false);eq('controlsLocked(who)',false);eq('o.blind',0);
  eq("who==='me'?o.slowT:o.slow",0);eq("who==='me'?o.slipT:o.slip",0);
  run('tickDhavalConditions(who,1);applyDhavalObscure(who,source);');eq('o.cleanseT',3);
 });
 test(kind+' Cleansed clears and refuses all debuffs but still loses shields and can wreck',()=>{
  setup(kind);run(`applyDhavalObscure(who,source);increaseDhavalObscure(who);o.blind=2;applyMindControl(who);
   if(who==='me'){o.slowT=2;o.slipT=2;}else{o.slow=2;o.slip=2;}applyCleansed(who);`);
  eq('o.dhavalObscureLevel',0);eq('o.blind',0);eq('controlsLocked(who)',false);eq('noContact(who)',false);
  eq("who==='me'?o.slowT:o.slow",0);eq("who==='me'?o.slipT:o.slip",0);
  eq('applyMindControl(who)',false);eq('applyDhavalObscure(who,source)',false);
  collide('weed');eq('o.shield',5);eq("who==='me'?o.slowT:o.slow",0);
  collide('puddle');eq('o.shield',4);eq('o.blind',0);
  run("G.slicks=[{x:o.x,y:racerY(who),r:100,s:.5,life:10,fade:0,owner:source}];updateSlicks(0,0,'running');");eq("who==='me'?o.slipT:o.slip",0);
  run('tickDhavalConditions(who,3);');eq('cleansedWho(who)',false);eq('applyDhavalObscure(who,source)',true);
  run('applyCleansed(who);');collide('meteor');eq('o.dead',3);eq('o.cleanseT',0);eq('o.dhavalObscureLevel',0);
 });
 for(const hazard of ['weed','puddle','meteor'])test(kind+' Dhaval destroys '+hazard+' with no penalty, shield loss or severity increase',()=>{
  setup(kind,'dhaval');run('applyDhavalObscure(who,source);o.ult=1;startUlt(who);');collide(hazard);
  eq('G.traps.length',0);eq('o.dead',0);eq('o.blind',0);eq("who==='me'?o.slowT:o.slow",0);
  eq('o.ultOn',true);eq('o.ultT',15);eq('o.ult',1);eq('o.shield',6);eq('dhavalObscureLevel(who)',1);
 });
 test(kind+' lifecycle expiry, wreck and fresh race clean state',()=>{
  setup(kind,'dhaval');run('o.ult=1;startUlt(who);tickUlt(who,15);');eq('o.ultOn',false);
  run('applyDhavalObscure(who,source);wreckRacer(who);');eq('o.dhavalObscureLevel',0);eq('o.dhavalObscureT',0);
  run('startRace();');eq('[G,...G.rivals].every(o=>o.dhavalObscureT===0&&o.dhavalObscureLevel===0&&o.cleanseT===0)',true);
 });
}
test('canonical condition list merges water and lights, includes Cleansed as a distinct buff',()=>{
 setup();run('G.blind=2;applyDhavalObscure("me",R);');eq('activeConditions("me").filter(c=>c==="obscured").length',1);
 run('clearDhavalObscure("me");');eq('G.blind',2);run('applyCleansed("me");');eq('CONDITIONS.cleansed.type','buff');
 eq('activeConditions("me").includes("cleansed")',true);eq('CONDITIONS.cleansed.icon!==CONDITIONS.invulnerable.icon',true);
 run('G.finished=8;');eq('activeConditions("me").length',0);
});
test('AI sight and hazard lookahead decrease monotonically without changing pace',()=>{
 setup('bot');run('applyDhavalObscure(R,"me");G.traps=[{kind:"weed",x:R.x,y:R.y-220,r:20}];');
 let previous=1;const pace=run('racerPace(R)');
 for(let l=1;l<=5;l++){run(`R.dhavalObscureLevel=${l};`);const sight=run('botSight(R)');assert.ok(sight<previous);previous=sight;eq('racerPace(R)',pace);}
 eq('laneRisk(R)[R.lane]',0);run('R.dhavalObscureLevel=1;');eq('laneRisk(R)[R.lane]',1);
});
test('Dhaval bot values eligible clusters and hazards, never immune targets or ulting Lolanthe',()=>{
 setup('bot','dhaval');run('G.ultOn=false;G.car="flann";placeRivalAtY(R,playerY);globalThis.s=botSense(R);');
 const one=run('botUltExtra(R,s)');assert.ok(one>0);
 run('s.all.push({...s.all[0]});');assert.ok(run('botUltExtra(R,s)')>one);
 run('G.traps=[{kind:"weed",x:G.x,y:playerY-100}];');assert.ok(run('botUltExtra(R,s)')>one);
 for(const car of ['rhosyn','verdant','lolanthe']){
  run(`G.car='${car}';G.ultOn=true;s=botSense(R);`);eq('botUltExtra(R,s)',0);
 }
 run('G.car="flann";G.ultOn=false;G.cleanseT=2;s=botSense(R);');eq('botUltExtra(R,s)',0);
});
test('all levels use large palette lights with nested density and deterministic reduced motion',()=>{
 setup();run('applyDhavalObscure("me",R);');
 for(let l=1;l<=5;l++){
  run(`G.dhavalObscureLevel=${l};`);const before=run('JSON.stringify(G)');
  const a=run(`JSON.stringify(dhavalLight('me',0,${l},390,844,true))`);
  run('G.dhavalObscureAge=100;');eq(`JSON.stringify(dhavalLight('me',0,${l},390,844,true))`,a);
  run('G.dhavalObscureAge=0;');eq('JSON.stringify(G)',before);
  if(l>1){eq(`DHAVAL_LIGHT_LEVELS[${l-1}].count>DHAVAL_LIGHT_LEVELS[${l-2}].count`,true);eq(`dhavalLight('me',0,${l},390,844,true).r>dhavalLight('me',0,${l-1},390,844,true).r`,true);}
 }
 eq('DHAVAL_LIGHT_COLORS.join(",")','#FFFFFF,#AE4BE8,#F32946,#3FDC78');
 const before=run('JSON.stringify(G)');run('drawDhavalObscurity("me");drawDhavalObscurity("me");');eq('JSON.stringify(G)',before);
});
test('overlay ownership for 1–4 views, every seat, and bots, with no render mutation',()=>{
 for(let n=1;n<=4;n++)for(let seat=0;seat<n;seat++){
  run(`G.local=${n>1};G.players=${n};G.picks=CAR_IDS.slice(0,${n});G.car=G.picks[0];G.rules=defaultRules();startRace();clearTimers();G.state='running';G.shake=0;
   globalThis.victim=${seat===0?'"me"':`G.humans[${seat}]`};applyDhavalObscure(victim,{});
   globalThis.drawn=[];globalThis.originalOverlay=drawDhavalObscurity;
   drawDhavalObscurity=function(who){if(dhavalObscured(who))drawn.push(who);originalOverlay(who);};`);
  const before=run('JSON.stringify(G)');run('render();');eq('JSON.stringify(G)',before);eq('drawn.length',1);eq('drawn[0]===victim',true);
  run('drawDhavalObscurity=originalOverlay;');
 }
 setup();run('applyDhavalObscure(R,"me");globalThis.drawn=[];globalThis.originalOverlay=drawDhavalObscurity;drawDhavalObscurity=function(w){if(dhavalObscured(w))drawn.push(w);};render();drawDhavalObscurity=originalOverlay;');eq('drawn.length',0);
});
test('pixel-sampled opacity grows through five levels, with comparable reduced-motion coverage',()=>{
 setup();run('applyDhavalObscure("me",R);');
 for(const [width,height] of [[390,844],[200,844],[700,844],[844,390]]){
  const coverage=[];
  for(const reduced of [false,true]){
   const means=[];
   for(let level=1;level<=5;level++){
    let total=0;
    for(const time of [0,3,7,11]){
     run(`G.dhavalObscureAge=${time};`);
     const lights=JSON.parse(run(`JSON.stringify(Array.from({length:DHAVAL_LIGHT_LEVELS[${level-1}].count},(_,i)=>dhavalLight('me',i,${level},${width},${height},${reduced})))`));
     for(let y=0;y<80;y++)for(let x=0;x<40;x++){
      let visible=1;
      for(const p of lights){
       const d=Math.hypot((x+.5)*width/40-p.x,(y+.5)*height/80-p.y);
       const alpha=p.r>0?p.alpha*Math.max(0,Math.min(1,(1-d/p.r)/.098)):0;
       visible*=1-alpha;
      }
      total+=1-visible;
     }
    }
    means.push(total/(4*80*40));
   }
   for(let l=1;l<5;l++)assert.ok(means[l]>means[l-1]+.08,`${width}×${height}: level ${l+1} visibly denser`);
   assert.ok(means[0]>.13&&means[0]<.25,`level 1 remains open: ${means[0]}`);
   assert.ok(means[4]>.82&&means[4]<.98,`level 5 barely visible: ${means[4]}`);
   coverage.push(means);
  }
  for(let l=0;l<5;l++)assert.ok(Math.abs(coverage[0][l]-coverage[1][l])<.08,'reduced motion retains coverage');
 }
});
test('Cleansed still allows rear contact and barge displacement without Slow',()=>{
 setup();run(`placeRivalAtY(R,playerY);R.ultOn=false;R.car='flann';G.lane=1;G.x=laneCX(1);R.lane=0;R.x=laneCX(0);
  applyCleansed('me');globalThis.victim={me:true,obj:null,lane:1,y:playerY};bumpTarget(victim,1,R);`);
 eq('G.lane',2);eq('G.slowT',0);eq('G.dead',0);eq('noContact("me")',false);
 run('victim.lane=2;bumpTarget(victim,1,R);');eq('G.dead',3);
});
console.log(`\n${checks} Dhaval checks passed.`);
