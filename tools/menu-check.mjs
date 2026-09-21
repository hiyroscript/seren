#!/usr/bin/env node
import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
let checks=0;
function test(name, fn){fn();checks++;console.log('  ok  '+name);}
const f=fixture();const {run,$,click}=f;
f.boot();
test('first visit opens language and gates Home',()=>{assert.ok($('#langWrap').classList.contains('on'));assert.ok($('#home').inert);});
f.document.querySelector('[data-lang="en"]').click();
test('language choice persists and releases Home',()=>{assert.equal(f.saves.get('seren.lang'),'en');assert.equal($('#home').inert,false);});
/* Settings: one dialog for every preference, and every control painted from
   stored state rather than from whatever the DOM was left showing. */
f.saves.set('seren.best','4820');
click('btnSettings');
test('settings opens as a modal over the menus',()=>{assert.ok($('#settingsWrap').classList.contains('on'));assert.ok($('#home').inert);assert.equal(f.document.activeElement.id,'btnCloseSettings');});
click('btnStart');
test('home cannot be reached behind settings',()=>{assert.equal(run('menuScreen'),'home');});
$('#btnSetReset').focus();$('#btnSetReset').dispatch('keydown',{key:'Tab'});
test('tab wraps inside settings',()=>{assert.equal(f.document.activeElement.id,'btnCloseSettings');});
$('#btnCloseSettings').dispatch('keydown',{key:'Tab',shiftKey:true});
test('shift+tab wraps the other way',()=>{assert.equal(f.document.activeElement.id,'btnSetReset');});
$('[data-set="sound"]').click();
test('the sound switch is the one audio state',()=>{assert.equal(run('soundOn'),false);assert.equal(run('masterGain()'),0);assert.equal(f.saves.get('seren.sound'),'0');assert.equal($('#setSoundSw').getAttribute('aria-checked'),'false');assert.equal($('#setSoundState').textContent,run('t("setOff")'));});
$('[data-set="sound"]').click();
test('and back on again',()=>{assert.equal(run('soundOn'),true);assert.equal(f.saves.get('seren.sound'),'1');assert.equal($('#setSoundSw').getAttribute('aria-checked'),'true');});
$('#setVolRange').value='40';$('#setVolRange').dispatch('input');
test('volume persists and reaches the master gain',()=>{assert.equal(f.saves.get('seren.volume'),'40');assert.equal(run('masterVol'),0.4);assert.equal(run('masterGain()'),0.4);assert.equal($('#setVolVal').textContent,'40%');});
$('[data-set="motion"][data-val="reduced"]').click();
test('reduced motion reaches the stylesheet and the canvas',()=>{assert.equal(run('motionReduced()'),true);assert.equal(f.document.documentElement.getAttribute('data-motion'),'reduced');assert.equal($('[data-set="motion"][data-val="reduced"]').getAttribute('aria-pressed'),'true');assert.equal($('[data-set="motion"][data-val="system"]').getAttribute('aria-pressed'),'false');});
$('[data-set="motion"][data-val="full"]').click();
test('full motion overrules the system preference',()=>{assert.equal(run('motionReduced()'),false);assert.equal(f.saves.get('seren.motion'),'full');});
$('[data-set="contrast"][data-val="on"]').click();
test('high contrast is stored and mirrored on the document',()=>{assert.equal(f.saves.get('seren.contrast'),'on');assert.equal(f.document.documentElement.getAttribute('data-contrast'),'on');});
$('[data-set="hints"]').click();
test('control hints hide from the home screen only',()=>{assert.ok(f.document.body.classList.contains('no-hints'));assert.equal(f.saves.get('seren.controlHints'),'0');assert.equal($('#setHintsState').textContent,run('t("setOff")'));});
$('[data-set="lang"][data-val="fr"]').click();
test('language changes in place, panel and all',()=>{assert.equal(f.saves.get('seren.lang'),'fr');assert.ok($('#settingsWrap').classList.contains('on'));assert.equal($('#settingsTitle').textContent,run('t("settings")'));assert.equal($('[data-set="lang"][data-val="fr"]').getAttribute('aria-pressed'),'true');assert.ok($('#setVolVal').textContent.includes('\u00a0'));});
click('btnSetReset');
test('restoring defaults asks once first',()=>{assert.ok($('#btnSetReset').classList.contains('armed'));assert.equal($('#setResetNote').textContent,run('t("setRestoreAsk")'));assert.equal(f.saves.get('seren.controlHints'),'0');});
click('btnSetReset');
test('restoring defaults keeps language and saved data',()=>{assert.equal(f.saves.get('seren.controlHints'),'1');assert.equal(f.saves.get('seren.volume'),'90');assert.equal(f.saves.get('seren.motion'),'system');assert.equal(f.saves.get('seren.contrast'),'system');assert.equal(f.saves.get('seren.sound'),'1');assert.equal(f.saves.get('seren.lang'),'fr');assert.equal(f.saves.get('seren.best'),'4820');assert.equal(run('masterVol'),0.9);});
$('#settingsCard').dispatch('pointerdown');$('#settingsCard').dispatch('click');
test('a press inside the card never closes it',()=>{assert.ok($('#settingsWrap').classList.contains('on'));});
$('#settingsWrap').dispatch('pointerdown');$('#settingsWrap').dispatch('click');
test('the backdrop closes settings and releases home',()=>{assert.equal($('#settingsWrap').classList.contains('on'),false);assert.equal($('#home').inert,false);assert.equal(f.document.activeElement.id,'btnSettings');});
for(const language of ['en','fr']){
  run('lang = '+JSON.stringify(language)+'; applyLang()');
  click('btnStart');
  test(language+' mode navigation and focus isolation',()=>{assert.equal(run('menuScreen'),'modes');assert.ok($('#home').inert);assert.equal($('#modes').inert,false);assert.ok($('#cars').inert);});
  click('modeBots');
  for(const diff of ['Easy','Medium','Hard','Brutal']){
    click('diff'+diff);
    test(language+' '+diff+' reaches car showroom',()=>{assert.equal(run('G.diff'),diff.toLowerCase());assert.equal(run('menuScreen'),'cars');assert.ok($('#carHeroName').textContent);});
    click('btnCloseCars');
  }
  click('btnCloseDiffs');click('btnCloseModes');
  click('btnGarage');
  for(const tab of ['Cars','Tracks','Items','Conditions']){click('tab'+tab);test(language+' reference '+tab,()=>{assert.ok($('#garageBody').children.length);assert.equal($('#tab'+tab).getAttribute('aria-selected'),'true');});}
  /* The Conditions page: two sub-tabs generated from CONDITIONS[id].type, the
     right six entries split across them, and no Launched or Winner anywhere. */
  test(language+' Conditions opens on Buff with both sub-tabs',()=>{
    assert.equal(run('garageTab'),'conditions');assert.equal(run('condTab'),'buff');
    assert.equal($('#condTabBuff').getAttribute('aria-selected'),'true');
    assert.equal($('#condTabDebuff').getAttribute('aria-selected'),'false');
    assert.equal($('#condTabBuff').getAttribute('role'),'tab');
    assert.equal($('#condTabBuff').getAttribute('tabindex'),'0');
    assert.equal($('#condTabDebuff').getAttribute('tabindex'),'-1');
    assert.equal($('#condTabBuff').textContent,run('t("condBuff")'));
    assert.equal($('#condTabDebuff').textContent,run('t("condDebuff")'));
    assert.deepEqual(Array.from(run('conditionsOfType("buff")')),['cleansed','invulnerable','boosted']);
    const html=$('#garageBody').innerHTML;
    for(const id of run('conditionsOfType("buff")')) assert.ok(html.includes(run('t(CONDITIONS["'+id+'"].key)')),id);
    for(const id of run('conditionsOfType("debuff")')) assert.ok(!html.includes(run('t(CONDITIONS["'+id+'"].key)')),id);
    assert.ok(html.includes('<svg'),'every card carries its badge');
  });
  $('#condTabDebuff').click();
  test(language+' Debuff sub-tab switches the page in place',()=>{
    assert.equal(run('condTab'),'debuff');assert.equal(run('garageTab'),'conditions');
    assert.deepEqual(Array.from(run('conditionsOfType("debuff")')),
                     ['slowed','obscured','skidded','mindControlled']);
    const html=$('#garageBody').innerHTML;
    for(const id of run('conditionsOfType("debuff")')) assert.ok(html.includes(run('t(CONDITIONS["'+id+'"].key)')),id);
    assert.ok(!/Launched|Propuls|Winner|Vainqueur/.test(html));
    assert.equal(f.document.activeElement.id,'condTabDebuff');
  });
  $('#condTabDebuff').dispatch('keydown',{key:'ArrowLeft'});
  test(language+' arrow keys walk the sub-tabs',()=>{assert.equal(run('condTab'),'buff');assert.equal(f.document.activeElement.id,'condTabBuff');});
  $('#condTabBuff').dispatch('keydown',{key:'End'});
  test(language+' End reaches the last sub-tab',()=>{assert.equal(run('condTab'),'debuff');});
  click('tabCars');click('tabConditions');
  test(language+' leaving and returning starts on Buff again',()=>{assert.equal(run('condTab'),'buff');});
  click('btnCloseGarage');
}
for(const count of [2,3,4]){
  click('btnStart');click('modeLocal');click('count'+count);
  test(count+' players wait for enough controllers',()=>{assert.equal(run('G.players'),count);assert.equal($('#btnPadsGo').disabled,true);});
  f.pads.length=0;for(let i=0;i<count;i++)f.pads.push({index:i*2,connected:true,id:i===0?'<test controller>':'Controller '+i,axes:[0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))});
  run('padsRefresh()');
  test(count+' controller assignments and readiness',()=>{assert.equal($('#btnPadsGo').disabled,false);assert.equal($('#padList').children.length,count);assert.ok($('#padList').innerHTML.includes('&lt;test controller&gt;'));});
  f.pads[0].connected=false;run('padsRefresh()');assert.ok($('#btnPadsGo').disabled);
  f.pads[0].connected=true;run('padsRefresh()');
  click('btnPadsGo');assert.deepEqual(Array.from(run('G.padIds')),f.pads.map(p=>p.index));
  click('styleCustom');
  for(let n=0;n<=6-count;n++){
    $('[data-bots="'+n+'"]').click();
    test(count+' players / '+n+' bots',()=>{assert.equal(run('botsWanted()'),n);assert.equal($('[data-diff="easy"]').disabled,n===0);assert.equal(f.document.activeElement.getAttribute('data-bots'),String(n));});
  }
  for(const d of ['easy','medium','hard','brutal']){$('[data-diff="'+d+'"]').click();assert.equal(run('G.diff'),d);}
  for(const rule of ['traps','bubbles','boost','ults']){
    $('[data-rule="'+rule+'"]').click();assert.equal(run('G.rules.'+rule),false);assert.equal($('[data-rule="'+rule+'"]').getAttribute('aria-checked'),'false');
  }
  click('btnCustomGo');click('carFlann');
  test(count+' turn-taking, taken cars, and Back undo',()=>{assert.ok($('#carFlann').disabled);assert.equal(run('pickTurn'),1);click('btnCloseCars');assert.equal(run('pickTurn'),0);assert.equal($('#carFlann').disabled,false);});
  click('btnCloseCars');click('btnCloseCustom');click('styleStandard');
  test(count+' Standard clears custom rules',()=>{assert.equal(run('G.custom'),false);assert.ok(run('G.rules.traps && G.rules.bubbles && G.rules.boost && G.rules.ults'));});
  click('diffMedium');
  f.pads[0].connected=false;run('carPadTick(.016)');assert.equal($('#carPadState').textContent,run('t("padMissing")'));
  f.pads[0].connected=true;run('carPadTick(.016)');assert.equal($('#carPadState').textContent,run('t("padReady")'));
  run('carStep(1)');assert.equal(run('carCur'),1);assert.ok($('#carNeela').classList.contains('cursor'));
  // Exercise the actual controller edge handler, not only its helpers.
  f.pads[0].buttons[0].pressed=true;run('carPadTick(.016)');f.pads[0].buttons[0].pressed=false;
  assert.equal(run('G.picks[0]'),'neela');
  for(let i=1;i<count;i++)click('carRandom');
  test(count+' picks start the unchanged local race',()=>{assert.equal(run('menuScreen'),'race');assert.equal(run('G.state'),'countdown');assert.equal(run('G.picks.length'),count);assert.equal(new Set(run('G.picks')).size,count);});
  run('pause(true)');assert.ok($('.hud').inert);click('btnResume');assert.equal($('.hud').inert,false);
  run('pause(true)');click('btnQuit');f.pads.length=0;
}
click('btnStart');click('modeEndless');click('carRandom');
test('Endless random pick starts race',()=>{assert.equal(run('G.mode'),'endless');assert.equal(run('G.state'),'countdown');});
run('pause(true)');click('btnQuit');
click('btnStart');click('modeBots');click('diffHard');click('carFlann');
run('G.finished = 1; finishRace()');f.timers.at(-1)();
test('results isolate focus and replay returns to race',()=>{assert.equal(run('G.state'),'over');assert.ok($('.hud').inert);assert.equal(f.document.activeElement.id,'btnAgain');click('btnAgain');assert.equal(run('G.state'),'countdown');assert.equal($('.hud').inert,false);});
run('pause(true)');click('btnQuit');click('btnStart');
test('native Enter does not bypass a focused mode',()=>{const event=$('#modeBots').dispatch('keydown',{key:'Enter'});assert.equal(!!event.defaultPrevented,false);assert.equal(run('menuScreen'),'modes');});
test('Escape follows Back and restores the invoking control',()=>{$('#modeBots').dispatch('keydown',{key:'Escape'});assert.equal(run('menuScreen'),'home');assert.equal(f.document.activeElement.id,'btnStart');});
click('btnSettings');$('[data-set="lang"][data-val="en"]').click();
test('later language switching leaves settings open',()=>{assert.equal(f.saves.get('seren.lang'),'en');assert.ok($('#settingsWrap').classList.contains('on'));assert.equal($('[data-set="lang"][data-val="en"]').getAttribute('aria-pressed'),'true');});
$('#btnCloseSettings').dispatch('keydown',{key:'Escape'});
test('Escape closes settings and restores Home focus',()=>{assert.equal($('#settingsWrap').classList.contains('on'),false);assert.equal(run('menuScreen'),'home');assert.equal(f.document.activeElement.id,'btnSettings');});
const mobile=fixture(false);mobile.boot();mobile.document.querySelector('[data-lang="fr"]').click();mobile.click('btnStart');
test('touch capability gates Local with native disabled state',()=>{assert.ok(mobile.$('#modeLocal').disabled);mobile.click('modeLocal');assert.equal(mobile.run('menuScreen'),'modes');});

