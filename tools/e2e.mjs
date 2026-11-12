// Plays the test project's web exports in headless Firefox, served by serve.mjs with wt-stub.js as
// the page's window.wt, and checks each call and signal of Blazium's Betacade singleton. Prints a
// verdict for gaps 1-4 (export.sh prints gap 5), every console error or warning, and ALL PASSED or
// the number of failures.
// Usage: node tools/e2e.mjs [shot prefix]   (serve.mjs running; Firefox on PATH; xvfb-run -a on Linux
// without a display)
import { launch } from './ffdrive.mjs';
const out = process.argv[2] || 'shot';
const BASE = 'http://127.0.0.1:8712/';
let fails = 0;
const verdicts = {};
const cut = (x) => String(x).slice(0, 400);
const ok = (name, pass, extra = '') => { console.log((pass ? 'ok   ' : 'FAIL ') + name + (extra !== '' ? ' (' + cut(extra) + ')' : '')); if (!pass) fails++; return pass; };
const note = (name, extra = '') => console.log('     ' + name + (extra !== '' ? ' (' + cut(extra) + ')' : ''));
const verdict = (gap, v, why) => { verdicts[gap] = v; console.log(`GAP ${gap}: ${v} - ${why}`); };
const f = await launch({ w: 960, h: 600, prefs: 'user_pref("webgl.force-enabled", true);\nuser_pref("webgl.disabled", false);\n' });
const bye = (code) => { try { f.close(); } catch {} process.exit(code); };
setTimeout(() => { console.log('FAIL timeout'); bye(2); }, 300000);
process.on('uncaughtException', (e) => { console.log('FAIL ' + (e && e.stack || e)); bye(3); });
process.on('unhandledRejection', (e) => { console.log('FAIL ' + (e && e.stack || e)); bye(3); });
const { ev, snap, sleep, open, cmd, c, logs } = f;

