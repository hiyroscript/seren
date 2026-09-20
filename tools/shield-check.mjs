#!/usr/bin/env node
/* Real collision and lifecycle paths with the existing dependency-free fixture. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f = fixture(), {run} = f;
f.images.forEach(image => image.load()); f.boot();
run('cv.getBoundingClientRect=()=>({width:400,height:800,left:0,top:0});');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('  ok  '+name);};
const eq=(code,value)=>assert.equal(run(code),value,code);
function setup(kind='player',car='flann'){
  run(`G.local=false;G.car=${JSON.stringify(car)};G.mode='endless';G.rules=defaultRules();
    G.rules.bots=1;G.rules.boost=false;G.rules.bubbles=false;startRace();G.state='running';
    G.nextTrap=G.nextRow=1e9;globalThis.R=G.rivals[0];R.car=G.car;R.human=${kind==='local'};
    R.changeT=1e9;R.y=playerY-2000;R.x=laneCX(0);R.lane=R.dodgeLane=0;
    globalThis.who=${kind==='player'?'"me"':'R'};globalThis.o=who==='me'?G:who;`);
}
function collide(type){
  run(`globalThis.hx=o.x;globalThis.hy=who==='me'?playerY:o.y;
    G.traps=[${type==='weed'?"{kind:'weed',x:hx,y:hy,r:25,vx:0,fall:1,age:0,rot:0,hit:0,nm:0}":type==='meteor'?"{kind:'meteor',x:hx,y:hy,r:80,mr:18,fall:0,max:1,phase:0,t:0}":"{kind:'puddle',x:hx,y:hy,rx:80,ry:50,s:0.5,hit:0,nm:0}"}];
    ${type==='meteor'?"updateTraps(0,0,'running');":"if(who==='me')updateTraps(0,0,'running');else updateRival(o,0,'running');"}`);
}
function tick(dt){run(`if(who==='me')update(${dt});else updateRival(o,${dt},'running');`);}
for(const kind of ['player','bot','local']){
  test(kind+': mixed six-hit progression, debuffs, penalties and actual respawn',()=>{
    setup(kind);run('o.ult=1;');
    const fills=[[1,1,1],[.5,1,1],[0,1,1],[0,.5,1],[0,0,1],[0,0,.5],[0,0,0]];
    for(let i=0;i<=6;i++){
      if(i)collide(i%2?'puddle':'weed');
      eq('o.shield',6-i);eq('o.dead',i===6?3:0);
      assert.deepEqual(Array.from(run('[0,1,2].map(i=>shieldBarFill(o.shield,i))')),fills[i]);
      if(i>0 && i<6)eq(i%2?'o.blind>0':"(who==='me'?o.slowT:o.slow)>0",true);
    }
    eq('o.blind',0);eq("who==='me'?o.slowT:o.slow",0);
    assert.ok(Math.abs(run('o.ult')-.65)<1e-9,'five trap penalties and one wreck penalty');
    run('G.traps=[];');tick(2.9);eq('o.shield',0);eq('o.dead>0',true);
    tick(.11);eq('o.shield',6);eq('o.invuln',run('INVULNERABLE_TIME'));
    collide('puddle');eq('o.shield',6);
  });
  test(kind+': one overlapping puddle, misses and protected contacts',()=>{
    setup(kind);collide('puddle');
    for(let i=0;i<20;i++)tick(0);
    eq('o.shield',5);
    for(const state of ['o.invuln=2','o.dead=2','o.finished=1']){
      setup(kind);run(state);collide('puddle');eq('o.shield',6);
    }
    setup(kind);collide('puddle');run('G.traps[0].hit=0;G.traps[0].x=-1000;');tick(0);eq('o.shield',5);
  });
  test(kind+': meteor and combat wrecks preserve partial durability until respawn',()=>{
    for(const source of ['meteor','combat']){
      setup(kind);run('o.shield=4;');
      if(source==='meteor')collide('meteor');else run('wreckRacer(who);');
      eq('o.dead',3);eq('o.shield',4);run('G.traps=[];');tick(3.01);eq('o.shield',6);
    }
    setup(kind);collide('meteor');eq('o.dead',3);eq('o.shield',6);
  });
  for(const car of ['flann','neela','lolanthe','verdant'])test(kind+'/'+car+': cleared hazards cost no shield',()=>{
    for(const type of ['weed','meteor']){
      setup(kind,car);run('o.ult=1;startUlt(who);');collide(type);
      eq('o.shield',6);eq('o.dead',0);if(type==='weed')eq('G.traps.length',0);
    }
  });
  test(kind+': airborne and off-road protection',()=>{
    for(const car of ['saffron','rhosyn']){
      setup(kind,car);run('o.ult=1;startUlt(who);');
      if(car==='rhosyn')run('tickAeroGlow(who,1);');
      eq('noContact(who)',true);collide('puddle');eq('o.shield',6);
    }
  });
}
test('all four local seats own independent durability and Canvas fills',()=>{
  run(`G.local=true;G.players=4;G.picks=CAR_IDS.slice(0,4);G.rules=defaultRules();startRace();G.state='running';`);
  const widths=[];const original=f.ctx.fillRect;
  f.ctx.fillRect=(x,y,w,h)=>{if(['#FF8CE1','#FFEB96','#78EBFF'].includes(f.ctx.fillStyle))widths.push(w);};
  for(let seat=0;seat<4;seat++){
    run(`globalThis.who=${seat?'G.rivals['+(seat-1)+']':'"me"'};globalThis.o=who==='me'?G:who;`);
    for(let hit=0;hit<seat;hit++)collide('puddle');
    run(`hudShield(o);`);
  }
  f.ctx.fillRect=original;
  assert.equal(widths.length,12);assert.ok(widths[0]>widths[3]);assert.equal(widths[6],0);assert.equal(widths[9],0);
  assert.ok(widths[7]>widths[10]);
  eq('G.shield',6);eq('G.rivals[0].shield',5);eq('G.rivals[1].shield',4);eq('G.rivals[2].shield',3);
  run('startRace();');eq('[G,...G.rivals].every(o=>o.shield===6)',true);
});
test('DOM fractions and localized accessible meter',()=>{
  setup();run('G.shield=3;paintShield();lang="fr";applyLang();');
  eq('$("#shieldPink").style.width','0%');eq('$("#shieldYellow").style.width','50%');eq('$("#shieldCyan").style.width','100%');
  eq('$("#shieldHud").getAttribute("aria-valuenow")','3');
  eq('$("#shieldHud").getAttribute("aria-label")','Bouclier (demi-barres restantes)');
});
test('hazards off, boost off and bubbles off keep durability and HUD stable',()=>{
  setup();run('G.rules.traps=false;G.nextTrap=0;for(let i=0;i<100;i++)update(.05);paintHUD(true);');
  eq('G.shield',6);eq('G.traps.length',0);eq('$("#shieldHud").getAttribute("aria-valuenow")','6');
});
console.log(`\n${checks} shield regression checks passed.`);