/* ================================================================
   NEELA IN THE MENUS
   ================================================================
   Neela took the slot the game's second car has always had, rather than being
   added as a seventh. These say so, say the screens are showing the car's own
   name and its own ultimate description, and say the alternate body never
   appears in a preview - the garage and the select screen show what you are
   about to drive, not what it turns into. */
test('Neela holds the second slot and is not a seventh car',()=>{
  const ids=Array.from(f.run('CAR_IDS'));
  assert.equal(ids.length,9);
  assert.equal(ids[1],'neela');
  assert.equal(ids.includes('phantom'),false);
  assert.ok(f.$('#carNeela'),'the select screen has a Neela button');
  assert.equal(f.$('#carNeela').querySelector('canvas').getAttribute('data-car'),'neela');
  /* And the temperament table moved with it rather than being left behind. */
  assert.equal(f.run('typeof TEMPERS.neela'),'object');
  assert.equal(f.run('typeof TEMPERS.phantom'),'undefined');
});
for(const lang of ['en','fr']){
  test('Neela is named and described on screen in '+lang,()=>{
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    assert.equal(f.run('t("neela")'),'Neela');
    const power=f.run('t("neelaUlt")');
    assert.ok(power.length>40,'Neela has a description of its own, not the shared one');
    assert.notEqual(power,f.run('t("saffronUlt")'));
    /* It says what the ultimate actually does, in the words the road uses. */
    for(const word of lang==='en'
        ? ['shape','tumbleweed','meteor','swap','Puddles']
        : ['forme','virevoltants','météores','échange','flaques']){
      assert.ok(power.toLowerCase().includes(word.toLowerCase()),
                lang+' description mentions '+word);
    }
    /* And no implementation vocabulary leaked into it. */
    for(const leak of ['rebase','world pose','coordinate','hitbox','sprite']){
      assert.equal(power.toLowerCase().includes(leak),false,lang+' description leaks '+leak);
    }
    /* The showroom prints both of them through the ordinary preview path. */
    f.run('previewCar("neela");');
    assert.equal(f.$('#carHeroName').textContent,f.run('t("neela")'));
    assert.equal(f.$('#carHeroPower').textContent,power);
    assert.equal(f.$('#carHero').getAttribute('data-car'),'neela');
  });
}
test('no Phantom string survives anywhere the player can read',()=>{
  const strings=f.run('JSON.stringify(STR)');
  assert.equal(/phantom/i.test(strings),false,'STR still carries a Phantom entry');
  for(const lang of ['en','fr']){
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    assert.equal(/phantom/i.test(f.document.body.textContent),false,
                 'the page still prints Phantom in '+lang);
  }
  f.run('chooseLang("en");');
});
test('every menu preview is the car model, never the alternate form',()=>{
  f.run(`globalThis.drawn=[];globalThis.realDrawCar=drawCar;
         drawCar=function(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha){
           drawn.push({key:p.key,sprite:p.sprite||null,boost:!!boosting,
                       ult:!!ulting,white:white||0,
                       alpha:alpha===undefined?1:alpha});
           return realDrawCar(x,y,w,h,p,tilt,isPlayer,boosting,ulting,white,alpha);};`);
  try{
    /* Even with an alternate form up on the road, the menus are unmoved: they
       paint from CARS directly and never ask what a racer is wearing. */
    f.run(`G.local=false;G.car="neela";G.rules=defaultRules();G.mode="endless";
           startRace();clearTimers();G.state="running";G.ult=1;startUlt("me");
           drawn.length=0;paintCarIcons();previewCar("neela");`);
    const drawn=JSON.parse(f.run('JSON.stringify(drawn)'));
    assert.ok(drawn.length>=6,'the whole line-up was painted');
    assert.ok(drawn.some(d=>d.sprite==='v_neela.PNG'),'Neela is in the line-up');
    for(const d of drawn){
      assert.notEqual(d.sprite,'vtm_neela.PNG','a menu drew the alternate form');
      assert.notEqual(d.key,'neelaAlt','a menu drew the alternate model');
      assert.equal(d.boost,false);
      assert.equal(d.ult,false);
      assert.equal(d.white,0);
      /* A menu is not a view, so nobody's ultimate may fade a preview out. */
      assert.equal(d.alpha,1,'a menu drew a car at anything but full opacity');
    }
    assert.equal(f.run('neelaFormActive("me")'),true,'the road still has it, though');
    f.run('endUlt("me");');
  } finally { f.run('drawCar=realDrawCar;'); }
});

