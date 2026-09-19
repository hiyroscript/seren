#!/usr/bin/env node
/* SEREN - a dependency-free check over the things that break silently.
 *
 *   node tools/check.mjs
 *
 * The game has no build step, so nothing catches a typo'd selector, a
 * translation key that does not exist, or a second `const` with a name another
 * file already used. Those are exactly the failures that either kill the page
 * on load or, worse, do nothing visible until somebody plays the screen that
 * uses them. This walks the source and reports them.
 *
 * It is plain Node with no dependencies and it touches nothing - the site never
 * loads this file, and there is no package.json to install. Exits non-zero if
 * anything fails, so it works in a hook or an action if you ever want one.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let failures = 0, warnings = 0;
const pass = (m) => console.log("  ok    " + m);
const fail = (m) => { failures++; console.log("  FAIL  " + m); };
const warn = (m) => { warnings++; console.log("  warn  " + m); };
const head = (m) => console.log("\n" + m);

/* The documented load order. core first because everything uses its helpers,
   data before runtime because the G literal reads ULT_TIME, settings after the
   systems it drives and the focus gate it borrows, main last because it is the
   only file that starts anything. */
const ORDER = ["core", "i18n", "data", "audio", "runtime", "ui", "settings",
               "local", "ai", "mechanics", "race", "render", "hud", "input", "main"];

/* Window properties a top-level declaration would shadow or overwrite. Not the
   whole of `window` - Node cannot see that - but the names that are plausible
   as game identifiers and would actually collide. */
const RISKY_GLOBALS = new Set([
  "name", "status", "length", "top", "self", "parent", "origin", "event",
  "screen", "history", "location", "closed", "frames", "external", "opener",
  "find", "focus", "blur", "open", "close", "print", "stop", "alert", "confirm",
  "prompt", "scroll", "scrollX", "scrollY", "innerWidth", "innerHeight", "onload",
  "navigator", "document", "localStorage", "sessionStorage", "performance",
  "crypto", "caches", "fetch", "origin", "isSecureContext", "menubar", "toolbar"
]);

/* ---------------------------------------------------------------- helpers */

/* Strip comments and string bodies so a scan cannot trip over a `const` inside
   a comment or a `#id` inside a regex. Keeps line structure intact. */
function strip(src) {
  let out = "", i = 0, line = true;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, " ");
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i);
      out += " ".repeat((end < 0 ? src.length : end) - i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* Top-level declarations: column-zero const/let/var/function, comments gone. */
function topLevelNames(src) {
  const names = [];
  for (const raw of strip(src).split("\n")) {
    if (!raw || /^\s/.test(raw)) continue;
    let m = /^(?:const|let|var)\s+(.*)$/.exec(raw);
    if (m) {
      for (const n of m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)) names.push(n[1]);
      continue;
    }
    m = /^function\s+([A-Za-z_$][\w$]*)/.exec(raw);
    if (m) names.push(m[1]);
  }
  return names;
}

/* Pull one brace-balanced object literal out of a source file by its name. */
function objectLiteral(src, declName) {
  const clean = strip(src);
  const at = clean.indexOf("const " + declName + " = {");
  if (at < 0) return null;
  const open = clean.indexOf("{", at);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = clean[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return vm.runInNewContext("(" + src.slice(open, end + 1) + ")"); }
  catch { return null; }
}

/* ------------------------------------------------------------ the checks */

const html = read("index.html");

head("index.html wiring");

const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((m) => m[1]).filter((h) => !/^https?:/.test(h));
for (const s of styles) {
  existsSync(join(ROOT, s)) ? pass(`stylesheet ${s} exists`) : fail(`stylesheet ${s} is missing`);
}
if (!styles.length) fail("no local stylesheet is linked");

const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
const inline = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.test(html);
inline ? fail("index.html still contains an inline <script> block") : pass("no inline <script> blocks");
/<style[\s>]/.test(html) ? fail("index.html still contains a <style> block") : pass("no inline <style> blocks");

