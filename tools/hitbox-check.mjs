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
/* The shared car box the hull arithmetic below is measured against. */
const carW0=100, carH0=186;
run('G.local=false;G.mode="endless";G.car="flann";G.rules=defaultRules();startRace();clearTimers();G.state="running";carW=100;carH=186;G.x=200;playerY=300;G.tilt=0;');
/* Three of the five sprite cars are drawn larger on the road than the shared
   car box, so their hulls have to come out larger by exactly the same factor.
   A big car wearing a small hitbox is the failure this guards against.

   Lolanthe and Rhosyn are in the unscaled list on purpose: both are sprite
   cars whose measured artwork already fills the box across, so neither carries
   a race scale and both must be treated exactly like Saffron here. */
test('sprite race dimensions scale by their own factors and nobody else moves',()=>{
  for(const [car,k] of [['flann',1.12],['neela',1.18],['verdant',1.10],['rhosyn',1.14],['saffron',1.25]]){
    near(`raceScale(${JSON.stringify(car)})`,k);
    near(`carDims(${JSON.stringify(car)}).w/carW`,k);
    near(`carDims(${JSON.stringify(car)}).h/carH`,k);
    near(`carDims(${JSON.stringify(car)}).h/carDims(${JSON.stringify(car)}).w`,run('carH/carW'));
  }
  for(const car of ['lolanthe']){
    eq(`raceScale(${JSON.stringify(car)})`,1);
    near(`carDims(${JSON.stringify(car)}).w`,run('carW'));
    near(`carDims(${JSON.stringify(car)}).h`,run('carH'));
  }
  /* And the racer-shaped reader agrees with the car-id one, for either kind. */
  run('G.car="flann";Object.assign(G.rivals[0],{car:"rhosyn",neelaForm:false});');
  eq('JSON.stringify(racerDims("me"))===JSON.stringify(carDims("flann"))',true);
  eq('JSON.stringify(racerDims(G.rivals[0]))===JSON.stringify(carDims("rhosyn"))',true);
});
test('the tapered eight-point hull scales with the render and stays inset',()=>{
  run('G.car="flann";G.tilt=0;');
  /* Still the measured hull, now multiplied by Flann's own race size. */
  near('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))',0.38*100*1.12);
  near('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))',0.42*186*1.12);
  eq('carHit().points.length',8);
  /* Tapered, not a rectangle: the nose is narrower than the waist. */
  eq('Math.abs(carHit().points[0].x-G.x) < Math.abs(carHit().points[3].x-G.x)',true);
  /* Inset: still well inside the artwork's own width. */
  eq('Math.abs(carHit().points[3].x-G.x) < carDims("flann").w/2',true);
  run('G.car="saffron";');
  eq('carHit().points.length',run('CARS.saffron.hitShape.length'));
  eq('carHit().points.length>4',true);
  run('G.car="flann";');
});
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
  // Explicit rectangle fixture isolates polygon maths from production artwork.
  run('CARS.geometryFixture={hitShape:CAR_HIT_RECT};G.car="geometryFixture";G.tilt=0;');
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
  run('G.car="saffron";delete CARS.geometryFixture;');
});
test('polygon contact handles edge touch, crossing edges and complete containment',()=>{
  run('globalThis.ha=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];');
  eq('hitPolygonsOverlap(ha,ha.map(p=>({x:p.x+10,y:p.y})))',true);
  eq('hitPolygonsOverlap(ha,ha.map(p=>({x:p.x+10.001,y:p.y})))',false);
  eq('hitPolygonsOverlap(ha,[{x:2,y:2},{x:3,y:2},{x:3,y:3},{x:2,y:3}])',true);
  eq('hitPolygonsOverlap(ha,[{x:4,y:-5},{x:6,y:-5},{x:6,y:15},{x:4,y:15}])',true);
});
test('player and rival use identical body geometry at the same position',()=>{
  for(const car of Array.from(run('CAR_IDS'))){
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
  /* Two Flanns separate at the sum of their two half-heights, and both of
     those are now scaled - so the clearance moved with the render rather than
     staying at the old shared car box. */
  run('G.rivals[0].y=playerY-186*0.84*1.12-0.01;');eq('rearContact("me")',null);
  run('G.rivals[0].y=playerY-186*0.84*1.12+0.5;');
  eq('rearContact("me").obj===G.rivals[0]',true);
  /* The old unscaled clearance is now firmly inside the bigger car. */
  run('G.rivals[0].y=playerY-186*0.84-0.01;');
  eq('rearContact("me").obj===G.rivals[0]',true);
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
  run('G.car="saffron";G.x=200;playerY=300;G.tilt=Math.PI/4;globalThis.hs={x:280,y:370,rx:3,ry:3,rot:0.6,jit:0.1,s:0.3};');
  eq('slickHits(hs,carHit())',false);run('hs.x=G.x;hs.y=playerY;');eq('slickHits(hs,carHit())',true);
});
test('puddle collision follows the smoothed outline and supports swept positions',()=>{
  run('G.tilt=0;globalThis.hp={x:G.x,y:playerY+1000,rx:40,ry:20,s:0.4};');
  eq('puddleHits(hp,carHit())',false);
  eq('puddleHits(hp,carHit(),playerY)',true);
  run('hp.x=G.x+1000;');eq('puddleHits(hp,carHit(),playerY)',false);
});

/* ================================================================
   NEELA  -  two measured bodies, and the switch between them
   ================================================================
   Neela is the second sprite car and the only racer that changes shape
   mid-race. Everything below is the geometry that has to follow that: the
   normal hull matches the normal artwork, the alternate hull matches the
   alternate artwork, and the swap between them happens on the frame the sprite
   swaps and not a frame later. carW/carH are still 100/186 here. */
const NW = 100*1.18, NH = 186*1.18;                 /* the normal racer box */
const AW = NW*1.09, AH = NH*1.09;                   /* and the alternate one */
function asNeela(extra){
  run(`G.car="neela";G.tilt=0;G.x=200;playerY=300;G.dead=0;G.invuln=0;
       G.finished=null;G.ultOn=false;G.neelaForm=false;${extra || ''}`);
}
test('Neela normal hull matches the measured artwork and is inset in the box',()=>{
  asNeela();
  eq('carHit().points.length',18);
  near('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))',0.378*NW);
  near('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))',0.475*NH);
  /* Inside the visible artwork rather than the PNG rectangle: v_neela's body
     is 584 of 1024 wide once the bounds are sized into the box, so the hull's
     widest point has to sit inside that and well inside the box itself. */
  eq('Math.abs(carHit().points[6].x-G.x) < carDims("neela").w*0.777/2',true);
  eq('Math.abs(carHit().points[6].x-G.x) < carDims("neela").w/2',true);
  /* Tapered like the artwork: the nose is far narrower than the rear arches. */
  eq('Math.abs(carHit().points[1].x-G.x) < Math.abs(carHit().points[6].x-G.x)',true);
});
test('Neela normal hull rejects transparent corners and accepts real body',()=>{
  asNeela();
  eq('insideHitPolygon(carHit().points,G.x,playerY)',true);                    /* the middle of it */
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*NW},playerY-${0.42*NH})`,false);  /* nose corner */
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*NW},playerY+${0.42*NH})`,false);  /* tail corner */
  eq(`insideHitPolygon(carHit().points,G.x,playerY+${0.48*NH})`,false);        /* past the tail */
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*NW},playerY+${0.25*NH})`,true);   /* rear arch */
  eq(`insideHitPolygon(carHit().points,G.x,playerY-${0.45*NH})`,true);         /* nose itself */
});
test('the alternate form swaps hull, size and shape on the frame the sprite does',()=>{
  asNeela();
  const carPoints=run('carHit().points.length');
  const carWide=run('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))');
  /* Firing the ultimate is what puts the alternate body on the road. */
  run('G.ult=1;startUlt("me");');
  eq('neelaFormActive("me")',true);
  eq('racerModel("me").sprite','vtm_neela.PNG');
  eq('carHit().points.length',20);
  assert.notEqual(run('carHit().points.length'),carPoints);
  near('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))',0.354*AW);
  near('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))',0.481*AH);
  near('racerDims("me").w',AW);
  near('racerDims("me").h',AH);
  /* And it is genuinely a different body, not the same one resized. */
  assert.notEqual(run('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))'),
                  0.475*NH);
  assert.ok(Math.abs(run('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))')-carWide)>0.5);
});
test('alternate hull follows the alternate artwork, blade and corners excluded',()=>{
  asNeela('G.ult=1;startUlt("me");');
  eq('insideHitPolygon(carHit().points,G.x,playerY)',true);
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*AW},playerY-${0.45*AH})`,false); /* nose corner */
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*AW},playerY+${0.30*AH})`,false); /* tail corner */
  /* The energy blade under the tail is a trailing edge, not a body. */
  eq(`insideHitPolygon(carHit().points,G.x,playerY+${0.40*AH})`,false);
  eq(`insideHitPolygon(carHit().points,G.x,playerY+${0.30*AH})`,true);
  /* The swept mid fins are, and they reach further out than anything else. */
  eq(`insideHitPolygon(carHit().points,G.x+${0.30*AW},playerY+${0.085*AH})`,true);
  eq(`insideHitPolygon(carHit().points,G.x-${0.30*AW},playerY+${0.085*AH})`,true);
});
test('the alternate hull rotates with the rendered tilt, exactly as the car does',()=>{
  for(const tilt of [-0.24,0,0.24]){
    asNeela(`G.ult=1;startUlt("me");G.tilt=${tilt};`);
    const alt=JSON.parse(run('JSON.stringify(carHit().points)'));
    /* Every point is the untilted point put through the same rotation. */
    run(`G.tilt=0;`);
    const flat=JSON.parse(run('JSON.stringify(carHit().points)'));
    const ca=Math.cos(tilt),sa=Math.sin(tilt),x0=run('G.x'),y0=run('playerY');
    for(let i=0;i<flat.length;i++){
      const px=flat[i].x-x0, py=flat[i].y-y0;
      assert.ok(Math.abs(alt[i].x-(x0+px*ca-py*sa))<1e-9,'tilted x');
      assert.ok(Math.abs(alt[i].y-(y0+px*sa+py*ca))<1e-9,'tilted y');
    }
  }
});
test('hull returns to the car on a racer swap and on natural expiry',()=>{
  /* A racer contact ends the form, so the hull is the car's again straight
     away - while the ultimate itself is still running. */
  run(`G.local=false;G.car="neela";G.rules=defaultRules();G.rules.bots=1;
       G.mode="endless";startRace();clearTimers();G.state="running";
       carW=100;carH=186;G.tilt=0;G.dead=0;G.invuln=0;G.lane=1;G.x=laneCX(1);
       globalThis.v=G.rivals[0];v.car="saffron";v.dead=0;v.invuln=0;v.finished=null;
       v.lane=1;v.x=G.x;v.y=playerY-carH*0.3;v.tilt=0;v.changeT=1e6;
       G.ult=1;startUlt("me");`);
  eq('carHit().points.length',20);
  run('rearEnd("me",{me:false,obj:v,lane:v.lane,y:v.y});');
  eq('G.ultOn',true);
  eq('neelaFormActive("me")',false);
  eq('carHit().points.length',18);
  eq('racerModel("me").sprite','v_neela.PNG');
  /* And on expiry, from the form, with nobody touched at all. */
  run(`startRace();clearTimers();G.state="running";carW=100;carH=186;G.tilt=0;
       G.dead=0;G.invuln=0;G.ult=1;startUlt("me");`);
  eq('carHit().points.length',20);
  run('tickUlt("me",ULT_TIME);');
  eq('G.ultOn',false);
  eq('neelaFormActive("me")',false);
  eq('carHit().points.length',18);
});
test('player and rival wear the alternate body identically',()=>{
  run(`G.local=false;G.car="neela";G.rules=defaultRules();G.rules.bots=1;
       G.mode="endless";startRace();clearTimers();G.state="running";
       carW=100;carH=186;G.tilt=0.11;G.x=200;playerY=300;
       globalThis.r=G.rivals[0];r.car="neela";r.x=G.x;r.y=playerY;r.tilt=G.tilt;
       r.dead=0;r.invuln=0;r.finished=null;
       G.ult=1;startUlt("me");r.ult=1;startUlt(r);`);
  eq('neelaFormActive("me") && neelaFormActive(r)',true);
  eq('JSON.stringify(carHit())===JSON.stringify(carHit(r))',true);
  /* One of them coming out of the form leaves the other where it was. */
  run('leaveNeelaForm(r);');
  eq('carHit().points.length',20);
  eq('carHit(r).points.length',18);
  run('endUlt("me");endUlt(r);G.tilt=0;');
});
test('alternate-form contact still meets edge touch and a tiny separation',()=>{
  run(`G.local=false;G.car="neela";G.rules=defaultRules();G.rules.bots=1;
       G.mode="endless";startRace();clearTimers();G.state="running";
       carW=100;carH=186;G.tilt=0;G.lane=1;G.x=laneCX(1);G.dead=0;G.invuln=0;
       G.rivals.forEach(r=>{r.y=playerY+9000;r.finished=null;});
       globalThis.r=G.rivals[0];r.car="saffron";r.dead=0;r.invuln=0;r.finished=null;
       r.lane=1;r.x=G.x;r.tilt=0;G.ult=1;startUlt("me");`);
  /* Nose of the alternate body to tail of a rectangle car: touching counts,
     a thousandth of a pixel clear does not. */
  const reach=run('carHit().points.map(p=>playerY-p.y).reduce((a,b)=>Math.max(a,b))');
  const theirs=run("Math.max(...CARS.saffron.hitShape.map(p=>p[1]))*carDims('saffron').h");
  run(`r.y=playerY-${reach+theirs}-0.001;`);
  eq('hitPolygonsOverlap(carHit().points,carHit(r).points)',false);
  run(`r.y=playerY-${reach+theirs}+0.001;`);
  eq('hitPolygonsOverlap(carHit().points,carHit(r).points)',true);
});
test('Neela hit geometry exists before either of its images loads',()=>{
  const fresh=fixture();fresh.boot();
  fresh.run(`G.local=false;G.mode="endless";G.car="neela";G.rules=defaultRules();
             startRace();clearTimers();G.state="running";carW=100;carH=186;
             G.x=200;playerY=300;G.tilt=0;`);
  assert.equal(fresh.images.every(i=>!i.complete),true);
  assert.equal(fresh.run('carHit().points.length'),18);
  const before=fresh.run('JSON.stringify(carHit())');
  fresh.run('G.ult=1;startUlt("me");');
  assert.equal(fresh.run('carHit().points.length'),20);
  fresh.images.forEach(i=>i.load());
  fresh.run('endUlt("me");');
  assert.equal(fresh.run('JSON.stringify(carHit())'),before);
});

/* ================================================================
   LOLANTHE AND VERDANT  -  two more measured bodies
   ================================================================
   Both are sprite cars whose geometry is measured off their own artwork, so
   these are the numbers that turn that measurement into a regression rather
   than an undocumented visual guess. None of them is Flann's or Neela's, and
   neither car is allowed to quietly fall back on the generic rectangle. */
test('Lolanthe and Verdant carry their own traced hulls, not the shared rectangle',()=>{
  run(`G.local=false;G.mode="endless";G.car="flann";G.rules=defaultRules();
       startRace();clearTimers();G.state="running";carW=100;carH=186;
       G.x=200;playerY=300;G.tilt=0;`);
  for(const car of ['lolanthe','verdant']){
    run(`G.car=${JSON.stringify(car)};`);
    /* Its own hull, out of its own CARS entry, and not the four-point box. */
    eq('carHit().points.length',24);
    eq(`CARS[${JSON.stringify(car)}].hitShape === racerModel("me").hitShape`,true);
    eq(`JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CAR_HIT_RECT)`,false);
    eq(`JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CARS.flann.hitShape)`,false);
    eq(`JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CARS.neela.hitShape)`,false);
    /* Symmetric about the car's centre line, which the artwork is. */
    eq(`CARS[${JSON.stringify(car)}].hitShape.every(function(p){
          return CARS[${JSON.stringify(car)}].hitShape.some(function(q){
            return Math.abs(q[0]+p[0])<1e-9 && Math.abs(q[1]-p[1])<1e-9; }); })`,true);
    /* Inset: never wider or longer than the body the renderer will draw. */
    const d=run(`JSON.stringify(racerDims("me"))`);
    const dim=JSON.parse(d);
    const fr=JSON.parse(run(`JSON.stringify(CARS[${JSON.stringify(car)}].spriteBounds)`));
    const bodyW=dim.w*Math.min(1,(fr[2]*1024/(fr[3]*1536))*(carH0/carW0));
    assert.ok(run('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))')
              <= bodyW/2+1e-6, car+' hull is wider than its own artwork');
    assert.ok(run('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))')
              <= dim.h/2+1e-6, car+' hull is longer than its own box');
    /* A point on the centre line is inside it and one well off the corner is not. */
    eq('insideHitPolygon(carHit().points,G.x,playerY)',true);
    eq('insideHitPolygon(carHit().points,G.x+carDims(G.car).w,playerY-carDims(G.car).h)',false);
  }
  run('G.car="flann";');
});
test('Lolanthe and Verdant hulls exist before their images load',()=>{
  const fresh=fixture();fresh.boot();
  fresh.run(`G.local=false;G.mode="endless";G.car="lolanthe";G.rules=defaultRules();
             startRace();clearTimers();G.state="running";carW=100;carH=186;
             G.x=200;playerY=300;G.tilt=0;`);
  assert.equal(fresh.images.every(i=>!i.complete),true);
  assert.equal(fresh.run('carHit().points.length'),24);
  const before=fresh.run('JSON.stringify(carHit())');
  fresh.images.forEach(i=>i.load());
  assert.equal(fresh.run('JSON.stringify(carHit())'),before);
});
test('an invisible Verdant is collided exactly as a visible one is',()=>{
  run(`G.local=false;G.car="verdant";G.rules=defaultRules();G.rules.bots=1;
       G.mode="endless";startRace();clearTimers();G.state="running";
       carW=100;carH=186;G.tilt=0;G.x=200;playerY=300;G.dead=0;G.invuln=0;`);
  const before=run('JSON.stringify(carHit())');
  run('G.ult=1;startUlt("me");tickVerdant("me",1);');
  eq('verdantUltActive("me")',true);
  eq('G.verdantHide',1);                       /* fully hidden */
  eq('noContact("me")',false);                 /* and fully present */
  assert.equal(run('JSON.stringify(carHit())'),before,'hiding moved the hitbox');
  run('endUlt("me");tickVerdant("me",1);');
  eq('G.verdantHide',0);
  assert.equal(run('JSON.stringify(carHit())'),before);
});
/* Rhosyn: current solid-nosed artwork with measured waist and rear arches. */
function rhosynSetup(tilt){
  run(`G.local=false;G.car="rhosyn";G.rules=defaultRules();G.rules.bots=1;
       G.mode="endless";startRace();clearTimers();G.state="running";
       carW=${carW0};carH=${carH0};G.x=200;playerY=300;G.tilt=${tilt || 0};
       G.dead=0;G.invuln=0;G.finished=null;clearAeroGlowState("me");
       G.rivals.forEach(r=>{r.y=playerY+9000;r.dead=0;r.invuln=0;r.finished=null;});`);
}
/* A point in logical car units, put where the renderer would put it. */
function atCar(px,py){
  return `carHit().points && insideHitPolygon(carHit().points,` +
         `G.x+(${px})*carDims("rhosyn").w*Math.cos(G.tilt)-(${py})*carDims("rhosyn").h*Math.sin(G.tilt),` +
         `playerY+(${px})*carDims("rhosyn").w*Math.sin(G.tilt)+(${py})*carDims("rhosyn").h*Math.cos(G.tilt))`;
}
test('Rhosyn collides on its own measured hull, not on CAR_HIT_RECT',()=>{
  rhosynSetup(0);
  eq('racerModel("me").key','rhosyn');
  eq('racerModel("me").style','sprite');
  eq('JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CARS.rhosyn.hitShape)',true);
  eq('JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CAR_HIT_RECT)',false);
  /* Nobody else's either. */
  for(const other of ['flann','neela','lolanthe','verdant']){
    eq(`JSON.stringify(CARS.rhosyn.hitShape)===JSON.stringify(CARS.${other}.hitShape)`,false);
  }
  eq('carHit().points.length',run('CARS.rhosyn.hitShape.length'));
  eq('carHit().points.length > 4',true);
  eq('Math.abs(CARS.rhosyn.hitShape[0][0]) < 0.1',true);
});
test('Rhosyn current solid nose, waist and tail follow the new artwork',()=>{
  rhosynSetup(0);
  for(const [x,y] of [[0,0],[0,-.45],[.15,-.33],[-.15,-.33],[0,.38]]) eq(atCar(x,y),true);
  for(const [x,y] of [[.52,.23],[.45,-.4],[0,.5],[.40,0]]) eq(atCar(x,y),false);
});
test('Rhosyn race size and hull size stay locked together',()=>{
  rhosynSetup(0);
  /* The new artwork and hull share the same uniform race scale. */
  eq('raceScale("rhosyn")',1.14);
  near('carDims("rhosyn").w',run('carW*1.14'));
  near('carDims("rhosyn").h',run('carH*1.14'));
  const wide=run('Math.max.apply(null,CARS.rhosyn.hitShape.map(p=>Math.abs(p[0])))');
  const tall=run('Math.max.apply(null,CARS.rhosyn.hitShape.map(p=>Math.abs(p[1])))');
  near('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))',
       wide*carW0*1.14);
  near('carHit().points.map(p=>Math.abs(p.y-playerY)).reduce((a,b)=>Math.max(a,b))',
       tall*carH0*1.14);
  /* Inset: the hull never reaches past the body the sprite actually draws. */
  eq('Math.max.apply(null,CARS.rhosyn.hitShape.map(p=>Math.abs(p[0]))) <= 0.5',true);
  eq('Math.max.apply(null,CARS.rhosyn.hitShape.map(p=>Math.abs(p[1]))) <= 0.5',true);
  /* Doubling the shared box doubles both, together. */
  run(`carW=${carW0*2};carH=${carH0*2};`);
  near('carHit().points.map(p=>Math.abs(p.x-G.x)).reduce((a,b)=>Math.max(a,b))',
       wide*carW0*1.14*2);
  run(`carW=${carW0};carH=${carH0};`);
});
test('a rotated Rhosyn is collided on the rotated polygon',()=>{
  rhosynSetup(0.6);
  /* Every vertex is the measured shape put through the car's own rotation. */
  const pts=JSON.parse(run('JSON.stringify(carHit().points)'));
  const shape=JSON.parse(run('JSON.stringify(CARS.rhosyn.hitShape)'));
  const dim=JSON.parse(run('JSON.stringify(carDims("rhosyn"))'));
  const x0=run('G.x'), y0=run('playerY'), t=run('G.tilt');
  const ca=Math.cos(t), sa=Math.sin(t);
  assert.equal(pts.length,shape.length);
  for(let i=0;i<shape.length;i++){
    const px=shape[i][0]*dim.w, py=shape[i][1]*dim.h;
    assert.ok(Math.abs(pts[i].x-(x0+px*ca-py*sa))<1e-9,'tilted x');
    assert.ok(Math.abs(pts[i].y-(y0+px*sa+py*ca))<1e-9,'tilted y');
  }
  /* The body turns with the car, so the same car-space points answer the same
     way at an angle that a bounding box would have got wrong. */
  eq(atCar(0,0),true);
  eq(atCar(0.30,0.23),true);
  eq(atCar(0,-0.30),true);                   /* the current nose is solid */
  /* And a point that is only inside the unrotated box is now outside. */
  eq('insideHitPolygon(carHit().points,G.x+0.47*carDims("rhosyn").w,playerY+0.22*carDims("rhosyn").h)',false);
});
test('Rhosyn hit geometry exists before its image loads',()=>{
  const fresh=fixture();fresh.boot();
  fresh.run(`G.local=false;G.mode="endless";G.car="rhosyn";G.rules=defaultRules();
             startRace();clearTimers();G.state="running";carW=100;carH=186;
             G.x=200;playerY=300;G.tilt=0;`);
  assert.equal(fresh.images.every(i=>!i.complete),true);
  const before=fresh.run('JSON.stringify(carHit())');
  assert.equal(fresh.run('carHit().points.length'),fresh.run('CARS.rhosyn.hitShape.length'));
  fresh.images.forEach(i=>i.load());
  assert.equal(fresh.run('JSON.stringify(carHit())'),before);
});
test('Aero-Glow moves no hull: the body is where it always was',()=>{
  rhosynSetup(0);
  const before=run('JSON.stringify(carHit())');
  run('G.ult=1;startUlt("me");tickAeroGlow("me",1);');
  eq('rhosynElsewhere("me")',true);
  eq('G.aeroPhase','glow');
  /* The geometry is untouched - what changed is that nothing may ask it. */
  assert.equal(run('JSON.stringify(carHit())'),before,'leaving moved the hitbox');
  eq('noContact("me")',true);
  run('endUlt("me");tickAeroGlow("me",1);');
  eq('G.aeroPhase','off');
  assert.equal(run('JSON.stringify(carHit())'),before);
});
test('the notes change no collision geometry',()=>{
  run(`G.local=false;G.car="saffron";G.rules=defaultRules();G.mode="endless";
       startRace();clearTimers();G.state="running";carW=100;carH=186;
       G.tilt=0;G.x=200;playerY=300;G.dead=0;G.invuln=0;`);
  const before=run('JSON.stringify(carHit())');
  run('applyMindControl("me");');
  eq('conditionOn("me","mindControlled")',true);
  assert.equal(run('JSON.stringify(carHit())'),before,'the three notes moved the hull');
  run('clearDebuffs("me");');
});

test('Saffron base and dragon geometry are distinct, rotated and available before loading',()=>{
  const fresh=fixture();fresh.boot();
  fresh.run(`G.local=false;G.car='saffron';G.rules=defaultRules();startRace();clearTimers();G.state='running';
    W=390;H=844;layout();G.x=200;playerY=500;G.tilt=.27;`);
  assert.equal(fresh.images.every(i=>!i.complete),true);
  for(const alt of [false,true]){
    if(alt) fresh.run('startUlt("me");');
    const points=JSON.parse(fresh.run('JSON.stringify(carHit().points)'));
    const shape=JSON.parse(fresh.run('JSON.stringify(racerModel("me").hitShape)'));
    const dim=JSON.parse(fresh.run('JSON.stringify(racerDims("me"))'));
    assert.ok(shape.length>4);
    assert.equal(fresh.run('racerModel("me").key'),alt?'saffronAlt':'saffron');
    for(let i=0;i<shape.length;i++){
      const x=shape[i][0]*dim.w,y=shape[i][1]*dim.h;
      assert.ok(Math.abs(points[i].x-(200+x*Math.cos(.27)-y*Math.sin(.27)))<1e-8);
      assert.ok(Math.abs(points[i].y-(500+x*Math.sin(.27)+y*Math.cos(.27)))<1e-8);
    }
    if(alt) assert.equal(dim.w,fresh.run('laneW*2'));
  }
  fresh.run('endUlt("me");');
  assert.equal(fresh.run('racerModel("me").key'),'saffron');
});

console.log(`\n${checks} hitbox checks passed.`);
