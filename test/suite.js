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
      /* Race.separate() nudges racers that share a lane out of each other, which
         moves d without the speed formula having anything to do with it. Skip
         only the frames where that was possible at all — a rival alive, in the
         same lane, close enough to push — and demand the rest match exactly. */
      const crowded = () => {
        for (let n = 0; n < Race.racers.length; n++) {
          const q = Race.racers[n];
          if (q === Player || !q.alive || q.finished || q.inBubble()) continue;
          if (q.lane === Player.lane && Math.abs(q.d - Player.d) < 6) return true;
        }
        return false;
      };
      let checked = 0, worst = 0, off = 0, skipped = 0;
      for (let i = 0; i < 60 * 900; i++) {
        const s0 = App.state, before = Player.d, g = Run.groundMult();
        const stable = Player.alive && !Player.inBubble();
        const m0 = Run.mult, near0 = crowded();
        update(1 / 60);
        if ((s0 === ST.PLAYING || s0 === ST.RESPAWNING) && stable &&
            Player.alive && !Player.inBubble() && Run.mult === m0) {
          if (near0 || crowded()) { skipped++; }
          else {
            const err = Math.abs((Player.d - before) - CFG.BASE_SPEED * g / 60);
            checked++;
            if (err > 1e-9) off++;
            if (err > worst) worst = err;
          }
        }
        if (App.state === ST.COMPLETED) break;
      }
      return { checked, off, worst, skipped };
    });
    check('ground travel is exactly the multiplier whenever nothing else moved the racer',
      r.checked > 3000 && r.off === 0,
      r.off + ' of ' + r.checked + ' frames off (worst ' + r.worst.toExponential(2) +
      'm), ' + r.skipped + ' skipped as crowded');
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

      /* taking one grants nothing at all: the racer leaves it exactly as it
         arrived, and the square lights up to say it was reached */
      const p0 = Race.racers[0];
      p0.alive = true; p0.boost = 0; p0.boostPower = 1; p0.immune = 0; p0.slow = 0;
      const beforeTake = [p0.boost, p0.boostPower, p0.immune, p0.slow,
                          p0.speedScale(), p0.d].join('|');
      o.flash = 0;
      Race.mysteryTake(p0, o);
      out.unchanged = [p0.boost, p0.boostPower, p0.immune, p0.slow,
                       p0.speedScale(), p0.d].join('|') === beforeTake;
      out.lit = o.flash > 0;
      out.noRollTable = typeof window.rollMystery === 'undefined' &&
                        typeof window.MYSTERY_ODDS === 'undefined';

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

      /* a second racer through opens the same square for themselves */
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
      return out;
    });
    check('the square is a pickup, not a hazard', r.harmful === false);
    check('the square is square', r.square === true);
    check('taking one grants nothing — no shove, no cover, no setback', r.unchanged === true);
    check('but the square lights up to say it was reached', r.lit === true);
    check('the outcome table is gone rather than left dormant', r.noRollTable === true);
    check('one racer takes a given square exactly once', r.takesBySameRacer === 1, 'took ' + r.takesBySameRacer);
    check('a taken square stays on the track for the rest of the field', r.stillOnTrack === true);
    check('the next racer through opens it for themselves',
      r.takesByOther === 1 && r.seenIds === 2, 'took ' + r.takesByOther + ', seen by ' + r.seenIds);
    check('a racer in a respawn bubble takes nothing', r.bubbleTakes === 0, 'took ' + r.bubbleTakes);
    check('no errors', errs.length === 0, errs.join(' | '));
    await page.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('\n[5] how often a mystery square turns up');
  {
    const { page } = await newPage(browser);
    const r = await page.evaluate(() => {
      Settings.lang = 'en'; Settings.muted = true; App.blocked = false;
      const perRun = [];
      for (let run = 0; run < 3; run++) {
        App.set(ST.HOME); Run.begin();
        let mystery = 0, entries = 0, boost = 0, superBoost = 0;
        const os = Obstacles.spawn.bind(Obstacles);
        Obstacles.spawn = function (e, wd) {
          entries++;
          if (e.kind === 'mystery') mystery++;
          if (e.kind === 'boost') boost++;
          if (e.kind === 'superBoost') superBoost++;
          return os(e, wd);
        };
        for (let i = 0; i < 60 * 1500; i++) { update(1 / 60); if (App.state === ST.COMPLETED) break; }
        Obstacles.spawn = os;
        perRun.push({ entries, mystery, boost, superBoost });
      }
      return { perRun };
    });
    const sum = k => r.perRun.reduce((a, b) => a + b[k], 0);
    const my = sum('mystery') / 3, sb = sum('superBoost') / 3, ent = sum('entries');
    check('a regular sight now — several a run, and well clear of the old couple',
      my >= 4, JSON.stringify(r.perRun) + ' -> ' + my.toFixed(1) + '/run');
    check('more common than the rare pad it used to trail',
      my > sb, my.toFixed(1) + ' vs superBoost ' + sb.toFixed(1) + ' per run');
    check('still a minority of the track, not a carpet of them',
      sum('mystery') / ent < 0.12,
      (100 * sum('mystery') / ent).toFixed(1) + '% of entries');
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
      return { same: standing === crouching, ringStillThere: slowed !== standing };
    });
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
               statSpeed: document.getElementById('statSpeed').textContent,
               statDist: document.getElementById('statDist').textContent,
               statPos: document.getElementById('statPos').textContent };
    });
    check('pause stops the run, its clock and its climb', r.paused === true && r.frozen === true);
    check('resume counts back in, then runs', r.counted === true && r.moving === true);
    check('the climb carries on from where it paused', r.keptSpeed === true, 'was ' + r.multBefore);
    check('restart clears distance, speed and the track', r.reset === true);
    check('the run reaches the completion panel', r.state === 'COMPLETED', r.state);
    check('completion reports the final speed', r.statSpeed === '3.00x', r.statSpeed);
    check('completion reports distance and position', /\d/.test(r.statDist) && /\//.test(r.statPos),
      r.statDist + ' / ' + r.statPos);
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
      const movingM = [], movingS = [], stillM = [], stillS = [];
      for (let s = 0; s < 4; s++) { Race.clock += 0.5; render(); movingM.push(sample('mystery')); movingS.push(sample('superBoost')); }
      Settings.effects = 'reduced';
      for (let s = 0; s < 4; s++) { Race.clock += 0.9; render(); stillM.push(sample('mystery')); stillS.push(sample('superBoost')); }
      Settings.effects = 'full';
      return {
        mysteryMoves: new Set(movingM).size > 1, superMoves: new Set(movingS).size > 1,
        mysteryStill: new Set(stillM).size === 1, superStill: new Set(stillS).size === 1
      };
    });
    check('the mystery square animates with full effects', r.mysteryMoves === true);
    check('the rare pad animates with full effects', r.superMoves === true);
    check('the mystery square holds still under reduced motion', r.mysteryStill === true);
    check('the rare pad holds still under reduced motion', r.superStill === true);
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