for (const s of scripts) {
  if (!existsSync(join(ROOT, s))) fail(`script ${s} is missing`);
}
const got = scripts.map((s) => s.replace(/^js\//, "").replace(/\.js$/, ""));
if (got.join() === ORDER.join()) pass(`all ${ORDER.length} scripts present, in dependency order`);
else fail(`script order is\n          ${got.join(" -> ")}\n        expected\n          ${ORDER.join(" -> ")}`);

const undeferred = scripts.filter(
  (s) => !new RegExp(`<script[^>]*\\bdefer\\b[^>]*src="${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html));
undeferred.length
  ? undeferred.forEach((s) => fail(`${s} is not loaded with defer`))
  : pass("every script is deferred");

head("JavaScript syntax");
const sources = {};
for (const n of ORDER) {
  const p = `js/${n}.js`;
  if (!existsSync(join(ROOT, p))) { fail(`${p} is missing`); continue; }
  sources[n] = read(p);
  try { new vm.Script(sources[n], { filename: p }); }
  catch (e) { fail(`${p}: ${e.message}`); }
}
if (Object.keys(sources).length === ORDER.length) pass(`${ORDER.length} files parse`);

head("Saved-data migration");
for (const scenario of [
  { name: "fresh install", seed: {}, expected: [null, null, null] },
  { name: "previous saves", seed: { "redline.lang": "fr", "redline.sound": "0", "redline.best": "4820" }, expected: ["fr", "0", "4820"] },
  { name: "existing Seren saves win", seed: { "redline.lang": "fr", "redline.sound": "1", "redline.best": "4820", "seren.lang": "en", "seren.sound": "0", "seren.best": "0" }, expected: ["en", "0", "0"] },
  { name: "blocked writes retain migrated values in memory", seed: { "redline.lang": "fr", "redline.sound": "0", "redline.best": "4820" }, blockWrite: true, expected: ["fr", "0", "4820"] },
  { name: "blocked storage still supports session saves", seed: {}, blockRead: true, blockWrite: true, expected: [null, null, null] }
]) {
  try {
    const saved = new Map(Object.entries(scenario.seed));
    const context = vm.createContext({
      window: {},
      localStorage: {
        getItem(k) { if (scenario.blockRead) throw new Error("blocked"); return saved.get(k) ?? null; },
        setItem(k, v) { if (scenario.blockWrite) throw new Error("blocked"); saved.set(k, v); }
      }
    });
    vm.runInContext(sources.core, context);
    const actual = vm.runInContext('["lang", "sound", "best"].map(k => store.get("seren." + k))', context);
    assert.deepEqual(Array.from(actual), scenario.expected);
    for (const [key, value] of Object.entries(scenario.seed)) assert.equal(saved.get(key), value);
    if (!scenario.blockWrite) {
      scenario.expected.forEach((value, i) => assert.equal(saved.get("seren." + ["lang", "sound", "best"][i]) ?? null, value));
    }
    vm.runInContext('store.set("seren.best", "5000")', context);
    assert.equal(vm.runInContext('store.get("seren.best")', context), "5000");
    pass(scenario.name);
  } catch (e) { fail(`${scenario.name}: ${e.message}`); }
}

head("Global scope");
const owner = new Map();
const dupes = [];
for (const n of ORDER) {
  if (!sources[n]) continue;
  for (const name of topLevelNames(sources[n])) {
    if (owner.has(name)) dupes.push(`${name} declared in both ${owner.get(name)}.js and ${n}.js`);
    else owner.set(name, n);
  }
}
dupes.length
  ? dupes.forEach((d) => fail("duplicate top-level declaration: " + d))
  : pass(`${owner.size} top-level names, all unique`);

const clashes = [...owner.keys()].filter((n) => RISKY_GLOBALS.has(n));
clashes.length
  ? clashes.forEach((c) => fail(`${c} (${owner.get(c)}.js) shadows a browser global`))
  : pass("no declaration shadows a known browser global");

for (const n of ORDER) {
  if (sources[n] && !/^"use strict";/.test(sources[n])) fail(`js/${n}.js does not start with "use strict"`);
}

head("DOM contract");
const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const ids = new Set(idList);
const repeatedIds = idList.filter((id, i) => idList.indexOf(id) !== i);
if(repeatedIds.length) fail("duplicate element IDs: " + repeatedIds.join(", "));
else pass("all element IDs are unique");
let literal = 0, dynamic = 0;
const missing = new Set();
for (const n of ORDER) {
  if (!sources[n]) continue;
  const src = sources[n];
  for (const m of src.matchAll(/(?:\$|querySelector(?:All)?)\(\s*"#([A-Za-z][\w-]*)"\s*\)/g)) {
    literal++;
    if (!ids.has(m[1])) missing.add(`#${m[1]} (js/${n}.js) is not in index.html`);
  }
  for (const _ of src.matchAll(/(?:\$|querySelector)\(\s*"#[^"]*"\s*\+/g)) dynamic++;
}
missing.size
  ? [...missing].forEach((m) => fail("selector " + m))
  : pass(`${literal} literal #id selectors all resolve (${dynamic} built at runtime, not checked)`);

head("Translations");
const STR = objectLiteral(sources.i18n || "", "STR");
if (!STR) fail("could not read STR out of js/i18n.js");
else {
  const keys = new Set(Object.keys(STR));
  pass(`${keys.size} strings defined`);

  const langs = new Set();
  for (const v of Object.values(STR)) Object.keys(v).forEach((l) => langs.add(l));
  const incomplete = Object.entries(STR)
    .filter(([, v]) => [...langs].some((l) => typeof v[l] !== "string"))
    .map(([k]) => k);
  incomplete.length
    ? incomplete.forEach((k) => fail(`STR.${k} is missing a translation`))
    : pass(`every string has all ${langs.size} languages (${[...langs].join(", ")})`);

  const used = new Set();
  for (const m of html.matchAll(/\bdata-i18n="([^"]+)"/g)) {
    used.add(m[1]);
    if (!keys.has(m[1])) fail(`data-i18n="${m[1]}" in index.html has no string`);
  }
  /* Icon-only controls carry their name in aria-label, translated on the same
     sweep. A missing string there is a control nobody on a screen reader can
     name, which is exactly as broken as a blank button. */
  for (const m of html.matchAll(/\bdata-i18n-aria="([^"]+)"/g)) {
    used.add(m[1]);
    if (!keys.has(m[1])) fail(`data-i18n-aria="${m[1]}" in index.html has no string`);
  }
  for (const n of ORDER) {
    if (!sources[n]) continue;
    for (const m of sources[n].matchAll(/\bt\(\s*"([A-Za-z][\w]*)"\s*\)/g)) {
      used.add(m[1]);
      if (!keys.has(m[1])) fail(`t("${m[1]}") in js/${n}.js has no string`);
    }
  }
  pass(`${used.size} keys referenced literally and all resolve`);

  /* Many keys are reached by concatenation - t(id + "Ult"), t("place" + n) -
     so an unreferenced key is a hint, not a fault. */
  const orphans = [...keys].filter((k) => !used.has(k));
  if (orphans.length) warn(`${orphans.length} strings are never referenced literally (most are built at runtime)`);
}

head("Translation rendering with saved preferences");
for (const scenario of [
  { name: "first visit", seed: {}, language: null },
  { name: "saved English", seed: { "seren.lang": "en" }, language: "en" },
  { name: "saved French", seed: { "seren.lang": "fr" }, language: "fr" },
  { name: "migrated French", seed: { "redline.lang": "fr" }, language: "fr" },
  { name: "invalid migrated language", seed: { "redline.lang": "undefined" }, language: null },
  ...["undefined", "null", "en-US", "", "de"].map(value => ({
    name: `invalid saved language ${JSON.stringify(value)}`,
    seed: { "seren.lang": value }, language: null
  }))
]) {
  try {
    const saved = new Map(Object.entries(scenario.seed));
    const labels = [...html.matchAll(/\bdata-i18n="([^"]+)"/g)].map(([, key]) => ({
      key, textContent: "static fallback", getAttribute() { return key; }
    }));
    const aria = [...html.matchAll(/\bdata-i18n-aria="([^"]+)"/g)].map(([, key]) => ({
      key, label: "static fallback",
      getAttribute() { return key; },
      setAttribute(name, value) { if (name === "aria-label") this.label = value; }
    }));
    const track = { textContent: "static track" };
    const document = {
      documentElement: {},
      querySelectorAll: selector => selector === "[data-i18n-aria]" ? aria : labels,
      querySelector: selector => selector === "#trackName" ? track
        : selector === "#cars" ? { classList: { contains: () => false } } : null
    };
    const context = vm.createContext({ document, window: {}, localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value)
    } });
    vm.runInContext(sources.core + "\n" + sources.i18n, context);
    assert.equal(vm.runInContext("lang", context), scenario.language);
    vm.runInContext("applyLang()", context);
    const language = scenario.language || "en";
    assert.equal(document.documentElement.lang, language);
    for (const label of labels) {
      assert.equal(label.textContent, STR[label.key][language], label.key);
      assert.ok(label.textContent.trim(), `${label.key} must not be blank`);
    }
    for (const control of aria) {
      assert.equal(control.label, STR[control.key][language], control.key);
      assert.ok(control.label.trim(), `${control.key} must not be blank`);
    }
    assert.equal(track.textContent, STR.trackCity[language]);
    // Exercise the actual renderer's fallback for incomplete and unknown keys,
    // including a bad language introduced after startup.
    vm.runInContext('lang = "fr"; delete STR.start.fr; applyLang()', context);
    assert.equal(labels.find(label => label.key === "start").textContent, STR.start.en);
    labels.push({ key: "unknownLabel", getAttribute: () => "unknownLabel" });
    vm.runInContext('lang = "unsupported"; curTrackKey = "unknownTrack"; applyLang()', context);
    assert.equal(document.documentElement.lang, "en");
    assert.equal(labels.at(-1).textContent, "unknownLabel");
    assert.equal(track.textContent, "unknownTrack");
    pass(scenario.name);
  } catch (e) { fail(`${scenario.name}: ${e.message}`); }
}

