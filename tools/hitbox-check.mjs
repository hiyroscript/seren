#!/usr/bin/env node
/* Contact boundary regressions; no browser or image decoder dependency. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f=fixture(),{run}=f;
let checks=0;
function test(name,fn){fn();checks++;console.log('  ok  '+name);}
function eq(code,value){assert.equal(run(code),value,code);}
function near(code,value){assert.ok(Math.abs(run(code)-value)<1e-7,code);}
f.boot();
run('G.local=false;G.mode="endless";G.car="flann";G.rules=defaultRules();startRace();clearTimers();G.state="running";carW=100;carH=186;G.x=200;playerY=300;G.tilt=0;');
test('Flann body excludes transparent nose corners, shadow and rear plumes',()=>{
  eq('insideHitPolygon(carHit().points,G.x,playerY)',true);
  eq('insideHitPolygon(carHit().points,G.x+39,playerY-76)',false);
  eq('insideHitPolygon(carHit().points,G.x+50,playerY)',false);
  eq('insideHitPolygon(carHit().points,G.x,playerY+100)',false);
  eq('insideHitPolygon(carHit().points,G.x+20,playerY-75)',true);
});
test('Flann hit geometry exists before its image loads',()=>{
  assert.equal(f.images[0].complete,false);eq('carHit().points.length',8);
  const before=run('JSON.stringify(carHit())');f.images[0].load();
  assert.equal(run('JSON.stringify(carHit())'),before);
});
test('nearest-point distance detects exact side contact and a tiny separation',()=>{
  run('G.car="phantom";G.tilt=0;');
  near('nearestOnCar(carHit(),250,300).x',240);
  near('nearestOnCar(carHit(),250,300).y',300);
  eq('insideHitPolygon(carHit().points,240,300)',true);
  eq('insideHitPolygon(carHit().points,240.001,300)',false);
});
test('rotated hitboxes follow rendered tilt instead of a larger bounding box',()=>{
  run('G.tilt=Math.PI/4;');
  near('nearestOnCar(carHit(),G.x+50*Math.cos(G.tilt),playerY+50*Math.sin(G.tilt)).x',200+40/Math.sqrt(2));
  near('nearestOnCar(carHit(),G.x+50*Math.cos(G.tilt),playerY+50*Math.sin(G.tilt)).y',300+40/Math.sqrt(2));
  eq('insideHitPolygon(carHit().points,G.x+80,playerY+70)',false);
});
test('polygon contact handles edge touch, crossing edges and complete containment',()=>{
  run('globalThis.ha=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];');
  eq('hitPolygonsOverlap(ha,ha.map(p=>({x:p.x+10,y:p.y})))',true);
  eq('hitPolygonsOverlap(ha,ha.map(p=>({x:p.x+10.001,y:p.y})))',false);
  eq('hitPolygonsOverlap(ha,[{x:2,y:2},{x:3,y:2},{x:3,y:3},{x:2,y:3}])',true);
  eq('hitPolygonsOverlap(ha,[{x:4,y:-5},{x:6,y:-5},{x:6,y:15},{x:4,y:15}])',true);
});
test('player and rival use identical body geometry at the same position',()=>{
  for(const car of ['flann','phantom','bolt','timestamp','rose','siren']){
    run(`G.car="${car}";Object.assign(G.rivals[0],{car:G.car,x:G.x,y:playerY,tilt:G.tilt});`);
    eq('JSON.stringify(carHit())===JSON.stringify(carHit(G.rivals[0]))',true);
  }
});
test('DPR and view offsets never affect world-space contact',()=>{
  const before=run('JSON.stringify(carHit())');run('DPR=3;CAMDY=700;VOWN=G.rivals[0];');
  assert.equal(run('JSON.stringify(carHit())'),before);
});
test('rear contact rejects shared lane labels with physically separated cars',()=>{
  run('G.car="flann";G.tilt=0;G.lane=1;G.rivals.forEach(r=>{r.dead=0;r.invuln=0;r.finished=null;r.y=playerY+1000;});Object.assign(G.rivals[0],{car:"flann",lane:1,x:G.x+150,y:playerY-120,tilt:0});');
  eq('rearContact("me")',null);
});
test('rear contact follows overlapping bodies during a lane transition',()=>{
  run('G.rivals[0].lane=2;G.rivals[0].x=G.x;');
  eq('rearContact("me").obj===G.rivals[0]',true);
  run('G.rivals[0].y=playerY-186*0.84-0.01;');eq('rearContact("me")',null);
});
test('barge queries still project into the requested lane',()=>{
  run('G.x=laneCX(0);G.lane=0;Object.assign(G.rivals[0],{lane:1,x:laneCX(1),y:playerY});');
  eq('carAt(1,playerY,"me").obj===G.rivals[0]',true);
});
test('finish, wreck and invulnerability protections still exclude contact',()=>{
  run('G.rivals[0].y=playerY-100;G.x=G.rivals[0].x;');
  for(const [key,value] of [['invuln',2],['dead',2],['finished',1]]){
    run(`G.rivals[0].${key}=${value};`);eq('rearContact("me")',null);
    run(`G.rivals[0].${key}=${key==='finished'?'null':0};`);
  }
});
test('rotated oil rejects empty bounding-box corners and accepts body overlap',()=>{
  run('G.car="phantom";G.x=200;playerY=300;G.tilt=Math.PI/4;globalThis.hs={x:280,y:370,rx:3,ry:3,rot:0.6,jit:0.1,s:0.3};');
  eq('slickHits(hs,carHit())',false);run('hs.x=G.x;hs.y=playerY;');eq('slickHits(hs,carHit())',true);
});
test('puddle collision follows the smoothed outline and supports swept positions',()=>{
  run('G.tilt=0;globalThis.hp={x:G.x,y:playerY+1000,rx:40,ry:20,s:0.4};');
  eq('puddleHits(hp,carHit())',false);
  eq('puddleHits(hp,carHit(),playerY)',true);
  run('hp.x=G.x+1000;');eq('puddleHits(hp,carHit(),playerY)',false);
});
console.log(`\n${checks} hitbox checks passed.`);
