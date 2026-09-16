#!/usr/bin/env node
/* Sprite lifecycle and geometry checks against the actual shared renderer.
   No decoder needed: rendering calls record transforms and plume roots. */
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
const f = fixture(), {run, ctx} = f;
let checks=0, calls=[], matrix=[1,0,0,1,0,0], stack=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const point=(x,y)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
ctx.save=()=>stack.push(matrix.slice());
ctx.restore=()=>{matrix=stack.pop();};
ctx.setTransform=(...m)=>{matrix=m;};
ctx.translate=(x,y)=>{[matrix[4],matrix[5]]=point(x,y);};
ctx.rotate=a=>{const [a0,b,c,d,e,g]=matrix,s=Math.sin(a),co=Math.cos(a);matrix=[a0*co+c*s,b*co+d*s,c*co-a0*s,d*co-b*s,e,g];};
ctx.drawImage=(image,x,y,w,h)=>calls.push({type:'image',image,x,y,w,h,m:matrix.slice()});
ctx.createLinearGradient=(x,y,x2,y2)=>{calls.push({type:'plume',root:point(x,y),tip:point(x2,y2),x,y});return {addColorStop(){}};};
function test(name,fn){fn();checks++;console.log('  ok  '+name);}
function draw(boost=true,tilt=0,w=60,h=111.6){
  calls=[];matrix=[1,0,0,1,0,0];stack=[];
  run(`drawCar(140,220,${w},${h},CARS.flann,${tilt},true,${boost});`);
  assert.equal(stack.length,0);assert.deepEqual(matrix,[1,0,0,1,0,0]);
  return calls;
}
function images(){return calls.filter(c=>c.type==='image');}
function plumes(){return calls.filter(c=>c.type==='plume');}
test('one cached image, exact case, unloaded and failed assets safely skip drawing',()=>{
  assert.equal(f.images.length,1);assert.equal(f.images[0].src,'v_flann.PNG');
  draw();assert.equal(calls.length,0);f.images[0].complete=true;draw();assert.equal(calls.length,0);
});
test('late load schedules a menu repaint through the common renderer',()=>{
  f.frames.length=0;f.images[0].load();assert.equal(f.frames.length,1);
  calls=[];f.frames.shift()();assert.ok(images().length>=2);assert.equal(plumes().length,0);
});
test('the full image keeps aspect ratio and centres its visible bounds',()=>{
  draw(false);assert.equal(images().length,1);assert.equal(plumes().length,0);
  const d=images()[0];near(d.w/d.h,1024/1536);
  near(d.x+d.w*(512/1024),0);near(d.y+d.h*(740.5/1536),0);
  assert.ok(d.x<0 && d.y<0);near(d.h*1337/1536,111.6);
});
test('both plumes share image anchors, tilt and scale with no canvas transform leak',()=>{
  for(const size of [22,60,130])for(const tilt of [-0.19,0,0.19]){
    draw(true,tilt,size,size*1.86);const d=images()[0],p=plumes();assert.equal(p.length,2);
    assert.ok(calls.indexOf(p[1])<calls.indexOf(d));
    for(const [i,px] of [355,669].entries()){
      const x=d.x+d.w*px/1024,y=d.y+d.h*1377/1536;
      near(p[i].root[0],d.m[0]*x+d.m[2]*y+d.m[4]);
      near(p[i].root[1],d.m[1]*x+d.m[3]*y+d.m[5]);
      assert.ok(p[i].tip[1]>p[i].root[1]);
    }
  }
});
test('animation keeps roots pinned, repeats deterministically and varies continuously',()=>{
  run('motionPref="full";');f.setNow(1000);const a=structuredClone(plumesFromDraw());
  f.setNow(1001);const b=draw().filter(c=>c.type==='plume');
  for(let i=0;i<2;i++){assert.deepEqual(a[i].root,b[i].root);assert.ok(Math.abs(a[i].tip[1]-b[i].tip[1])<0.1);}
  f.setNow(1000);assert.deepEqual(plumesFromDraw(),a);
});
function plumesFromDraw(){return draw().filter(c=>c.type==='plume');}
test('reduced motion is static and switching boost off removes every plume',()=>{
  run('motionPref="reduced";');f.setNow(100);const a=structuredClone(plumesFromDraw());
  f.setNow(5700);assert.deepEqual(plumesFromDraw(),a);draw(false);assert.equal(plumes().length,0);
});
test('rendering never changes race state or allocates additional images',()=>{
  const before=run('JSON.stringify(G)');for(let i=0;i<100;i++){f.setNow(i*16);draw();}
  assert.equal(run('JSON.stringify(G)'),before);assert.equal(f.images.length,1);
});
f.boot();
run('G.local=false;G.car="flann";G.mode="endless";G.rules=defaultRules();startRace();clearTimers();G.state="running";');
test('ordinary boost, ultimate, player blink and rival sprite use existing visual flags',()=>{
  run('G.invuln=0;G.boosting=true;');calls=[];run('render();');assert.equal(images().length,1);assert.equal(plumes().length,2);
  run('G.boosting=false;G.ult=1;startUlt("me");');calls=[];run('render();');assert.equal(plumes().length,2);
  run('G.invuln=2;');calls=[];run('render();');assert.equal(images().length,0);assert.equal(plumes().length,0);
  run('G.invuln=0;endUlt("me");G.car="phantom";G.rivals[0].car="flann";G.rivals[0].y=playerY-150;G.rivals[0].invuln=0;G.rivals[0].boosting=true;');
  calls=[];run('render();');assert.equal(images().length,1);assert.equal(plumes().length,2);
});
test('two, three and four local columns render the same Flann image and exhaust',()=>{
  for(const seats of [2,3,4]){
    run(`G.local=true;G.players=${seats};G.picks=CAR_IDS.slice(0,${seats});G.car=G.picks[0];G.rules=defaultRules();startRace();clearTimers();G.state="running";G.invuln=0;G.boosting=true;`);
    calls=[];run('render();');assert.equal(images().length,seats);assert.equal(plumes().length,2*seats);
    assert.equal(run('G.rivals.length'),5);
  }
});
test('three minutes of Endless preserve the full racer field and running lifecycle',()=>{
  run('G.local=false;G.car="flann";G.mode="endless";G.rules=defaultRules();startRace();clearTimers();G.state="running";for(let i=0;i<10800;i++)update(1/60);');
  assert.equal(run('G.state'),'running');assert.equal(run('G.rivals.length'),5);assert.ok(run('G.meters')>0);
});
console.log(`\n${checks} sprite checks passed (Canvas/Image doubles; browser visuals separate).`);