head("Data tables");
const CARS = objectLiteral(sources.data || "", "CARS");
if (!CARS) warn("could not read CARS out of js/data.js");
else {
  const carIds = Object.keys(CARS);
  const drawn = new Set([...(sources.render || "").matchAll(/p\.style === "(\w+)"/g)].map((m) => m[1]));
  for (const id of carIds) {
    const c = CARS[id];
    if (!drawn.has(c.style)) fail(`car ${id} uses style "${c.style}" with no branch in drawCar`);
    if (STR && !STR[id]) fail(`car ${id} has no name string`);
    if (STR && !STR[id + "Ult"]) fail(`car ${id} has no ultimate description`);
    if (!ids.has("car" + id[0].toUpperCase() + id.slice(1))) fail(`car ${id} has no button in index.html`);
    if (!new RegExp(`data-car="${id}"`).test(html)) fail(`car ${id} has no select-screen canvas`);
  }
  pass(`${carIds.length} cars: models, strings, buttons and ultimates all wired`);
}

/* One CONDITIONS table, six entries, and every renderer reading it. The
   order of the keys is the order badges stack in, so it is pinned here too. */
const CONDITIONS = objectLiteral(sources.data || "", "CONDITIONS");
const COND_PATHS = objectLiteral(sources.hud || "", "COND_PATHS");
if (!CONDITIONS) fail("could not read CONDITIONS out of js/data.js");
else {
  const ids = Object.keys(CONDITIONS);
  const want = ["invulnerable", "boosted", "slowed", "obscured", "skidded",
                "mindControlled"];
  ids.join() === want.join()
    ? pass(`conditions are exactly ${want.join(", ")}, in priority order`)
    : fail(`conditions are ${ids.join(", ")}, expected ${want.join(", ")}`);
  for (const gone of ["launched", "winner", "immune", "cluttered", "slippery"]) {
    if (CONDITIONS[gone]) fail(`condition "${gone}" still exists in CONDITIONS`);
  }
  const buffs = ids.filter((id) => CONDITIONS[id].type === "buff");
  const debuffs = ids.filter((id) => CONDITIONS[id].type === "debuff");
  buffs.join() === "invulnerable,boosted"
    ? pass("Buff holds Invulnerable and Boosted")
    : fail(`Buff holds ${buffs.join(", ")}`);
  debuffs.join() === "slowed,obscured,skidded,mindControlled"
    ? pass("Debuff holds Slowed, Obscured, Skidded and Mind Controlled")
    : fail(`Debuff holds ${debuffs.join(", ")}`);
  const cols = new Set();
  for (const [id, c] of Object.entries(CONDITIONS)) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.col || "")) fail(`condition ${id} has no colour`);
    if (cols.has(c.col)) fail(`condition ${id} shares its colour with another`);
    cols.add(c.col);
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.ink || "")) fail(`condition ${id} has no icon ink`);
    if (COND_PATHS && !COND_PATHS[c.icon]) fail(`condition ${id} has no icon artwork ("${c.icon}")`);
    if (STR && !STR[c.key]) fail(`condition ${id} has no name string`);
    if (STR && !STR[id + "Info"]) fail(`condition ${id} has no garage description (${id}Info)`);
  }
  for (const k of ["condBuff", "condDebuff", "tabConditions"]) {
    if (STR && !STR[k]) fail(`the Conditions page has no ${k} string`);
  }
  if (COND_PATHS) pass(`${Object.keys(COND_PATHS).length} condition icons, all drawn from one path table`);
}