/* ================================================================
   LOLANTHE AND VERDANT IN THE MENUS
   ================================================================
   The same questions Neela's slot was asked. Each took the slot the car it
   replaced had always held rather than being added as a seventh or an eighth,
   the screens print its own name and its own ultimate description, and neither
   of the two cars it replaced survives anywhere a player can read. */
test('Lolanthe and Verdant hold the third and fourth slots',()=>{
  const ids=Array.from(f.run('CAR_IDS'));
  assert.equal(ids.length,9);
  assert.deepEqual(ids,['flann','neela','lolanthe','verdant','rhosyn','saffron','cole','dhaval','aureolin']);
  assert.equal(ids.includes('bolt'),false);
  assert.equal(ids.includes('timestamp'),false);
  for(const [id,btn] of [['lolanthe','#carLolanthe'],['verdant','#carVerdant']]){
    assert.ok(f.$(btn),'the select screen has a '+id+' button');
    assert.equal(f.$(btn).querySelector('canvas').getAttribute('data-car'),id);
    /* The generic carEl()/capitalisation path still reaches it. */
    assert.equal(f.run('carEl("'+id+'").id'),btn.slice(1));
  }
  /* The temperaments moved across rather than being left behind or invented. */
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(TEMPERS.lolanthe)')),
                   {nerve:0.54,spite:0.64,patience:0.68,guard:0.52});
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(TEMPERS.verdant)')),
                   {nerve:0.38,spite:0.32,patience:0.88,guard:0.74});
  assert.equal(f.run('typeof TEMPERS.bolt'),'undefined');
  assert.equal(f.run('typeof TEMPERS.timestamp'),'undefined');
});
for(const lang of ['en','fr']){
  test('Lolanthe and Verdant are named and described on screen in '+lang,()=>{
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    for(const id of ['lolanthe','verdant']){
      const name=f.run('t("'+id+'")');
      assert.equal(name,id[0].toUpperCase()+id.slice(1));
      const power=f.run('t("'+id+'Ult")');
      assert.ok(power.length>40,id+' has a description of its own, not the shared one');
      assert.notEqual(power,f.run('t("saffronUlt")'));
      f.run('previewCar("'+id+'");');
      assert.equal(f.$('#carHeroName').textContent,name);
      assert.equal(f.$('#carHeroPower').textContent,power);
      assert.equal(f.$('#carHero').getAttribute('data-car'),id);
    }
    /* Each says what its own fifteen seconds actually do. */
    const lol=f.run('t("lolantheUlt")').toLowerCase();
    for(const word of lang==='en'
        ? ['mind control','three seconds','lane','tumbleweed','puddles']
        : ['contrôle mental','trois secondes','voie','virevoltants','flaques']){
      assert.ok(lol.includes(word.toLowerCase()),lang+' Lolanthe mentions '+word);
    }
    const ver=f.run('t("verdantUlt")').toLowerCase();
    for(const word of lang==='en'
        ? ['invisible','destroyed','half','tumbleweed','puddles']
        : ['invisible','détruit','demi','virevoltants','flaques']){
      assert.ok(ver.includes(word.toLowerCase()),lang+' Verdant mentions '+word);
    }
    /* And neither leaks implementation vocabulary into the garage. */
    for(const leak of ['mindt','verdanthide','hitbox','sprite','alpha','vown']){
      assert.equal(lol.includes(leak),false,lang+' Lolanthe leaks '+leak);
      assert.equal(ver.includes(leak),false,lang+' Verdant leaks '+leak);
    }
  });
}
test('Mind Controlled is a Condition the garage can show',()=>{
  f.run('chooseLang("en");');
  assert.equal(f.run('CONDITIONS.mindControlled.type'),'debuff');
  assert.equal(f.run('t("condMindControlled")'),'Mind Controlled');
  assert.ok(f.run('t("mindControlledInfo")').length>40);
  /* The badge is a vector path like every other one; the PNG artwork is the
     world effect and is deliberately not in the badge system. */
  assert.ok(f.run('JSON.stringify(COND_PATHS[CONDITIONS.mindControlled.icon])'));
  const svg=f.run('conditionSvg("mindControlled",22)');
  assert.ok(svg.includes('<svg')&&svg.includes(f.run('CONDITIONS.mindControlled.col')));
  assert.equal(/\.PNG/i.test(svg),false,'the badge reaches for artwork instead of a path');
});
/* ================================================================
   RHOSYN IN THE MENUS
   ================================================================
   The same questions again. Rhosyn took the fifth slot the game's fifth car
   has always held rather than being added as a seventh, the screens print its
   own name and its own ultimate description, and the car it replaced does not
   survive anywhere a player can read - nor anywhere the code can reach. */
