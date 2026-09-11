/* SEREN test suite — drives the real game in a real browser and asserts its
   invariants. No mocks: update()/render() are the game's own entry points. */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  try { chromium = require('@playwright/test').chromium; }
  catch (e2) {
    console.error('This suite drives a real browser and needs Playwright:\n' +
                  '  npm i -D playwright && npx playwright install chromium\n' +
                  '(a globally installed playwright works too: NODE_PATH=$(npm root -g) node test/suite.js)');
    process.exit(2);
  }
}
const URL = process.env.SEREN_URL || 'http://localhost:8123/index.html';

/* how far apart mystery squares are expected to land over a whole run, with
   room either side for the luck of one: the suite asserts the rate, not dice */
const MYSTERY_EVERY_MIN = 24, MYSTERY_EVERY_MAX = 84;

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

async function newPage(browser, opts) {
  const page = await browser.newPage(opts || { viewport: { width: 1200, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.Run !== 'undefined' && typeof window.CFG !== 'undefined');
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch();

  /* ------------------------------------------------------------------ */
  console.log('\n[1] boot and every screen renders');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      const out = { drawn: [], missing: [] };
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      ['lang', 'howto', 'settings', 'marble', 'cpu'].forEach(id => {
        if (!document.getElementById('panel-' + id)) { out.missing.push(id); return; }
        Screens.show(id); render(); out.drawn.push(id);
      });
      Screens.show(null); App.set(ST.HOME); render();
      App.set(ST.SPLASH); render();
      return out;
    });
    check('every panel shows and renders', r.missing.length === 0, r.missing.join(','));
    check('no errors on boot or panels', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[2] the speed readout is the run speed, and only that');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      const values = {}; let nonMono = 0, last = 0, maxGround = 0, minGround = 99;
      let boostFrames = 0, slowFrames = 0, deadFrames = 0;
      for (let i = 0; i < 60 * 1500; i++) {
        const s0 = App.state;
        update(1 / 60); render();
        if (s0 === ST.PLAYING || s0 === ST.RESPAWNING) {
          const shown = Run.mult;
          values[shown.toFixed(2)] = 1;
          if (shown < last - 1e-9) nonMono++;
          last = shown;
          const g = Run.groundMult();
          if (g > maxGround) maxGround = g;
          if (g < minGround) minGround = g;
          if (Player.boost > 0) boostFrames++;
          if (Player.slow > 0) slowFrames++;
          if (!Player.alive) deadFrames++;
        }
        if (App.state === ST.COMPLETED) break;
      }
      const keys = Object.keys(values).sort((a, b) => a - b);
      return { keys, nonMono, maxGround: +maxGround.toFixed(2), minGround: +minGround.toFixed(2),
               boostFrames, slowFrames, deadFrames, step: CFG.SPEED_STEP, max: CFG.SPEED_MAX };
    });
    const expected = [];
    for (let v = 1; v <= 3.0001; v += 0.1) expected.push(v.toFixed(2));
    check('readout takes exactly the 21 climb values', r.keys.length === 21 && r.keys[0] === '1.00' && r.keys[20] === '3.00',
      r.keys.length + ' values: ' + r.keys.join(','));
    check('readout never goes backwards', r.nonMono === 0, r.nonMono + ' frames');
    check('the run really did boost and die', r.boostFrames > 0 && r.deadFrames > 0,
      'boost=' + r.boostFrames + ' dead=' + r.deadFrames);
    check('ground moved far outside the readout, readout unmoved', r.maxGround > 3.5 && r.minGround === 0,
      'ground ' + r.minGround + '..' + r.maxGround);
    check('no errors over a full run', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[2b] no status effect moves the readout');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 45; i++) update(1 / 60);   /* a step or two up the climb */
      const held = Run.mult;
      const rows = {};
      const drive = (name, apply) => {
        Player.boost = 0; Player.boostPower = 1; Player.slow = 0;
        Player.alive = true; Player.coasting = false;
        apply();
        rows[name] = { readout: Run.mult, ground: +Run.groundMult().toFixed(2) };
      };
      drive('none', () => {});
      drive('boost', () => { Player.boost = CFG.BOOST_TIME; Player.boostPower = 1; });
      drive('superBoost', () => { Player.boost = CFG.BOOST_TIME; Player.boostPower = CFG.SUPER_BOOST_POWER; });
      drive('slow', () => { Player.slow = CFG.BUMP_SLOW_TIME; });
      drive('dead', () => { Player.alive = false; Player.coasting = false; });
      Player.alive = true; Player.boost = 0; Player.slow = 0;
      return { held, rows };
    });
    const names = Object.keys(r.rows);
    const allHeld = names.every(n => r.rows[n].readout === r.held);
    const grounds = names.map(n => r.rows[n].ground);
    check('the readout is identical under boost, slow and death', allHeld,
      JSON.stringify(r.rows));
    check('while the ground underneath moves for each of them',
      new Set(grounds).size === names.length, grounds.join(','));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[3] the ground moves at exactly the ground multiplier');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      /* Measured at the instant of the advance, not at the top of the frame.
         Race.update settles every decision first — an AI lane change can shove
         the player and slow it before anything moves — and then advances d and
         immediately calls the racer's own update. Hooking that call catches the
         speed actually in force, so no frame has to be skipped and none of the
         later repositioning (separation, respawns) is in the way. */
      let dAtFrameStart = 0, advanced = null, expected = null;
      const ru = Racer.prototype.update;
      Racer.prototype.update = function (dt) {
        if (this === Player && advanced === null) {
          advanced = Player.d - dAtFrameStart;
          expected = CFG.BASE_SPEED * Run.mult * Player.speedScale() * dt;
        }
        return ru.apply(this, arguments);
      };

      let checked = 0, worst = 0, off = 0;
      for (let i = 0; i < 60 * 900; i++) {
        const s0 = App.state;
        const alive0 = Player.alive && !Player.inBubble();
        dAtFrameStart = Player.d; advanced = null; expected = null;
        update(1 / 60);
        if ((s0 === ST.PLAYING || s0 === ST.RESPAWNING) && alive0 &&
            Player.alive && !Player.inBubble() && advanced !== null) {
          const err = Math.abs(advanced - expected);
          checked++;
          if (err > 1e-9) off++;
          if (err > worst) worst = err;
        }
        if (App.state === ST.COMPLETED) break;
      }
      Racer.prototype.update = ru;
      return { checked, off, worst };
    });
    check('every frame of ground travel is exactly the multiplier, with no exceptions',
      r.checked > 8000 && r.off === 0,
      r.off + ' of ' + r.checked + ' frames off (worst ' + r.worst.toExponential(2) + 'm)');
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[4] the mystery square');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 3; i++) update(1 / 60);
      const out = {};

      /* it blocks nothing and is not a hazard */
      Gen.stop(); Obstacles.clear();
      Obstacles.spawn({ kind: 'mystery', lane: 1 }, Race.camD + 10);
      const o = Obstacles.list[0];
      out.harmful = o.harmful;
      out.square = Math.abs(o.wF * PF.w - metresToPx(o.hM)) < 1.5;   /* as wide as it is long */
      out.kind = o.kind;

      /* Pickups fill the slot without changing speed or position. */
      const p0 = Race.racers[0];
      p0.alive = true; p0.boost = 0; p0.boostPower = 1; p0.immune = 0; p0.slow = 0;
      const beforeTake = [p0.boost, p0.boostPower, p0.immune, p0.slow,
                          p0.speedScale(), p0.d].join('|');
      o.flash = 0;
      Race.mysteryTake(p0, o);
      out.unchanged = [p0.boost, p0.boostPower, p0.immune, p0.slow,
                       p0.speedScale(), p0.d].join('|') === beforeTake;
      out.removed = !Obstacles.list.includes(o);
      out.itemGranted = ITEM_KINDS.indexOf(p0.item) >= 0;
      out.smaller = o.wF * 3 < 0.50;

      /* the slot is filled from the one known pool, and all three
         things in it come up over a long enough run of squares */
      const rolled = {};
      for (let i = 0; i < 400; i++) {
        const sq0 = Obstacles.spawn({ kind: 'mystery', lane: 1 }, Race.camD + 10)[0];
        p0.item = null;
        Race.mysteryTake(p0, sq0);
        rolled[String(p0.item)] = (rolled[String(p0.item)] || 0) + 1;
      }
      p0.item = null; VFX.clear();
      out.poolOnly = Object.keys(rolled).every(k => ITEM_KINDS.indexOf(k) >= 0);
      out.bothItems = ITEM_KINDS.every(k => rolled[k] > 0);

      /* who took what, per racer — six of them share this track */
      const byRacer = {};
      const mt = Race.mysteryTake.bind(Race);
      Race.mysteryTake = function (p, ob) { byRacer[p.id] = (byRacer[p.id] || 0) + 1; return mt(p, ob); };
      const park = keep => Race.racers.forEach(p => {
        if (p.id === keep) return;
        p.alive = false; p.coasting = true; p.floating = false; p.d = -4000;
      });

      /* one racer sitting on one square: it may only open for them once,
         however long they stand in it */
      Obstacles.clear();
      Obstacles.spawn({ kind: 'mystery', lane: 1 }, Race.camD + 3);
      const sq = Obstacles.list[0];
      const me = Race.racers[0];
      park(me.id);
      me.alive = true; me.floating = false; me.coasting = false;
      me.lane = 1; me.xF = 0.5; me.d = sq.wd + sq.hM / 2;
      for (let i = 0; i < 120; i++) { me.d = sq.wd + sq.hM / 2; Race.update(1 / 60, 0); }
      out.takesBySameRacer = byRacer[me.id] || 0;
      out.stillOnTrack = Obstacles.list.indexOf(sq) >= 0;

      /* a second racer cannot collect the consumed square */
      const other = Race.racers[2];
      other.place(1, sq.wd + sq.hM / 2);
      other.alive = true; other.floating = false; other.coasting = false;
      for (let i = 0; i < 60; i++) {
        other.d = sq.wd + sq.hM / 2; other.xF = 0.5; other.lane = 1;
        Race.update(1 / 60, 0);
      }
      out.takesByOther = byRacer[other.id] || 0;
      out.seenIds = Object.keys(sq.seen).length;

      /* a racer carried in a bubble is over the top of everything */
      Obstacles.clear();
      Obstacles.spawn({ kind: 'mystery', lane: 1 }, Race.camD + 3);
      const sq2 = Obstacles.list[0];
      const p2 = Race.racers[4];
      park(p2.id);
      const before2 = byRacer[p2.id] || 0;
      p2.place(1, sq2.wd + sq2.hM / 2);
      p2.alive = true; p2.floating = true; p2.bubble = 3; p2.bubbleAge = 0.5;
      p2.lane = 1; p2.xF = 0.5; p2.d = sq2.wd + sq2.hM / 2;
      for (let i = 0; i < 60; i++) { p2.d = sq2.wd + sq2.hM / 2; p2.floating = true; Race.update(1 / 60, 0); }
      out.bubbleTakes = (byRacer[p2.id] || 0) - before2;
      Race.mysteryTake = mt;

      /* A square out of the camera's reach is still a square: the racer that
         meets it takes it, wherever the human happens to be looking. */
      Obstacles.clear();
      Race.racers.forEach(p => { p.finished = true; });
      const leader = Race.racers[3];
      leader.finished = false; leader.ai = null;
      leader.place(1, 1000); leader.alive = true; leader.floating = false;
      leader.coasting = false; leader.boost = 0; leader.slow = 0;
      Race.camD = 0; Race.camLock = true;
      Gen.stop();
      const far = Obstacles.spawn(E_mystery(1), leader.d + 6)[0];
      out.aheadOfLeader = far.wd > leader.d && !leader.onCamera() && !far.onCamera();
      for (let i = 0; i < 180 && Obstacles.list.includes(far); i++) {
        Race.tickClock(1 / 60); Obstacles.update(1 / 60); Race.update(1 / 60, 1);
      }
      out.leaderCollected = !!far.seen[leader.id] && !Obstacles.list.includes(far);

      /* Expiry starts at spawn, freezes on pause, and applies off camera too. */
      Obstacles.clear();
      const exp = Obstacles.spawn(E_mystery(0), 2000)[0];
      const start = Race.clock;
      App.set(ST.PAUSED);
      for (let i = 0; i < 120; i++) update(1 / 60);
      out.pauseFreezes = Race.clock === start && Obstacles.list.includes(exp);
      Settings.effects = 'full';
      Race.clock = exp.expiresAt - CFG.MYSTERY_BLINK - 0.01;
      out.solidBeforeBlink = Obstacles.mysteryAlpha(exp) === 1;
      Race.clock = exp.expiresAt - CFG.MYSTERY_BLINK + 0.1;
      const alpha1 = Obstacles.mysteryAlpha(exp);
      Race.clock += 0.25;
      out.blinks = alpha1 !== Obstacles.mysteryAlpha(exp);
      Settings.effects = 'reduced';
      const fade1 = Obstacles.mysteryAlpha(exp);
      Race.clock += 0.25;
      out.reducedFades = Obstacles.mysteryAlpha(exp) < fade1;
      Settings.effects = 'full';
      Race.clock = exp.expiresAt - 0.001; Obstacles.update(0);
      out.presentUntilExpiry = Obstacles.list.includes(exp);
      Race.clock = exp.expiresAt; Obstacles.update(0);
      out.expired = !Obstacles.list.includes(exp);
      return out;
    });
    check('the square is a pickup, not a hazard', r.harmful === false);
    check('the square is square', r.square === true);
    check('taking one preserves speed, immunity and position', r.unchanged === true);
    check('collection removes the square immediately', r.removed === true);
    check('pickup fills the item slot', r.itemGranted === true);
    check('mystery squares are smaller', r.smaller === true);
    check('a square only ever hands out something from the item pool', r.poolOnly === true);
    check('all items in the pool come up', r.bothItems === true);
    check('one racer takes a given square exactly once', r.takesBySameRacer === 1, 'took ' + r.takesBySameRacer);
    check('a taken square leaves the track for the whole field', r.stillOnTrack === false);
    check('the next racer cannot collect it again',
      r.takesByOther === 0 && r.seenIds === 1, 'took ' + r.takesByOther + ', seen by ' + r.seenIds);
    check('a racer in a respawn bubble takes nothing', r.bubbleTakes === 0, 'took ' + r.bubbleTakes);
    for (const key of ['aheadOfLeader', 'leaderCollected', 'pauseFreezes',
                       'solidBeforeBlink', 'blinks', 'reducedFades', 'presentUntilExpiry', 'expired']) {
      check(key, r[key] === true);
    }
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }


  console.log('\n[4b] items and input');
  for (const opts of [{ viewport: { width: 1200, height: 900 } },
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const { page, errs } = await newPage(browser, opts);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      Run.begin(); Gen.stop(); App.set(ST.PLAYING); Obstacles.clear(); VFX.clear();
      Race.racers.forEach((p, i) => { p.ai = null; p.place(0, -100 - i * 10); });
      Player.place(1, 100); Race.camD = Player.d;
      const out = {};
      const pickup = Obstacles.spawn({ kind: 'mystery', lane: 1 }, 100)[0];
      Race.mysteryTake(Player, pickup);
      out.pickupFX = VFX.pickups.length === 1;
      render();

      /* the bolt: the yellow pad's shove, and nothing left on the track */
      Player.item = 'boost'; Player.boost = 0; Player.boostPower = 1;
      const trackBefore = Obstacles.list.length;
      render();                                  /* the slot draws the bolt */
      Input.onKeyDown({ key: 'Shift', preventDefault() {} });
      out.bolt = Player.item === null && Player.boost === CFG.BOOST_TIME &&
        Player.boostPower === 1 && Player.speedScale() > 1 &&
        Obstacles.list.length === trackBefore;
      Player.boost = 0; Player.boostPower = 1;

      /* the fake square: a trap left behind, clear of the racer that left it */
      Player.item = 'falseMystery';
      Input.onKeyDown({ key: 'Shift', preventDefault() {} });
      const trap = Obstacles.list[0];
      out.drop = trap.kind === 'falseMystery' && trap.wd + trap.hM < Player.d &&
        !racerHits(Player, trap) && Player.item === null;
      const q = Race.racers[1], q2 = Race.racers[2];
      q.place(1, trap.wd + trap.hM / 2); q2.place(1, q.d);
      Race.update(0, 1);
      out.singleHit = !q.alive && q2.alive && !Obstacles.list.includes(trap);
      Player.item = 'falseMystery'; App.set(ST.PAUSED);
      out.pauseGuard = !Race.useItem(Player) && Player.item !== null;
      App.set(ST.PLAYING); Player.floating = true;
      out.bubbleGuard = !Race.useItem(Player);
      Player.floating = false;
      Player.finished = true;
      out.finishGuard = !Race.useItem(Player);
      Player.finished = false;
      Settings.effects = 'reduced'; render();
      const fxClock = Race.clock;
      App.set(ST.PAUSED); update(.2); render();
      out.pickupPause = Race.clock === fxClock;
      App.set(ST.PLAYING); Settings.effects = 'full';
      const e = { pointerId: 1, clientX: 100, clientY: 200, type: 'pointerup' };
      Input.releaseAll(); Input.onDown(e); Input.onUp(e); App.time += .1;
      Input.onDown(e); Input.onUp(e);
      out.doubleTap = Player.item === null;
      Player.item = 'falseMystery'; Input.releaseAll();
      Input.onDown(e); Input.onUp({ ...e, type: 'pointercancel' });
      App.time += .1; Input.onDown(e); Input.onUp(e);
      out.cancelGuard = Player.item !== null;
      Input.releaseAll();
      const slot = itemSlotRect();
      Input.onDown({ ...e, clientX: slot.x + slot.w / 2, clientY: slot.y + slot.h / 2 });
      out.slot = Player.item === null && slot.x >= 0 && slot.y + slot.h <= VIEW.h;
      Player.item = 'falseMystery'; restartRun();
      out.reset = Player.item === null && Obstacles.list.length === 0;

      /* the results dialog: what the line paid, over the parked field */
      const dlg = document.getElementById('resultsDialog');
      const bar = document.getElementById('finishActions');
      Player.result = 2; Player.collisions = 3; Player.crouches = 7;
      App.set(ST.COMPLETED); Results.show(); render();
      out.dialogOpens = !dlg.hidden && bar.hidden;
      out.dialogPlace = document.getElementById('resultPlace').textContent === '2ND';
      out.dialogCounts = document.getElementById('resultHits').textContent === '3' &&
        document.getElementById('resultDucks').textContent === '7';
      /* the X hands the screen back without ending it */
      document.getElementById('resultsClose').click();
      out.dialogCloses = dlg.hidden && !bar.hidden;
      out.threeButtons = Array.prototype.map.call(
        bar.querySelectorAll('[data-act]'), b => b.getAttribute('data-act')
      ).join(',') === 'again,home,show-results';
      bar.querySelector('[data-act="show-results"]').click();
      out.dialogReopens = !dlg.hidden && bar.hidden;
      setLanguage('fr');
      out.dialogTranslates = document.getElementById('resultPlace').textContent === '2E';
      setLanguage('en');
      restartRun();
      out.dialogGone = dlg.hidden && bar.hidden && Results.open === false;
      return out;
    });
    for (const [name, ok] of Object.entries(r)) check(name, ok === true);
    check('item rendering has no browser errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[4c] the place readout changes colour when the place changes');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin(); Gen.stop(); Obstacles.clear();
      for (let i = 0; i < 60 * 3; i++) update(1 / 60);
      const out = {};
      /* the first frame of a run is not a change of place */
      out.quietAtRest = Run.posFlash === 0 && Run.posShown === Player.pos;

      /* put one rival past the human: a place lost, and the losing ink */
      const rival = Race.racers.find(p => p !== Player && p.pos > Player.pos);
      const was = Player.pos;
      rival.d = Player.d + 40; Race.rank(); Run.trackPlace(1 / 60);
      out.lostFlashes = Player.pos > was && Run.posFlash > 0.9 && Run.posDir === -1;
      out.lossInk = posFlashInk(Run.posDir) === POS_LOSS_INK;

      /* and it fades back to the resting ink, in the time it was given */
      const mid = Run.posFlash;
      for (let i = 0; i < 30; i++) Run.trackPlace(1 / 60);
      out.fades = Run.posFlash < mid && Run.posFlash > 0;
      for (let i = 0; i < 60 * 2; i++) Run.trackPlace(1 / 60);
      out.settles = Run.posFlash === 0;

      /* taking it back is the other ink, and standing still is neither */
      const back = Player.pos;
      rival.d = Player.d - 40; Race.rank(); Run.trackPlace(1 / 60);
      out.gainFlashes = Player.pos < back && Run.posDir === 1 &&
        posFlashInk(Run.posDir) === POS_GAIN_INK;
      const held = Run.posFlash;
      Run.trackPlace(1 / 60);
      out.noFlashWithoutChange = Run.posFlash < held;
      render();

      /* a new run starts on ink, whatever the last one ended on */
      restartRun();
      out.resets = Run.posFlash === 0 && Run.posShown === 0 && Run.posDir === 0;
      return out;
    });
    for (const [name, ok] of Object.entries(r)) check(name, ok === true);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[4d] star power, occupied slots and race-length ladder');
  for (const opts of [{ viewport: { width: 1200, height: 900 } },
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const { page, errs } = await newPage(browser, opts);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      Run.begin(); Gen.stop(); App.set(ST.PLAYING); Obstacles.clear();
      Race.racers.forEach((p, i) => { p.ai = null; p.place(0, -1000 - i * 10); });
      Player.place(1, 100); Race.camD = Player.d;
      const out = {};
      for (const p of [Player, Race.racers[1]]) {
        for (const item of ITEM_KINDS) {
          p.item = item; p.itemPickedAt = -3;
          const o = Obstacles.spawn({ kind: 'mystery', lane: p.lane }, p.d)[0];
          Race.mysteryTake(p, o);
          out['preserve ' + p.id + ' ' + item] = p.item === item && p.itemPickedAt === -3 && !Obstacles.list.includes(o);
        }
      }
      Player.item = 'star'; Player.slow = 2;
      out.use = Race.useItem(Player) && Player.star === 5 && Player.item === null && Player.slow === 0;
      const fast = Player.speedScale();
      Race.shoveForward(Player, { kind: 'superBoost' });
      out.fast = fast > 1 + (CFG.BOOST_SCALE - 1) * CFG.SUPER_BOOST_POWER && Player.speedScale() === fast;
      Race.shoveForward(Player, null);
      out.padCannotWeaken = Player.speedScale() === fast;
      Race.destroy(Player, 'edge'); Race.slowDown(Player);
      out.immune = Player.alive && Player.collisions === 0 && Player.slow === 0;
      const q = Race.racers[1]; q.item = null; q.place(0, Player.d);
      Race.move(q, 1); Race.separate();
      out.noShove = Player.lane === 1 && Player.d === 100 && Player.slow === 0;
      q.place(0, -1000);
      ['square', 'mover', 'barrier', 'falseMystery'].forEach(kind => {
        const o = new Obstacle(kind, .5, .25, 1, kind === 'barrier', [1], Player.d);
        if (kind === 'mover') o.move = { a: 1, b: 2, period: 1, phase: 0 };
        Obstacles.list.push(o); Player.crouch = kind === 'barrier';
        Race.update(0, 1);
        out['clears ' + kind] = Player.alive && !Obstacles.list.includes(o);
      });
      Player.crouch = false;
      const thin = new Obstacle('square', .5, .25, .1, false, [1], Player.d + 2);
      Obstacles.list.push(thin); Race.update(.05, 3);
      out.swept = !Obstacles.list.includes(thin) && Player.alive;

      /* a destroyed hazard breaks rather than vanishes */
      Settings.effects = 'full'; VFX.clear(); Player.star = 5;
      const brk = new Obstacle('square', .5, .25, 1, false, [1], Player.d);
      Obstacles.list.push(brk); Race.update(0, 1);
      out.breaksApart = !Obstacles.list.includes(brk) &&
        VFX.parts.some(q => q.shard) && VFX.ripples.length >= 2;
      out.shardsRideTheTrack = VFX.parts.filter(q => q.shard).every(q => q.w === true);
      /* a trap that catches a racer breaks too, in the film's own colour */
      VFX.clear(); Player.star = 0; Player.immune = 0;
      const trap = new Obstacle('falseMystery', .5, .25, 1, false, [1], Player.d);
      Obstacles.list.push(trap); Race.update(0, 1);
      out.trapBreaks = !Obstacles.list.includes(trap) && !Player.alive &&
        VFX.parts.some(q => q.shard && q.color === BUBBLE_INK);
      Player.place(1, 100); Obstacles.clear();
      /* reduced motion keeps the ring and drops the wreckage */
      Settings.effects = 'reduced'; VFX.clear(); Player.star = 5;
      const quiet = new Obstacle('square', .5, .25, 1, false, [1], Player.d);
      Obstacles.list.push(quiet); Race.update(0, 1);
      out.reducedBreak = !Obstacles.list.includes(quiet) &&
        VFX.ripples.length > 0 && !VFX.parts.some(q => q.shard);
      Settings.effects = 'full'; VFX.clear();

      /* the star is its own effect, and never the pads' */
      Player.place(1, 100); Player.item = 'star'; Player.boost = 0;
      out.notAShove = Race.useItem(Player) && Player.boost === 0 && Player.boostPower === 1;
      out.ownInk = Player.boostColor() === BOOST_INK &&
        Player.starColor() === 'rgb(' + starRGB(starPhase()) + ')';
      Player.starTrail.length = 0;
      for (let i = 0; i < 8; i++) Player.update(1 / 60, true);
      out.laysATrail = Player.starTrail.length >= 6 &&
        Player.starTrail.every(t => typeof t.d === 'number' && typeof t.xF === 'number');
      out.shedsLight = VFX.parts.some(q => q.spark);
      render();
      Player.star = 0;
      for (let i = 0; i < 40; i++) Player.update(1 / 60, true);
      out.trailRunsOut = Player.starTrail.length === 0;
      const left = Player.star;
      App.set(ST.PAUSED); update(.2);
      App.blocked = true; App.set(ST.PLAYING); update(.2); App.blocked = false;
      Run.startCountdown(false); update(.2);
      out.pause = Player.star === left;
      App.set(ST.PLAYING); Player.star = 5; Player.boost = 0;
      Race.update(4.99, 0);
      out.beforeExpiry = Player.star > 0 && Player.intangible();
      Race.update(.011, 0);
      out.expiry = Player.star === 0 && !Player.intangible() && Player.speedScale() === 1;
      Player.star = 5;
      for (let i = 0; i < 300; i++) Race.update(1 / 60, 0);
      out.exactFiveSeconds = Player.star === 0;
      const lethal = new Obstacle('square', .5, .25, 1, false, [1], Player.d);
      Obstacles.list.push(lethal); Race.update(0, 0);
      out.afterExpiry = !Player.alive && Obstacles.list.includes(lethal);
      Player.place(1, 100); Obstacles.clear();
      q.place(0, 200); q.item = 'star'; q.itemPickedAt = -10;
      q.ai = { next: 0 }; AI.think(q, .1);
      out.cpuStar = q.star === 5 && q.item === null;
      const initial = Run.raceSpan();
      out.projection = initial.from === 0 && initial.to > Race.leadD();
      Run.finalActive = true; Run.finalStart = 1000; Player.d = 1400; q.d = 1450;
      out.finalProjection = Run.raceSpan().to === 1620;
      Run.line = { d: 2000, from: 1500 };
      const span = Run.raceSpan(), g = raceLadderRect();
      out.exactSpan = span.to === 2000;
      out.scale = raceLadderY(0, g, span) === g.top + g.height && raceLadderY(1000, g, span) === g.top + g.height / 2 && raceLadderY(2000, g, span) === g.top;
      out.bounds = g.x >= 8 && g.x + 8 <= VIEW.w && g.top > hudTop() && g.top + g.height < itemSlotRect().y;
      Settings.effects = 'full';
      Race.clock = 0; const color = starRGB(starPhase()); Race.clock = .5;
      out.colorsMove = color !== starRGB(starPhase());
      Settings.effects = 'reduced'; const still = starRGB(starPhase()); Race.clock = 1;
      out.reduced = still === starRGB(starPhase());
      Player.star = 5; Player.item = 'star'; render();
      Run.cross(Player); out.finishClears = Player.star === 0;
      Run.begin();
      out.restartClears = Race.racers.every(p =>
        p.star === 0 && p.item === null && p.starTrail.length === 0);
      return out;
    });
    for (const [name, ok] of Object.entries(r)) check(name, ok === true);
    check('star and ladder render without errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  console.log('\n[5] how often a mystery square turns up, over whole runs');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      const perRun = [];
      const notInTheTable = KINDS.every(k => k.id !== 'mystery');
      let pastTheHorizon = 0;
      for (let run = 0; run < 3; run++) {
        App.set(ST.HOME); Run.begin();
        let mystery = 0, entries = 0, boost = 0, superBoost = 0, behindLead = 0;
        const os = Obstacles.spawn.bind(Obstacles);
        Obstacles.spawn = function (e, wd) {
          entries++;
          if (e.kind === 'mystery') {
            mystery++;
            /* the frontier is no longer where they come from */
            if (wd < Race.leadD()) behindLead++;
            if (wd > Race.leadD() + CFG.WORLD_AHEAD + 1e-6) pastTheHorizon++;
          }
          if (e.kind === 'boost') boost++;
          if (e.kind === 'superBoost') superBoost++;
          return os(e, wd);
        };
        for (let i = 0; i < 60 * 1500; i++) { update(1 / 60); if (App.state === ST.COMPLETED) break; }
        Obstacles.spawn = os;
        perRun.push({ entries, mystery, boost, superBoost, behindLead, clock: Race.clock });
      }
      return { perRun, notInTheTable, pastTheHorizon };
    });
    const sum = k => r.perRun.reduce((a, b) => a + b[k], 0);
    const my = sum('mystery') / 3, sb = sum('superBoost') / 3, ent = sum('entries');
    const every = sum('clock') / Math.max(1, sum('mystery'));
    check('they are no longer rolled with the hazards', r.notInTheTable === true);
    check('a regular sight still — several a run, and well clear of the old couple',
      my >= 4, JSON.stringify(r.perRun) + ' -> ' + my.toFixed(1) + '/run');
    check('more common than the rare pad it used to trail',
      my > sb, my.toFixed(1) + ' vs superBoost ' + sb.toFixed(1) + ' per run');
    check('still a minority of the track, not a carpet of them',
      sum('mystery') / ent < 0.12,
      (100 * sum('mystery') / ent).toFixed(1) + '% of entries');
    check('the rate the roll table used to give: one every three quarters of a minute',
      every > MYSTERY_EVERY_MIN && every < MYSTERY_EVERY_MAX,
      'one every ' + every.toFixed(1) + 's');
    check('they turn up behind the leader too, not only at the frontier',
      sum('behindLead') >= sum('mystery') * 0.25,
      sum('behindLead') + ' of ' + sum('mystery'));
    check('and never past the course the world has authored', r.pastTheHorizon === 0,
      r.pastTheHorizon + ' past the horizon');
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[5a] a mystery square turns up anywhere, at any moment');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      Run.begin(); Gen.stop(); App.set(ST.PLAYING); Obstacles.clear();
      Race.racers.forEach((p, i) => { p.ai = null; p.place(i % 3, 500 + i * 12); });
      Player.place(1, 500); Race.camD = Player.d;
      const out = {}, lo = Race.trailD(), hi = Race.leadD();

      /* sixty squares dropped by the real path, and where they landed */
      const spots = [];
      for (let i = 0; i < 60; i++) {
        Obstacles.clear();
        if (Mysteries.drop()) spots.push(Obstacles.list[0]);
      }
      out.dropsThem = spots.length >= 50;
      out.everyOneIsASquare = spots.every(o => o.kind === 'mystery' && o.harmful === false);
      out.insideTheField = spots.every(o =>
        o.wd >= lo + CFG.MYSTERY_TAIL - 1e-6 && o.wd + o.hM <= hi + CFG.WORLD_AHEAD + 1e-6);
      out.everyColumn = new Set(spots.map(o => o.lanes[0])).size === 3;
      /* the whole point: not only ahead of the leader, and not only off camera */
      out.behindTheLeader = spots.some(o => o.wd < hi);
      out.inPlainSight = spots.some(o => o.onCamera());
      out.expiresFromSpawning = spots.every(o =>
        Math.abs(o.expiresAt - (Race.clock + CFG.MYSTERY_LIFETIME)) < 1e-9);

      /* never on top of a hazard, a pickup or a racer */
      Obstacles.clear();
      for (let d = lo; d < hi + CFG.WORLD_AHEAD + 6; d += 2) {
        Obstacles.list.push(new Obstacle('bar3', .5, 1, 2, true, [0, 1, 2], d));
      }
      out.noRoomIsNoSquare = Mysteries.drop() === false &&
        Obstacles.list.every(o => o.kind !== 'mystery');
      /* and a square it could not place is not a square lost */
      Mysteries.next = Race.clock; Mysteries.update();
      out.looksAgainShortly = Mysteries.next > Race.clock &&
        Mysteries.next <= Race.clock + 0.5 + 1e-9;

      /* the course is read in order, so one dropped into the middle of it sorts */
      Obstacles.clear();
      Obstacles.spawn({ kind: 'square', lane: 0 }, hi + 30);
      Obstacles.spawn({ kind: 'square', lane: 0 }, lo + 2);
      let sorted = true;
      for (let i = 0; i < 20; i++) {
        Mysteries.drop();
        for (let j = 1; j < Obstacles.list.length; j++) {
          if (Obstacles.list[j].wd < Obstacles.list[j - 1].wd) sorted = false;
        }
      }
      out.courseStaysInOrder = sorted;

      /* nothing is ever dropped past the run-in the finish line reserves */
      Obstacles.clear();
      Gen.stopAt(hi + 5);
      const capped = [];
      for (let i = 0; i < 40; i++) {
        Obstacles.clear();
        if (Mysteries.drop()) capped.push(Obstacles.list[0]);
      }
      out.neverPastTheLine = capped.length > 0 &&
        capped.every(o => o.wd + o.hM <= hi + 5 + 1e-6);
      Gen.stopAt(Infinity);

      /* the clock it keeps is the race clock: a pause spends none of it */
      Obstacles.clear();
      Mysteries.next = Race.clock - 1;
      App.set(ST.PAUSED);
      for (let i = 0; i < 60; i++) update(1 / 60);
      out.pauseDropsNothing = Obstacles.list.length === 0 &&
        Mysteries.next === Race.clock - 1;
      App.set(ST.PLAYING);
      update(1 / 60);
      out.dueMeansNow = Obstacles.list.filter(o => o.kind === 'mystery').length === 1;
      out.thenWaitsAgain = Mysteries.next >= Race.clock + CFG.MYSTERY_GAP_MIN &&
        Mysteries.next <= Race.clock + CFG.MYSTERY_GAP_MAX;
      render();

      /* a new run starts the clock over, and going home stops it */
      Run.begin();
      out.restarts = Mysteries.enabled === true && Mysteries.next >= CFG.MYSTERY_GAP_MIN;
      Mysteries.stop();
      Mysteries.next = 0;
      update(1 / 60);
      out.stopped = Obstacles.list.every(o => o.kind !== 'mystery');
      Mysteries.reset();
      return out;
    });
    for (const [name, ok] of Object.entries(r)) check(name, ok === true);
    check('no errors while squares are dropped', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[5b] the crouch tally');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 3; i++) update(1 / 60);
      Gen.stop(); Obstacles.clear();          /* an empty track: nothing to die to */
      App.set(ST.PLAYING);
      /* crouchHeld is recomputed from real key state every tick, so press the
         key rather than setting the flag */
      const down = () => { Input.crouchKeys['s'] = true; };
      const up = () => { delete Input.crouchKeys['s']; };

      const seen = [];
      for (let n = 0; n < 10; n++) {
        Player.alive = true; Player.floating = false; Player.immune = 9;
        down(); for (let i = 0; i < 12; i++) update(1 / 60);
        up();   for (let i = 0; i < 12; i++) update(1 / 60);
        seen.push(Player.crouches);
      }
      const counts = seen.join(',');

      /* one duck is one duck, however long it is held */
      down(); for (let i = 0; i < 6; i++) update(1 / 60);
      const held0 = Player.crouches;
      for (let i = 0; i < 180; i++) update(1 / 60);
      const heldDelta = Player.crouches - held0;
      up(); update(1 / 60);

      /* a rival's ducks are its own, not the player's */
      const rival = Race.racers.find(p => !p.human);
      rival.alive = true; rival.floating = false; rival.crouchWas = false;
      const rBefore = rival.crouches, pBefore = Player.crouches;
      rival.crouch = true;  rival.update(1 / 60, true);
      rival.crouch = false; rival.update(1 / 60, true);
      rival.crouch = true;  rival.update(1 / 60, true);
      const rDelta = rival.crouches - rBefore, pDelta = Player.crouches - pBefore;

      /* a crouch the bubble cancels counts for nobody */
      const b = Race.racers.find(p => !p.human && p !== rival);
      b.alive = true; b.floating = true; b.bubble = 3; b.crouchWas = false;
      const bBefore = b.crouches;
      b.crouch = true; b.update(1 / 60, true);
      b.crouch = true; b.update(1 / 60, true);
      const bDelta = b.crouches - bBefore;
      b.floating = false;

      /* the square is drawn, and stays square as the count grows */
      const boxAt = n => {
        Player.crouches = n;
        render();
        /* find the tally's translucent panel by scanning the HUD column */
        const x = Math.round((PF.x + (IS_MOBILE ? INSET.l + 16 : 14) + 4) * VIEW.dpr);
        let top = -1, bot = -1;
        for (let y = 0; y < Math.round(PF.h * 0.4); y++) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          const grey = d[0] === d[1] && d[1] === d[2] && d[0] > 200 && d[0] < 250;
          if (grey && top < 0) top = y;
          if (grey) bot = y;
        }
        return bot - top;
      };
      const h1 = boxAt(7), h3 = boxAt(137);

      /* a fresh run starts the tally again */
      Run.begin();
      const afterRestart = Player.crouches;

      return { counts, heldDelta, rDelta, pDelta, bDelta, h1, h3, afterRestart };
    });
    check('every duck adds one', r.counts === '1,2,3,4,5,6,7,8,9,10', r.counts);
    check('holding one duck for three seconds is still one', r.heldDelta === 0, 'added ' + r.heldDelta);
    check("a rival's ducks land on its own tally", r.rDelta === 2 && r.pDelta === 0,
      'rival +' + r.rDelta + ', player +' + r.pDelta);
    check('a duck the bubble cancels counts for nobody', r.bDelta === 0, 'added ' + r.bDelta);
    check('the tally panel is drawn, and holds its height at three figures',
      r.h1 > 8 && Math.abs(r.h1 - r.h3) <= 1, 'one figure ' + r.h1 + 'px, three ' + r.h3 + 'px');
    check('a fresh run starts the tally again', r.afterRestart === 0, 'was ' + r.afterRestart);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[5c] a crouching marble wears nothing beside it');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 3; i++) update(1 / 60);
      Gen.stop(); Obstacles.clear(); VFX.clear();
      App.set(ST.PLAYING);
      Race.racers.forEach(p => { if (!p.human) { p.alive = false; p.coasting = true; p.d = -5000; } });
      Player.place(1, Player.d);
      Player.alive = true; Player.floating = false; Player.spawnT = 1;
      Player.slow = 0; Player.boost = 0; Player.immune = 0;

      /* The band either side of the marble, where the old action lines lived:
         they reached from about 1.3 to 2.1 radii out. Start at 1.15 so the
         standing marble's own outline — which moves when it shrinks, and is
         supposed to — is not mistaken for something drawn beside it. */
      const band = () => {
        const rr = playerRadius(), cx = Player.x(), cy = Player.y();
        const cols = [];
        for (const s of [-1, 1]) {
          for (let f = 1.15; f <= 2.2; f += 0.07) {
            for (let dy = -0.7; dy <= 0.7; dy += 0.14) {
              const d = ctx.getImageData(Math.round((cx + s * rr * f) * VIEW.dpr),
                                         Math.round((cy + rr * dy) * VIEW.dpr), 1, 1).data;
              cols.push(d[0] + ',' + d[1] + ',' + d[2]);
            }
          }
        }
        return cols.join(' ');
      };
      Player.crouch = false; Player.crouchAmt = 0; VFX.clear(); render();
      const standing = band();
      Player.crouch = true; Player.crouchAmt = 1; VFX.clear(); render();
      const crouching = band();
      /* and the bump ring is untouched — it was never a crouch mark */
      Player.crouch = false; Player.crouchAmt = 0; Player.slow = CFG.BUMP_SLOW_TIME;
      VFX.clear(); render();
      const slowed = band();
      Player.slow = 0;
      Obstacles.clear(); VFX.clear(); Settings.effects = 'full';
      Player.crouch = true; Player.crouchAmt = 1;
      Obstacles.spawn({ kind: 'bar3', crouch: true }, Player.d - 10);
      Run.passFX();
      const noDuckRing = VFX.ripples.length === 0 && VFX.parts.length > 0;
      return { same: standing === crouching, ringStillThere: slowed !== standing, noDuckRing };
    });
    check('passing under a barrier emits no ring', r.noDuckRing === true);
    check('crouching leaves the track beside the marble untouched', r.same === true);
    check('the bump ring is still drawn — it was never the crouch mark',
      r.ringStillThere === true);
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[6] the track stays fair at every speed');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      /* every consecutive pair the generator lays down must leave at least the
         reaction time it promised, measured in seconds of travel at the speed
         the course was written for */
      let worstGap = 1e9, pairs = 0, tooTight = 0;
      let lastWd = null, lastKind = null, lastMult = null;
      const os = Obstacles.spawn.bind(Obstacles);
      Obstacles.spawn = function (e, wd) {
        /* the metres between two entries were written with the multiplier in
           force at the FIRST of them — measuring against the second's reads a
           step boundary as a gap that was never actually laid down */
        if (lastWd !== null && wd > lastWd) {
          const secs = (wd - lastWd) / (CFG.BASE_SPEED * lastMult);
          pairs++;
          if (secs < worstGap) worstGap = secs;
          if (secs < CFG.REACTION_BASE - 1e-6) tooTight++;
        }
        lastWd = wd; lastKind = e.kind; lastMult = Run.mult;
        return os(e, wd);
      };
      for (let i = 0; i < 60 * 1500; i++) { update(1 / 60); if (App.state === ST.COMPLETED) break; }
      Obstacles.spawn = os;
      return { pairs, worstGap: +worstGap.toFixed(3), tooTight, base: CFG.REACTION_BASE };
    });
    check('no pair of obstacles is tighter than the reaction floor',
      r.tooTight === 0 && r.pairs > 100,
      r.tooTight + ' of ' + r.pairs + ' pairs, tightest ' + r.worstGap + 's vs floor ' + r.base + 's');
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[7] pause, restart and the completion panel');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 40; i++) update(1 / 60);
      const dBefore = Run.distance, multBefore = Run.mult;
      const timerBefore = Run.speedTimer;
      pauseGame(); render();
      const paused = App.state === ST.PAUSED;
      for (let i = 0; i < 60 * 3; i++) { update(1 / 60); render(); }
      /* three seconds behind the pause screen must cost the run nothing: not
         distance, and not a step of the climb it did not play for */
      const frozen = Math.abs(Run.distance - dBefore) < 1e-6 &&
                     Math.abs(Run.speedTimer - timerBefore) < 1e-6 &&
                     Run.mult === multBefore;
      resumeGame();                       /* counts back in before it runs */
      const counted = App.state === ST.COUNTDOWN;
      for (let i = 0; i < 60 * 5; i++) update(1 / 60);
      const moving = Run.distance > dBefore + 1;
      const keptSpeed = Run.mult >= multBefore;   /* climbs on, never restarts */
      /* restart from scratch */
      restartRun();
      const reset = Run.distance === 0 && Run.mult === 1 && Obstacles.list.length === 0;
      for (let i = 0; i < 60 * 1500; i++) { update(1 / 60); render(); if (App.state === ST.COMPLETED) break; }
      return { frozen, moving, reset, multBefore, paused, counted, keptSpeed,
               state: App.state,
               statSpeed: Run.mult.toFixed(2) + 'x',
               statDist: String(Run.distance),
               statPos: Player.result + ' / ' + Race.racers.length };
    });
    check('pause stops the run, its clock and its climb', r.paused === true && r.frozen === true);
    check('resume counts back in, then runs', r.counted === true && r.moving === true);
    check('the climb carries on from where it paused', r.keptSpeed === true, 'was ' + r.multBefore);
    check('restart clears distance, speed and the track', r.reset === true);
    check('the run reaches completion', r.state === 'COMPLETED', r.state);
    check('completion reports the final speed', r.statSpeed === '3.00x', r.statSpeed);
    check('completion reports distance and position', /\d/.test(r.statDist) && /\//.test(r.statPos),
      r.statDist + ' / ' + r.statPos);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[7b] the finish line, and the run-out past it');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      Settings.effects = 'full';
      App.set(ST.HOME); Run.begin();

      /* run until the line is planted, then look at where it went */
      for (let i = 0; i < 60 * 1500; i++) { update(1 / 60); if (Run.line) break; }
      const lineD = Run.line ? Run.line.d : 0;
      const aheadOfAll = Race.racers.every(p => p.d < lineD);
      const anyoneFinished = Race.racers.some(p => p.finished);

      /* it is a place on the track, not a place on the screen: it never moves */
      for (let i = 0; i < 60 * 1500; i++) {
        update(1 / 60); render();
        if (App.state === ST.COMPLETED) break;
      }
      const held = Run.line.d === lineD;
      const clearRunIn = Obstacles.list.every(o => o.wd + o.hM <= lineD + 1e-6);

      /* everybody crossed, once, and the places run 1..6 */
      const places = Race.racers.map(p => p.result).sort((a, b) => a - b);
      const allHome = Race.racers.every(p => p.finished && p.alive);
      const order = Race.finishOrder.map(p => p.result).join(',');

      /* the field parks in the order it finished: first place furthest out,
         every place behind it one step earlier, each in its own column */
      const marks = Race.racers.slice().sort((a, b) => a.result - b.result)
        .map(p => ({ place: p.result, lane: p.lane, d: p.d,
                     mark: Run.parkDistFor(p.result), onCam: p.onCamera() }));
      let descends = true, onMark = true, ownColumn = true, onCamera = true;
      for (let i = 0; i < marks.length; i++) {
        if (Math.abs(marks[i].d - marks[i].mark) > 1e-6) onMark = false;
        if (!marks[i].onCam) onCamera = false;
        if (i && marks[i].d >= marks[i - 1].d) descends = false;
        for (let j = 0; j < i; j++) {
          if (marks[i].lane === marks[j].lane && i - j < 3) ownColumn = false;
        }
      }
      /* and the last one home comes to rest clear of the band itself */
      const last = marks[marks.length - 1];
      const clearOfBand = last.d - Player.radiusM() > lineD + Run.lineDepth();

      /* a finisher is out of play: a hazard dropped on top of a parked racer
         cannot take the place it earned back off it */
      Obstacles.clear();
      Obstacles.spawn({ kind: 'square', lane: Player.lane }, Player.d - 1);
      Obstacles.spawn({ kind: 'bar3' }, Player.d - 1);
      const hits0 = Run.collisions, parkedAt = Player.d;
      for (let i = 0; i < 60; i++) update(1 / 60);
      const untouchable = Player.alive && Player.finished && Player.d === parkedAt;

      return {
        aheadOfAll, anyoneFinished, held, clearRunIn, places, allHome, order,
        descends, onMark, ownColumn, onCamera, clearOfBand, untouchable,
        hitsUnchanged: Run.collisions === hits0,
        camLocked: Race.camLock,
        /* the run is as long as the track to the line — the roll-out past it
           is not ground the racer had to earn */
        distanceAtLine: Math.abs(Run.distance - lineD) < Run.marbleM(),
        distanceShort: Run.distance < Player.d,
        pos: Player.pos, place: Player.result,
        statPos: Player.result + ' / ' + Race.racers.length
      };
    });
    check('the line is planted ahead of the whole field', r.aheadOfAll === true && r.anyoneFinished === false);
    check('it is a place on the track, and it stays there', r.held === true);
    check('nothing is ever authored past the line', r.clearRunIn === true);
    check('every racer crosses, and the places run 1 to 6',
      r.places.join(',') === '1,2,3,4,5,6' && r.allHome === true, r.places.join(','));
    check('the order recorded is the order they crossed in', r.order === '1,2,3,4,5,6', r.order);
    check('first place rolls furthest, every place behind stops earlier', r.descends === true);
    check('every finisher comes to rest exactly on its mark', r.onMark === true);
    check('no two racers park in the same column within three places', r.ownColumn === true);
    check('the last one home parks clear of the band', r.clearOfBand === true);
    check('the whole parked field is on camera', r.onCamera === true && r.camLocked === true);
    check('a hazard cannot take a place back off a parked racer',
      r.untouchable === true && r.hitsUnchanged === true);
    check('the run is measured to the line, not past it',
      r.distanceAtLine === true && r.distanceShort === true);
    check('the place the racer crossed in is the place it is given',
      r.pos === r.place && r.statPos === r.place + ' / 6', r.statPos);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[8] reduced motion holds every animation still');
  {
    const { page, errs } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      for (let i = 0; i < 60 * 3; i++) update(1 / 60);
      Gen.stop(); Obstacles.clear();
      Obstacles.spawn({ kind: 'mystery', lane: 0 }, Race.camD + 10);
      Obstacles.spawn({ kind: 'superBoost', lane: 2 }, Race.camD + 10);
      /* off-centre on purpose: dead centre is the white arrow both of these
         wear, which is meant to be constant */
      const sample = kind => {
        const o = Obstacles.list.filter(x => x.kind === kind)[0], rr = o.rect();
        const d = ctx.getImageData(Math.round((rr.x + rr.w * 0.14) * VIEW.dpr),
                                   Math.round((rr.y + rr.h * 0.14) * VIEW.dpr), 1, 1).data;
        return d[0] + ',' + d[1] + ',' + d[2];
      };
      /* the finish line wears the same film, and answers to the same clock */
      Run.line = { d: Race.camD + 6 };
      const sampleLine = () => {
        const h = metresToPx(Run.lineDepth()), yy = screenY(Run.line.d + Run.lineDepth());
        const d = ctx.getImageData(Math.round((PF.x + PF.w * 0.08) * VIEW.dpr),
                                   Math.round((yy + h * 0.5) * VIEW.dpr), 1, 1).data;
        return d[0] + ',' + d[1] + ',' + d[2];
      };
      const movingM = [], movingS = [], movingL = [], stillM = [], stillS = [], stillL = [];
      for (let s = 0; s < 4; s++) { Race.clock += 0.5; render(); movingM.push(sample('mystery')); movingS.push(sample('superBoost')); movingL.push(sampleLine()); }
      Settings.effects = 'reduced';
      for (let s = 0; s < 4; s++) { Race.clock += 0.9; render(); stillM.push(sample('mystery')); stillS.push(sample('superBoost')); stillL.push(sampleLine()); }
      Settings.effects = 'full';
      Run.line = null;
      return {
        mysteryMoves: new Set(movingM).size > 1, superMoves: new Set(movingS).size > 1,
        mysteryStill: new Set(stillM).size === 1, superStill: new Set(stillS).size === 1,
        lineMoves: new Set(movingL).size > 1, lineStill: new Set(stillL).size === 1
      };
    });
    check('the mystery square animates with full effects', r.mysteryMoves === true);
    check('the rare pad animates with full effects', r.superMoves === true);
    check('the mystery square holds still under reduced motion', r.mysteryStill === true);
    check('the rare pad holds still under reduced motion', r.superStill === true);
    check('the finish line animates with full effects', r.lineMoves === true);
    check('the finish line holds still under reduced motion', r.lineStill === true);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[9] both languages are complete');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      const en = Object.keys(I18N.en), fr = Object.keys(I18N.fr);
      const missingFr = en.filter(k => !(k in I18N.fr));
      const missingEn = fr.filter(k => !(k in I18N.en));
      const nodes = document.querySelectorAll('[data-i18n]');
      const unknown = [];
      for (let i = 0; i < nodes.length; i++) {
        const k = nodes[i].getAttribute('data-i18n');
        if (!(k in I18N.en)) unknown.push(k);
      }
      Settings.lang = 'en'; applyI18n();
      const enGoal = t('htGoal'), enMys = t('htMystery');
      Settings.lang = 'fr'; applyI18n();
      const frGoal = t('htGoal'), frMys = t('htMystery');
      Settings.lang = 'en'; applyI18n();
      return { missingFr, missingEn, unknown, enGoal, frGoal,
               enMys: enMys.length, frMys: frMys.length,
               leftover: [enGoal, frGoal, enMys, frMys].filter(s => s.indexOf('{') >= 0).length };
    });
    check('no key is missing from French', r.missingFr.length === 0, r.missingFr.join(','));
    check('no key is missing from English', r.missingEn.length === 0, r.missingEn.join(','));
    check('every data-i18n in the markup has a string', r.unknown.length === 0, r.unknown.join(','));
    check('the ceiling is interpolated, not left as a token', r.leftover === 0 &&
      r.enGoal.indexOf('3.00x') >= 0 && r.frGoal.indexOf('3.00x') >= 0, r.enGoal);
    check('the mystery square is documented in both languages', r.enMys > 40 && r.frMys > 40,
      'en=' + r.enMys + ' fr=' + r.frMys);
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[10] full runs across difficulty, effects and device');
  for (const cfg of [
    { cpu: 'brutal', effects: 'full', mobile: false },
    { cpu: 'normal', effects: 'reduced', mobile: false },
    { cpu: 'easy', effects: 'full', mobile: true }
  ]) {
    const opts = cfg.mobile
      ? { viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1200, height: 900 } };
    const { page, errs } = await newPage(browser, opts);
    const r = await page.evaluate((cfg) => {
      Settings.lang = 'en'; Settings.muted = true; Settings.cpu = cfg.cpu;
      Settings.effects = cfg.effects; App.blocked = false;
      App.set(ST.HOME); Run.begin();
      let maxParts = 0, maxLines = 0;
      for (let i = 0; i < 60 * 1500; i++) {
        update(1 / 60); render();
        if (VFX.parts.length > maxParts) maxParts = VFX.parts.length;
        if (VFX.lines.length > maxLines) maxLines = VFX.lines.length;
        if (App.state === ST.COMPLETED) break;
      }
      return { state: App.state, mult: Run.mult, dist: Math.round(Run.distance), maxParts, maxLines };
    }, cfg);
    const tag = cfg.cpu + '/' + cfg.effects + (cfg.mobile ? '/mobile' : '/desktop');
    check(tag + ' completes at 3.00x', r.state === 'COMPLETED' && r.mult === 3,
      r.state + ' @' + r.mult);
    check(tag + ' keeps effect counts sane', r.maxParts < 900 && r.maxLines < 400,
      'parts=' + r.maxParts + ' lines=' + r.maxLines);
    check(tag + ' runs clean', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n' + '='.repeat(62));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