/* The airborne launch is gone, so nothing may quietly keep a piece of it -
   not a constant, not a field, not a meter, not a control legend. */
head("The launch is gone");
const LAUNCH_BANNED = [
  /\bAIR_[A-Z]/, /\bairborne\b/, /\bairMeter\b/, /\bairWind\b/, /\bairPow\b/,
  /\bairT\b/, /\bairMax\b/, /\blaunchCD\b/, /\bbrakeOn\b/, /\bbrakeKey\b/,
  /\bbrakePtr\b/, /\bbrakeSpent\b/, /\bbrakeHeld\b/, /\bpadBrake\b/,
  /\bhumanBrake\b/, /\blaunchCar\b/, /\blaunchRival\b/, /\bbotAirWant\b/,
  /\bkillLaunch\b/, /\bupdateLaunch\b/, /\bairHop\b/, /\brivalHop\b/,
  /\bEFFECTS\b/, /\bscrubBad\b/, /\bimmuneScrub\b/, /\bIMMUNE_TIME\b/,
  /\bLAUNCH_TIME\b/, /\bLAUNCH_BOOST\b/
];
let launchHits = 0;
for (const n of ORDER) {
  if (!sources[n]) continue;
  const clean = strip(sources[n]);
  for (const re of LAUNCH_BANNED) {
    if (re.test(clean)) { fail(`js/${n}.js still references ${re.source}`); launchHits++; }
  }
}
if (!launchHits) pass(`no launch state, constants or helpers in ${ORDER.length} source files`);