const J = async (code) => { const r = await ev(`JSON.stringify(${code})`); try { return JSON.parse(r); } catch { return null; } };
const sdk = async () => (await J(`window.__sdk || []`)) || [];
async function waitFor(fn, ms = 20000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v) return v; await sleep(200); } return v; }
const has = (lines, re) => lines.some((l) => re.test(l));
async function click(x, y) {
  await cmd('input.performActions', { context: c, actions: [{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: Math.round(x), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 40 }, { type: 'pointerUp', button: 0 }] }] });
  await sleep(120);
}
async function hitOrb() { const o = await J(`window.__orb`); await click(o.x, o.y); }
async function boot(path) {
  logs.length = 0;
  await open(BASE + path, 960, 600);
  return waitFor(async () => has(await sdk(), /^load\(missing_key/), 30000);
}
// A same-origin page with no game on it, to clear localStorage between runs.
async function fresh() { await open(BASE + 'blank', 960, 600); await ev(`localStorage.clear(), 1`); }
const problems = [];
// Emscripten's notice when instantiating the wasm takes over 10 s (a busy machine), not a fault.
const slow = /still waiting on run dependencies|dependency: wasm-instantiate|\(end of list\)/;
const collect = (label) => { for (const l of logs) if (/^(error|warn)/i.test(l) && !/favicon/i.test(l) && !slow.test(l)) problems.push(label + ': ' + l); };

// ---------- A. Betacade export, ?lazy=1: page signals before the first save or event (gap 3) ----------
console.log('--- A. Betacade preset, ?lazy=1');
await fresh();
ok('A boot: the game loaded and logged its calls', await boot('betacade/index.html?lazy=1'));
let L = await sdk();
note('boot log', L.join(' | '));
ok('is_available() true with a window.wt', has(L, /^is_available\(\) -> true/));
ok('is_replaying() false on a play page', has(L, /^is_replaying\(\) -> false/));
await ev(`__pause()`); await sleep(500);
const lazyPaused = has(await sdk(), /^signal paused/);
await ev(`__resume()`); await sleep(400);
const lazyResumed = has(await sdk(), /^signal resumed/);
note('before the first save: wt:pause -> paused? ' + lazyPaused + ', wt:resume -> resumed? ' + lazyResumed);
await hitOrb(); await sleep(400);
L = await sdk();
ok('first hit: save() true, run.start and orb.hit logged', has(L, /^save\(sdk_test_save.*-> true/) && has(L, /^event\(run\.start/) && has(L, /^event\(orb\.hit/), L.slice(-6).join(' | '));
await ev(`__pause()`); await sleep(500);
L = await sdk();
const afterPaused = L.filter((l) => /^signal paused/.test(l)).length > (lazyPaused ? 1 : 0);
await ev(`__resume()`); await sleep(400);
L = await sdk();
const afterResumed = has(L, /^signal resumed/);
ok('control: after a save, wt:pause/wt:resume fire paused/resumed', afterPaused && afterResumed, L.filter((l) => /signal/.test(l)).join(' | '));
if (lazyPaused && lazyResumed) verdict(3, 'FIXED', 'paused/resumed fired before any save or event');
else if (afterPaused) verdict(3, 'CONFIRMED', 'a wt:pause before the first save or event fired no paused signal; after the first save the same event did');
else verdict(3, 'UNTESTED', 'paused never fired at all');
collect('A');

// ---------- B. Betacade export, normal play: saves, events, scores, snapshot getter ----------
console.log('--- B. Betacade preset, normal play');
await fresh();
ok('B boot', await boot('betacade/index.html'));
L = await sdk();
ok('boot calls: save true, save/load/remove a tmp key', has(L, /^save\(sdk_test_save.*-> true/) && has(L, /^load\(sdk_test_tmp\) -> float:7/) && has(L, /^remove\(sdk_test_tmp\); load -> String:"gone"/), L.join(' | '));
ok('load(missing, 42) gives the default', has(L, /^load\(missing_key, 42\) -> int:42/));
for (let i = 0; i < 11; i++) { await hitOrb(); await sleep(150); }
await click(20, 580); await sleep(300);
L = await sdk();
note('log tail', L.slice(-8).join(' | '));
const W = await J(`__wt`);
ok('two levels cleared: submit_score and achieve reached wt', W.scores.length === 2 && W.achieves.includes('cleared_level_2'), JSON.stringify({ scores: W.scores, achieves: W.achieves }));
const ls = await J(`JSON.parse(localStorage.getItem('sdk_test_save'))`);
ok('save: localStorage sdk_test_save holds level 3', ls && ls.level === 3 && ls.score > 0, JSON.stringify(ls));
ok('remove(): sdk_test_tmp gone from localStorage', (await J(`localStorage.getItem('sdk_test_tmp')`)) === null);
const names = W.tracks.map((t) => t.name);
ok('events reached wt.track: run.start, 11 orb.hit, 2 level.complete, orb.miss', names.includes('run.start') && names.filter((n) => n === 'orb.hit').length === 11 && names.filter((n) => n === 'level.complete').length === 2 && names.includes('orb.miss'), names.join(','));
const hit = W.tracks.find((t) => t.name === 'orb.hit');
ok('event fields keep their types', hit && typeof hit.fields.reaction_ms === 'number' && hit.fields.level === 1, JSON.stringify(hit));
await hitOrb(); await sleep(200);
const sample = await J(`typeof __wt.snapshot === 'function' ? (__wt.snapshot() || null) : 'none'`);
ok('set_state registered a snapshot getter that returns the state', sample && sample !== 'none' && sample.level === 3, JSON.stringify(sample));
await snap(out + '-B-play.png');
collect('B');

ok('B reload', await boot('betacade/index.html'));
L = await sdk();
ok('reload: load() returned the level-3 save', has(L, /^load\(sdk_test_save, \{\}\) -> Dictionary:.*"level":3/), L.find((l) => /^load\(sdk_test_save/.test(l)));
collect('B2');

// ---------- C. Replay viewer, the usual pattern (no set_state while replaying): gap 4 ----------
console.log('--- C. ?wt-replay=state, no set_state while replaying');
ok('C boot', await boot('betacade/index.html?wt-replay=state'));
L = await sdk();
ok('is_replaying() true in the viewer', has(L, /^is_replaying\(\) -> true/), L.join(' | '));
const hooksC = await waitFor(() => J(`__wt.replayHooks ? Date.now() - __wt.loadedAt : 0`), 30000);
note('replay hooks registered after', hooksC ? hooksC + ' ms from page load' : 'never (30 s)');
if (hooksC) verdict(4, 'FIXED', 'the game registered wt.onReplay without calling set_state');
else verdict(4, 'CONFIRMED', 'the game never registered wt.onReplay in 30 s (only set_state registers it)');
collect('C');

// ---------- D. Replay viewer with set_state always: gap 1 on replay_state ----------
console.log('--- D. ?wt-replay=state&state=always');
ok('D boot', await boot('betacade/index.html?wt-replay=state&state=always'));
ok('the replay hooks are registered', await waitFor(() => J(`!!__wt.replayHooks`), 15000));
const want = { level: 7, hits: 3, score: 999, target: { x: 200, y: 300, r: 24 } };
await ev(`__wt.replayHooks.enter(), __wt.replayHooks.state(${JSON.stringify(want)}), __wt.replayHooks.exit(), 1`);
await sleep(500);
L = await sdk();
note('replay signals', L.filter((l) => /^signal replay_/.test(l)).join(' | '));
await snap(out + '-D-replay.png');
const gotDict = has(L, /^signal replay_state\(Dictionary:.*"level":7/);
const stLine = L.find((l) => /^signal replay_state/.test(l));
ok('replay_entered and replay_exited fired', has(L, /^signal replay_entered/) && has(L, /^signal replay_exited/));
ok('replay_state carries the state as a Dictionary', gotDict, stLine || 'no replay_state signal');
if (gotDict) verdict(1, 'FIXED', 'replay_state carried the Dictionary');
else if (stLine) verdict(1, 'CONFIRMED', 'replay_state arrived as ' + stLine.replace(/^signal replay_state\(/, '').slice(0, 100) + ' instead of the Dictionary');
else verdict(1, 'UNTESTED', 'no replay_state signal at all');
collect('D');

// ---------- E. Plain Web export, same window.wt: gap 2 ----------
console.log('--- E. Plain Web preset');
await fresh();
ok('E boot', await boot('web/index.html'));
await hitOrb(); await sleep(500);
L = await sdk();
const webSave = L.find((l) => /^save\(sdk_test_save/.test(l)) || 'no save logged';
const webLs = await J(`localStorage.getItem('sdk_test_save')`);
note('plain Web: ' + webSave + '; localStorage sdk_test_save=' + webLs);
if (/-> true/.test(webSave) && webLs) verdict(2, 'FIXED', 'save() returned true and wrote localStorage');
else verdict(2, 'CONFIRMED', webSave + ', localStorage sdk_test_save=' + webLs);
collect('E');

// ---------- F. Betacade export with no window.wt: stays silent, still saves ----------
console.log('--- F. Betacade preset, no window.wt');
logs.length = 0;
await open(BASE + 'betacade/noinject.html', 960, 600);
const fBoot = await waitFor(async () => has(await sdk(), /^load\(missing_key/), 30000);
L = await sdk();
ok('no wt: is_available false, saves still work', fBoot && has(L, /^is_available\(\) -> false/) && has(L, /^save\(sdk_test_save.*-> true/), L.join(' | '));
collect('F');

console.log('--- problems (console errors and warnings)');
const counted = {};
for (const p of problems) if (!/^\w+: error:\s+at: /.test(p)) counted[p] = (counted[p] || 0) + 1;
for (const [p, n] of Object.entries(counted)) console.log('PROBLEM ' + p + (n > 1 ? '  (x' + n + ')' : ''));
console.log('problems: ' + problems.length + ' lines, ' + Object.keys(counted).length + ' distinct');
console.log('VERDICTS ' + JSON.stringify(verdicts));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
bye(fails ? 1 : 0);
