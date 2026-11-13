// Manual browser acceptance fixture for the PortOS frame (fork-only, docs/portos-frame.md). Never reads or joins an
// installed world: it founds two scratch worlds in a temp WORLDS_DIR, serves them on loopback, and serves a stand-in
// parent page that speaks the frame contract with allow="gamepad". Open the printed URL, walk to the pod, press E, the
// pad's X / □, or tap its prompt, and read the status line. Ctrl-C stops everything.
//   bun tools/interaction-preview.ts
// Ported to the current protocol: worlds are founded with tools/protocol/world.ts (joining never founds one), the seed joins with the protocol's
// hello and replica, and the pod is created by request as a `mesh` box (no asset library needed) carrying `portos/link`
// {route: "/eidoverse", action: "visit"} and an ordinary reaction, so the standalone renderer offers a logged use.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { helloOf } from '../shared/protocol/hello.js';
const root = resolve(import.meta.dir, '..');
const rendererOrigin = 'http://127.0.0.1:8993';
const parentOrigin = 'http://127.0.0.1:8994';
const key = 'synthetic-interaction-test';
const instance = crypto.randomUUID();

// Refuse a port someone else holds BEFORE any world is founded or written: an unrelated listener must see nothing
// but (at most) this one read.
const squatter = await fetch(`${rendererOrigin}/version`, { signal: AbortSignal.timeout(800) }).then(() => true, () => false);
if (squatter) { console.error(`${rendererOrigin} is already serving something; this fixture owns its own server and stops here`); process.exit(2); }

const scratch = await mkdtemp(join(tmpdir(), 'eidoverse-interaction-'));
const env = { ...process.env, WORLDS_DIR: scratch, OPT_DIR: join(scratch, 'opt'), SKIP_OPT_SWEEP: '1', HOST: '127.0.0.1',
  JOIN_TOKEN: key, TRUST_NAMES: '1', WORLD_INSTANCE_NONCE: instance, EMBED_PARENT_ORIGIN: parentOrigin };
for (const world of ['interaction-a', 'interaction-b']) {
  const r = Bun.spawnSync([process.execPath, 'tools/protocol/world.ts', 'found', world, '--owner', 'fixture-author'], { cwd: root, env });
  if (r.exitCode !== 0) throw new Error(`could not found ${world}: ${r.stderr.toString()}`);
}
const child = Bun.spawn([process.execPath, 'server/server.ts'], { cwd: root, env: { ...env, PORT: '8993' }, stdout: 'ignore', stderr: 'inherit' });
process.on('exit', () => child.kill());
process.on('SIGINT', () => process.exit(0));
let healthy = false;
for (let attempt = 0; attempt < 100; attempt++) {
  if (child.exitCode !== null) throw new Error('Scratch renderer exited before becoming ready');
  healthy = await fetch(`${rendererOrigin}/version`).then(async (r) => r.ok && (await r.json()).instance === instance).catch(() => false);
  if (healthy) break;
  await Bun.sleep(100);
}
if (!healthy) throw new Error('Scratch renderer did not start (is :8993 taken?)');

const seed = new WebSocket(`${rendererOrigin.replace('http', 'ws')}/ws`);
const messages: any[] = [];
seed.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
await new Promise<void>((done) => seed.addEventListener('open', () => done(), { once: true }));
async function waitFor(predicate: (m: any) => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = messages.find(predicate);
    if (match) return match;
    const err = messages.find((m) => m.type === 'error');
    if (err) throw new Error(`Fixture operation refused: ${err.error}`);
    await Bun.sleep(50);
  }
  throw new Error('Fixture operation timed out');
}
seed.send(JSON.stringify({ type: 'join', hello: helloOf(), world: 'interaction-a', id: 'fixture-author', avatar: '', replica: true, token: key }));
await waitFor((m) => m.type === 'snapshot');
seed.send(JSON.stringify({ type: 'request', id: 'pod', verb: 'create', args: { components: {
  transform: { pos: [0, 0.5, 3] }, mesh: { shape: 'box', size: [1, 1, 1] }, label: 'Example destination',
  'portos/link': { route: '/eidoverse', action: 'visit' },
  'portos-fixture/state': { used: 0 },
  // Standalone (no host session) the same object offers an ordinary logged use.
  reactions: { test: { kind: 'set', component: 'portos-fixture/state', field: 'used', value: 1 } },
} } }));
const made = await waitFor((m) => m.type === 'reply' && m.id === 'pod');
if (!made.reply?.ok) throw new Error(`the pod was refused: ${JSON.stringify(made.reply?.refused)}`);
const pod = JSON.stringify(made.reply.refs ?? made.reply.ids ?? null);

let leftSource = false;
seed.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.type === 'leave' && message.id === 'fixture-visitor') leftSource = true;
  if (message.type === 'arrive' && message.id === 'fixture-visitor') leftSource = false;
});
const html = `<!doctype html><html><head><title>World interaction acceptance</title></head>
<body style="margin:0;background:#132327;color:white;font:16px sans-serif">
<p id="status" style="margin:8px">Click the world, then approach the pod and press E or controller X / Square, or tap its prompt.</p>
<iframe id="world" title="Scratch world" allow="gamepad" style="width:100%;height:90vh;border:0"></iframe>
<script>
const frame = document.getElementById('world'), status = document.getElementById('status');
const origin = ${JSON.stringify(rendererOrigin)};
let nonce = 'fixture-a', destination = false;
const url = world => origin+'/?world='+world+'&name=fixture-visitor&key='+${JSON.stringify(key)}+'&avatar=eidoverse%2Fassets%2Fvrms%2Fclaude.vrm';
frame.onload = () => frame.contentWindow.postMessage({type:'portos:connect',version:1,nonce}, origin);
addEventListener('message', async event => {
  const m = event.data;
  if(event.source!==frame.contentWindow || event.origin!==origin || m.nonce!==nonce || m.version!==1) return;
  if(m.type==='eidoverse:navigate' && m.route==='/eidoverse') {
    status.textContent='Leaving source world…';
    frame.contentWindow.postMessage({type:'portos:depart',version:1,nonce},origin);
  }
  if(m.type==='eidoverse:departed') {
    const state = await fetch('/status').then(r=>r.json());
    if(!m.ok || !state.leftSource) { status.textContent='FAIL: source presence did not leave'; return; }
    destination=true; nonce='fixture-b'; frame.src=url('interaction-b');
    status.textContent='Source presence left before entering destination';
  }
  if(m.type==='eidoverse:ready' && destination) status.textContent='PASS: departed source, entered destination, one human world';
});
frame.src=url('interaction-a');
</script></body></html>`;
Bun.serve({ port: 8994, hostname: '127.0.0.1', fetch(request) {
  if (new URL(request.url).pathname === '/status') return Response.json({ leftSource });
  return new Response(html, { headers: { 'content-type': 'text/html' } });
} });
console.log(`Open ${parentOrigin} — disposable interaction fixture ready (pod ${pod}; standalone: ${rendererOrigin}/?world=interaction-a&key=${key})`);
await child.exited;