const css = read("css/app.css");
const DEAD_IDS = ["airWrap", "airFill", "airZone", "airMark", "airWind", "effList", "immuneTag"];
const stillThere = DEAD_IDS.filter((id) => ids.has(id) || new RegExp("#" + id + "\\b").test(css));
stillThere.length
  ? stillThere.forEach((id) => fail(`#${id} is still in index.html or css/app.css`))
  : pass("the launch meter, the effect pills and the immune tag are gone from the page");
["condList", "boostWrap", "meterRail", "tabConditions"].forEach(function (id) {
  ids.has(id) ? pass(`#${id} is in index.html`) : fail(`#${id} is missing from index.html`);
});
if (/data-i18n="k6"/.test(html) || /tabEffects/.test(html))
  fail("index.html still advertises the launch control or the Effects tab");
else pass("no launch control legend and no Effects tab");

const ITEMS = objectLiteral(sources.data || "", "ITEMS");
const RARITY = objectLiteral(sources.data || "", "RARITY");
if (ITEMS && RARITY) {
  const paths = objectLiteral(sources.hud || "", "ITEM_PATHS");
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!RARITY[it.rarity]) fail(`item ${id} has unknown rarity "${it.rarity}"`);
    if (paths && !paths[id]) fail(`item ${id} has no icon artwork in ITEM_PATHS`);
    if (STR && !STR[it.key]) fail(`item ${id} has no name string`);
  }
  const total = Object.values(ITEMS).reduce((s, it) => s + RARITY[it.rarity].weight, 0);
  const odds = Object.entries(ITEMS)
    .map(([id, it]) => `${id} ${(RARITY[it.rarity].weight / total * 100).toFixed(1)}%`).join(", ");
  pass(`${Object.keys(ITEMS).length} items wired - drop odds: ${odds}`);
}

/* The Mystery Bubble rewards are temporarily off behind one named gate. The
   point of the gate is that it is a switch and not a deletion, so what this
   checks is that the switch exists, that it is the only thing turning the
   rewards off, and that nothing was quietly taken out behind it. */
head("Mystery Bubble rewards");
{
  const data = strip(sources.data || "");
  const gate = /const\s+MYSTERY_ITEMS_ENABLED\s*=\s*(true|false)\s*;/.exec(data);
  if (!gate) fail("MYSTERY_ITEMS_ENABLED is not declared in js/data.js");
  else pass(`MYSTERY_ITEMS_ENABLED is ${gate[1]} - one named switch, easy to put back`);
  /* Both doors are gated: the one that grants an item and the one that spends
     it. The second is defence in depth against state that predates the gate. */
  const mech = strip(sources.mechanics || "");
  /* The body of the function itself, rather than a fixed slice of the file
     after it: a guard added to useItem() for an unrelated reason must not be
     able to push the gate out of a window and quietly pass this. Top-level
     functions in js/mechanics.js all start in column one, so the next one is
     where this one ends. */
  const gated = (fn) => {
    const at = mech.indexOf(`function ${fn}(`);
    if (at < 0) return null;
    const next = mech.indexOf("\nfunction ", at + 1);
    return mech.slice(at, next < 0 ? mech.length : next).includes("MYSTERY_ITEMS_ENABLED");
  };
  for (const fn of ["takeBubble", "useItem"]) {
    const g = gated(fn);
    if (g === null) fail(`${fn}() is missing from js/mechanics.js`);
    else if (!g) fail(`${fn}() does not read MYSTERY_ITEMS_ENABLED`);
    else pass(`${fn}() refuses Mystery items while the gate is closed`);
  }
  /* Nothing dormant may be deleted just because it is currently unreachable. */
  const kept = { data: ["ITEMS", "ITEM_IDS", "RARITY", "SLICK_KINDS", "CAN_TIME"],
                 mechanics: ["function rollItem", "function fireSeeker",
                             "function useItem", "function spawnBubbleRow"],
                 hud: ["ITEM_PATHS"],
                 render: ["function drawSlicks", "function drawMissiles",
                          "function drawBubbles"] };
  const missing = [];
  for (const [file, needles] of Object.entries(kept))
    for (const n of needles)
      if (!strip(sources[file] || "").includes(n)) missing.push(`${n} (js/${file}.js)`);
  missing.length
    ? missing.forEach((m) => fail(`the disabled item system lost ${m}`))
    : pass("roll, artwork, rarities, oil, seekers and bubble rows are all still here");
  /* The reward gate is not the custom-race switch; both must exist separately. */
  /\bbubbles:\s*true\b/.test(strip(sources.runtime || ""))
    ? pass("rules.bubbles still decides whether rows spawn at all")
    : fail("the rules.bubbles custom-race switch is gone from defaultRules()");
}

