// Serves the exports on http://127.0.0.1:8712/ and puts wt-stub.js at the top of each HTML entry's
// <head>, the way a play page's script reaches a game. A file named noinject.html is served as is.
// Usage: node tools/serve.mjs <dir holding the exports>   (Node built-ins only)
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(process.argv[2]);
const stub = Buffer.from('<script>' + readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'wt-stub.js'), 'utf8') + '</script>');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.json': 'application/json' };

createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error('escape');
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    let body = readFileSync(file);
    const ext = extname(file);
    if (ext === '.html' && !file.endsWith('noinject.html')) {
      const text = body.toString('latin1');
      const m = /<head\b[^>]*>/i.exec(text);
      const at = m ? m.index + m[0].length : 0;
      body = Buffer.concat([body.subarray(0, at), stub, body.subarray(at)]);
    }
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(8712, '127.0.0.1');
console.log('serving ' + root + ' on http://127.0.0.1:8712/');
