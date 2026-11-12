// A tiny headless-Firefox driver (WebDriver BiDi, Node built-ins only): open(url), ev(js), snap(file), key(k).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function launch({ w = 1280, h = 720, prefs = '' } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600), prof = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'ffprof-'));
  writeFileSync(join(prof, 'user.js'), 'user_pref("media.autoplay.default", 0);\n' + prefs);
  const ff = spawn('firefox', [...(process.env.FF_HEAD ? [] : ['--headless']), '--no-remote', '--profile', prof, '--remote-debugging-port', String(port), '--window-size=' + w + ',' + h], { stdio: 'ignore', detached: true });
  const close = () => { try { process.kill(-ff.pid, 'SIGKILL'); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ws; for (let i = 0; i < 60; i++) { await sleep(300); try { ws = new WebSocket(`ws://127.0.0.1:${port}/session`); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); break; } catch { ws = null; } }
  let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'log.entryAdded') logs.push(m.params.level + ': ' + m.params.text); };
  const cmd = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('session.new', { capabilities: {} }); await cmd('session.subscribe', { events: ['log.entryAdded'] });
  const c = (await cmd('browsingContext.getTree', {})).result.contexts[0].context;
  const ev = async (code) => { const r = await cmd('script.evaluate', { expression: code, target: { context: c }, awaitPromise: true, userActivation: true }); return r.result && r.result.result ? r.result.result.value : 'EXC ' + JSON.stringify(r.result || r.error); };
  const snap = async (f) => { await sleep(300); const s = await cmd('browsingContext.captureScreenshot', { context: c }); writeFileSync(f, Buffer.from(s.result.data, 'base64')); console.log('     ' + f); };
  let pres = [];
  const preload = async (fns) => { for (const p of pres) await cmd('script.removePreloadScript', { script: p }); pres = []; for (const f of fns) pres.push((await cmd('script.addPreloadScript', { functionDeclaration: f })).result.script); };
  const open = async (url, vw = w, vh = h) => { await cmd('browsingContext.setViewport', { context: c, viewport: { width: vw, height: vh } }); await cmd('browsingContext.navigate', { context: c, url, wait: 'complete' }); };
  const key = (k) => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(k.length === 1 ? 'Key' + k.toUpperCase() : k)}, bubbles: true })), window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(k.length === 1 ? 'Key' + k.toUpperCase() : k)}, bubbles: true })), 1`);
  return { cmd, ev, snap, open, key, preload, logs, close, sleep, c };
}