/* Four cars do something with their fifteen seconds beyond running fast, and
   three carry a race size of their own. All of it is deliberate and all of it
   is meant to stay countable: this is what says a fifth has not crept in, that
   none of them is spelled out ad hoc instead of being asked for, and that the
   shared lifecycle underneath them is still shared. */
head("The car-specific ultimates and race sizes");
{
  const mech = strip(sources.mechanics || "");
  /* The predicates, and what each of them is for. flannUltActive() is Flann's
     ram. neelaUltActive() is "Neela's fifteen seconds are running", which is
     what carries the solid-hazard privilege for the whole of them.
     neelaFormActive() is "the alternate body is the one on the road", which is
     what carries the single swap and what the renderer and the hull read.
     The last two are not the same question after the first racer contact, and
     a build that collapses them into one gives Neela either a privilege it has
     lost or a second swap it never had. */
  const predicates = ["flannCar", "flannUltActive", "neelaCar", "neelaUltActive",
                      "neelaFormActive", "clearsSolidHazards", "neelaCanSwap",
                      /* Lolanthe's aura and the control lock it applies, and
                         Verdant's invisibility, its directional defence and
                         the one place a driver's eyes differ from a hitbox. */
                      "lolantheCar", "lolantheUltActive", "verdantCar",
                      "verdantUltActive", "controlsLocked", "racerDetectable",
                      "specialContact",
                      /* And Rhosyn's, which are the odd ones out: the other
                         four decide who loses a contact, and these say whether
                         there is a body on the shared road to have one at all.
                         rhosynElsewhere() is the single source of truth every
                         other system reads; aeroGlowViewActive() is which
                         world that racer's own view draws, which changes hands
                         a moment later in each direction. */
                      "rhosynCar", "rhosynUltActive", "rhosynElsewhere",
                      "aeroGlowViewActive", "aeroHideK"];
  const gone = predicates.filter((n) => !new RegExp(`^function ${n}\\(`, "m").test(mech));
  gone.length
    ? gone.forEach((n) => fail(`${n}() is not declared in js/mechanics.js`))
    : pass(`the car-power predicates are all declared (${predicates.join(", ")})`);
  /* Kept apart, and provably so: neelaFormActive() has to be built on the
     ultimate predicate and on the form flag, not be an alias for either. */
  /function neelaFormActive\([^)]*\)\s*\{[^}]*neelaUltActive\([^}]*neelaForm/.test(mech)
    ? pass("neelaFormActive() is the ultimate AND the alternate body, not either alone")
    : fail("neelaFormActive() no longer distinguishes the alternate form from the ultimate");
  /* One predicate each, used everywhere, rather than the car spelled out again
     in every caller. Comments are stripped but string bodies are kept, because
     the literal is exactly what is being looked for. Only the two car identity
     predicates may name a car; the model dispatch in drawCar reads p.key and
     is a different question. */
  const adhoc = [];
  for (const n of ORDER) {
    if (!sources[n]) continue;
    for (const m of sources[n].matchAll(/\.car\s*===?\s*["'](flann|neela|lolanthe|verdant|rhosyn)["']/g)) {
      const before = sources[n].slice(0, m.index);
      const inPredicate =
        /function (flannCar|neelaCar|lolantheCar|verdantCar|rhosynCar)\([^)]*\)\s*\{[^}]*$/.test(before);
      if (!inPredicate) adhoc.push(`js/${n}.js`);
    }
  }
  adhoc.length
    ? [...new Set(adhoc)].forEach((f) => fail(`${f} names a car itself instead of asking one of the identity predicates`))
    : pass("flannCar(), neelaCar(), lolantheCar(), verdantCar() and rhosynCar() are the only places a racer is named");
  /* And they are genuinely read where the powers live: the contact rules and
     the player's hazards in mechanics, the rivals' hazards in race, the fire
     and the alternate body in render. A predicate nobody asks is a power
     nobody has. */
  const asks = { mechanics: ["flannUltActive(", "neelaCanSwap(", "clearsSolidHazards(",
                             "verdantUltActive(", "lolantheUltActive(", "controlsLocked(",
                             "rhosynElsewhere("],
                 race: ["clearsSolidHazards(", "controlsLocked(", "lolantheAuras(",
                        "tickMindControl(", "tickAeroGlow(", "clearAeroGlowState("],
                 render: ["flannUltActive(", "racerModel(", "racerViewAlpha(",
                          "lolantheUltActive(", "aeroGlowViewActive("],
                 ai: ["racerDetectable(", "lolantheCar(", "verdantCar("],
                 input: ["controlsLocked("],
                 hud: ["racerDetectable("] };
  const absent = [];
  for (const [n, needles] of Object.entries(asks))
    for (const needle of needles)
      if (!strip(sources[n] || "").includes(needle)) absent.push(`js/${n}.js never asks ${needle}`);
  absent.length
    ? absent.forEach((m) => fail(m))
    : pass("contact, hazards, the hull and drawing all read them");
  /* The hull and the sprite come out of the same model, so a racer cannot be
     drawn as one body and collided as another. */
  /racerModel\(who\)\.hitShape/.test(mech) && /racerDims\(who\)/.test(mech)
    ? pass("carHit() takes its hull and its size from the model being drawn")
    : fail("carHit() no longer reads racerModel()/racerDims()");
  /* Neela's own numbers exist and are one named constant each rather than
     magic numbers scattered through the mechanic. */
  const data = strip(sources.data || "");
  for (const k of ["WHITEOUT_TIME", "MORPH_TIME", "NEELA_SWAP_GUARD",
                   "NEELA_TRAIL_LIFE", "NEELA_TRAIL_GAP", "NEELA_TRAIL_MAX"]) {
    new RegExp(`const\\s+${k}\\s*=`).test(data)
      ? pass(`${k} is a named constant in js/data.js`)
      : fail(`${k} is not declared in js/data.js`);
  }
  /* Lolanthe's and Verdant's own numbers, on the same terms: one named
     constant each, in the shared tuning layer, rather than a figure written
     into whichever file happened to need it. */
  for (const k of ["MIND_CONTROL_TIME", "MIND_AURA_LENGTHS", "MIND_POP",
                   "MIND_ORBIT", "MIND_NOTE_K", "MIND_ORBIT_X", "MIND_ORBIT_Y",
                   "QUEEN_POP", "QUEEN_NOTE_K", "QUEEN_LIFT", "QUEEN_BOB",
                   "QUEEN_BOB_RATE", "VERDANT_FADE", "VERDANT_OWN_ALPHA",
                   "VERDANT_REVEAL", "QUEEN_NOTE_IMG", "MIND_NOTE_IMG"]) {
    new RegExp(`const\\s+${k}\\s*=`).test(data)
      ? pass(`${k} is a named constant in js/data.js`)
      : fail(`${k} is not declared in js/data.js`);
  }
  /* Three seconds from the last application, and a fresh hold resets rather
     than stacks. The only write to mindT outside the tick is the assignment in
     applyMindControl(); an accumulating one would quietly turn a racer held in
     the aura into a racer locked out for the rest of the race. */
  for (const n of ORDER) {
    if (!sources[n]) continue;
    if (/\bmind[TP]\w*\s*\+=/.test(strip(sources[n])))
      fail(`js/${n}.js adds to a mind-control timer instead of setting it`);
  }
  /o\.mindT = MIND_CONTROL_TIME;/.test(strip(sources.mechanics || ""))
    ? pass("Mind Control is set to MIND_CONTROL_TIME, never added to")
    : fail("applyMindControl() no longer sets mindT to MIND_CONTROL_TIME");
  /* Rhosyn's own numbers, on the same terms, and both derived from the shared
     white transition rather than invented beside it. */
  for (const k of ["AERO_SHIFT", "AERO_FADE"]) {
    new RegExp(`const\\s+${k}\\s*=`).test(data)
      ? pass(`${k} is a named constant in js/data.js`)
      : fail(`${k} is not declared in js/data.js`);
  }
  /* Aero-Glow is a view over the one race, never a second one. Nothing may
     write a track key that is not a track, teleport a racer into or out of it,
     or keep a race position of its own beside the canonical one. */
  {
    const bad = [];
    for (const n of ORDER) {
      const src = strip(sources[n] || "");
      if (/G\.(biome|next|seam|trackT)\s*=\s*["']?aero/i.test(src))
        bad.push(`js/${n}.js makes Aero-Glow a track`);
      if (/aero\w*(Meters|Pose|Origin|Biome|Scroll|Dist)\s*[=:]/i.test(src))
        bad.push(`js/${n}.js keeps a second race position for Aero-Glow`);
    }
    /* And the one function that could put a racer somewhere is never reached
       from the mechanic that sends it away. */
    const at = mech.indexOf("function beginAeroGlow(");
    const end = mech.indexOf("function clearAeroGlowState(");
    if (at >= 0 && end > at && /teleportRacerToPose|rebaseWorld/.test(mech.slice(at, end)))
      bad.push("the Aero-Glow lifecycle teleports the racer");
    bad.length
      ? bad.forEach((m) => fail(m))
      : pass("Aero-Glow is a view over the canonical racer, not a second race");
  }
  /* And it is the one car-specific state noContact() reads, because it is the
     one that is about there being a body at all rather than about who wins a
     contact between two of them. */
  /function refusesDebuffs\([^)]*\)\s*\{[^}]*rhosynElsewhere/.test(mech)
    ? pass("noContact() reads the one state that says the body has left the road")
    : fail("noContact() no longer knows about Aero-Glow");
  /* Verdant is hidden, never removed: nothing in the mechanic may reach for
     the one flag that would take it out of contact altogether. */
  /function verdantUltActive\([^)]*\)\s*\{[^}]*ultOn/.test(strip(sources.mechanics || ""))
    ? pass("verdantUltActive() is the shared ultimate flag and nothing else")
    : fail("verdantUltActive() no longer reads the shared ultimate flag");
  /function racerDetectable\([^)]*\)\s*\{[^}]*verdantUltActive/.test(strip(sources.mechanics || ""))
    ? pass("being invisible is a question about sight, kept apart from noContact()")
    : fail("racerDetectable() no longer distinguishes sight from contact");
  /* The guard is one step's worth. Anything approaching a second of it would
     be hidden invulnerability rather than a duplicate-contact guard. */
  const guard = Number((data.match(/const\s+NEELA_SWAP_GUARD\s*=\s*([0-9.]+)/) || [])[1]);
  guard > 0 && guard <= 0.12
    ? pass(`the swap guard is ${guard}s: one step, not a shield`)
    : fail(`NEELA_SWAP_GUARD is ${guard}, which is long enough to be protection`);
  /* The shared lifecycle is untouched: same clock, same duration, same pace. */
  for (const [k, v] of [["ULT_CHARGE", "85"], ["ULT_TIME", "15"], ["ULT_SPEED", "2.0"]]) {
    new RegExp(`const\\s+${k}\\s*=\\s*${v.replace(".", "\\.")}\\b`).test(data)
      ? pass(`${k} is still ${v} for every car`)
      : fail(`${k} is no longer ${v}`);
  }
  /* A race scale belongs to measured artwork and to nothing else: only the
     sprite cars may carry one, each has to be a real adjustment rather than a
     rounding error, and none of them may grow into a different class of
     vehicle. The shared car box the other four are built on is untouched. */
  if (CARS) {
    const scaled = Object.entries(CARS).filter(([, c]) => c.raceScale !== undefined);
    const procedural = scaled.filter(([, c]) => c.style !== "sprite");
    procedural.length
      ? procedural.forEach(([id]) => fail(`car ${id} is procedural and must not carry a race scale`))
      : pass(`only the sprite cars carry a race scale (${scaled.map(([id]) => id).join(", ") || "none"})`);
    for (const [id, c] of scaled) {
      c.raceScale > 1.05 && c.raceScale <= 1.25
        ? pass(`${id}'s race scale is the intended 5-25% and no more (${c.raceScale}x)`)
        : fail(`${id}'s race scale is ${c.raceScale}, outside the intended 5-25%`);
    }
    /* An alternate form is sized against its racer's own box, never against
       the road's - so it cannot quietly become a bigger vehicle either. */
    for (const [id, c] of Object.entries(CARS)) {
      if (!c.altForm) continue;
      const k = c.altForm.scale;
      k === undefined || (k > 0.8 && k < 1.25)
        ? pass(`${id}'s alternate form is sized from its own racer box (${k}x)`)
        : fail(`${id}'s alternate form scale is ${k}, outside the intended range`);
    }
  }
  /^\s*carW\s*=\s*Math\.min\(laneW\*0\.64/m.test(strip(sources.runtime || ""))
    ? pass("the shared carW/carH the other four are built on is unchanged")
    : fail("the shared carW in layout() has moved");
}

head(failures ? `${failures} failure${failures === 1 ? "" : "s"}` +
                (warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : "")
              : warnings ? `all checks passed, ${warnings} warning${warnings === 1 ? "" : "s"}`
              : "all checks passed");
process.exit(failures ? 1 : 0);