test('Rhosyn holds the fifth slot and is not a seventh car',()=>{
  const ids=Array.from(f.run('CAR_IDS'));
  assert.equal(ids.length,9);
  assert.equal(ids[4],'rhosyn');
  assert.equal(ids.includes('rose'),false);
  assert.ok(f.$('#carRhosyn'),'the select screen has a Rhosyn button');
  assert.equal(f.$('#carRhosyn').querySelector('canvas').getAttribute('data-car'),'rhosyn');
  assert.equal(f.$('#carRhosyn').querySelector('.car-name').getAttribute('data-i18n'),'rhosyn');
  /* The generic carEl()/capitalisation path still reaches it. */
  assert.equal(f.run('carEl("rhosyn").id'),'carRhosyn');
  /* The old button, the old model and the old temperament are all gone. */
  assert.equal(f.$('#carRose'),null);
  assert.equal(f.run('typeof CARS.rose'),'undefined');
  assert.equal(f.run('typeof TEMPERS.rose'),'undefined');
  /* And the temperament moved across rather than being invented. */
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(TEMPERS.rhosyn)')),
                   {nerve:0.62,spite:0.58,patience:0.50,guard:0.58});
  /* Its sheet is registered through the shared sprite cache like the others. */
  assert.equal(f.run('CARS.rhosyn.sprite'),'v_rhosyn.PNG');
  assert.equal(f.run('!!CAR_SPRITES["v_rhosyn.PNG"]'),true);
});
test('picking Rhosyn puts Rhosyn on the road',()=>{
  f.click('btnStart');f.click('modeEndless');f.click('carRhosyn');
  assert.equal(f.run('menuScreen'),'race');
  assert.equal(f.run('G.car'),'rhosyn');
  assert.equal(f.run('G.state'),'countdown');
  assert.equal(f.run('racerModel("me").sprite'),'v_rhosyn.PNG');
  /* The race sizes it off its own model, not off a rectangle. */
  assert.equal(f.run('racerModel("me").style'),'sprite');
  assert.equal(f.run('JSON.stringify(racerModel("me").hitShape)===JSON.stringify(CAR_HIT_RECT)'),false);
  f.run('pause(true)');f.click('btnQuit');
});
for(const lang of ['en','fr']){
  test('Rhosyn is named and described on screen in '+lang,()=>{
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    assert.equal(f.run('t("rhosyn")'),'Rhosyn');
    const power=f.run('t("rhosynUlt")');
    assert.ok(power.length>40,'Rhosyn has a description of its own, not the shared one');
    assert.notEqual(power,f.run('t("saffronUlt")'));
    /* It says what the fifteen seconds actually do. */
    for(const word of lang==='en'
        ? ['Aero-Glow','double pace','two seconds','Invulnerable']
        : ['Aero-Glow','double allure','deux secondes','Invulnérable']){
      assert.ok(power.toLowerCase().includes(word.toLowerCase()),
                lang+' Rhosyn mentions '+word);
    }
    /* And no implementation vocabulary leaked into the garage. */
    for(const leak of ['aerophase','vown','renderer','biome','teleport','hitbox','sprite']){
      assert.equal(power.toLowerCase().includes(leak),false,lang+' Rhosyn leaks '+leak);
    }
    f.run('previewCar("rhosyn");');
    assert.equal(f.$('#carHeroName').textContent,'Rhosyn');
    assert.equal(f.$('#carHeroPower').textContent,power);
    assert.equal(f.$('#carHero').getAttribute('data-car'),'rhosyn');
    /* Aero-Glow has a name of its own, and it is not a track. */
    assert.equal(f.run('t("aeroGlow")'),'Aero-Glow');
    assert.equal(f.run('TRACK_IDS.indexOf("aeroglow")'),-1);
    assert.equal(f.run('typeof TRACKS.aeroglow'),'undefined');
  });
}
test('no Rose string survives anywhere the player can read',()=>{
  const strings=f.run('JSON.stringify(STR)');
  assert.equal(/"rose/i.test(strings),false,'STR still carries a Rose entry');
  for(const lang of ['en','fr']){
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    const text=f.document.body.textContent;
    assert.equal(/\bRose\b/.test(text),false,'the page still prints Rose in '+lang);
  }
  f.run('chooseLang("en");');
});
test('no Bolt or Timestamp string survives anywhere the player can read',()=>{
  const strings=f.run('JSON.stringify(STR)');
  assert.equal(/\bbolt\b/i.test(strings),false,'STR still carries a Bolt entry');
  assert.equal(/timestamp/i.test(strings),false,'STR still carries a Timestamp entry');
  for(const lang of ['en','fr']){
    f.run(`chooseLang(${JSON.stringify(lang)});`);
    const text=f.document.body.textContent;
    assert.equal(/\bbolt\b/i.test(text),false,'the page still prints Bolt in '+lang);
    assert.equal(/timestamp/i.test(text),false,'the page still prints Timestamp in '+lang);
  }
  f.run('chooseLang("en");');
});


test('Cole is the seventh selection and garage card with complete English and French descriptions',()=>{
  for(const lang of ['en','fr']){
    f.run(`chooseLang('${lang}');G.local=false;G.players=1;show('cars');previewCar('cole');`);
    assert.equal(f.$('#carCole').querySelector('canvas').getAttribute('data-car'),'cole');
    assert.match(f.run('t("coleUlt")'),/1[.,]5×/);assert.match(f.run('t("coleUlt")'),/2[.,]3×/);
    f.run(`garageTab='cars';setTab();show('garage');`);
    assert.ok(f.$('#garageBody').textContent.includes('Cole'));
    f.run(`show('cars');pickCar('cole');`);
    assert.equal(f.run('G.car'),'cole');assert.equal(f.run('G.coleBike'),false);
    assert.equal(f.run('racerModel("me").sprite'),'v_cole.PNG');
  }
});

test('Dhaval is eighth in selection, reference and standings with complete EN/FR copy',()=>{
  for(const language of ['en','fr']){
    f.run(`chooseLang('${language}');G.local=false;G.players=1;show('cars');previewCar('dhaval');`);
    assert.equal(f.$('#carDhaval').querySelector('canvas').getAttribute('data-car'),'dhaval');
    assert.equal(f.$('#carHeroName').textContent,'Dhaval');
    assert.equal(f.$('#carHeroPower').textContent,f.run('t("dhavalUlt")'));
    assert.ok(f.$('#posRow8'));assert.equal(f.run('placeWord(8)'),language==='en'?'8th':'8e');
    f.run("garageTab='cars';show('garage');buildGarage();");
    assert.ok(f.$('#garageBody').innerHTML.includes('v_dhaval') || f.$('#garageBody').innerHTML.includes('data-car="dhaval"'));
    for(const key of ['dhaval','dhavalUlt','condCleansed','cleansedInfo','place8'])assert.ok(f.run(`STR.${key}.${language}.length`)>0);
    f.run("show('cars');");f.click('carDhaval');assert.equal(f.run('G.car'),'dhaval');
    assert.equal(f.run('racerModel("me").sprite'),'v_dhaval.PNG');
  }
});
console.log('\n'+checks+' menu behavior checks passed (DOM/Canvas test doubles; visual and hardware checks separate).');
