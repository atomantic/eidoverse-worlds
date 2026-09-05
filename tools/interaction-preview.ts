// Manual browser acceptance fixture. Never reads or joins an installed world.
// Run with Bun, open the printed loopback URL, use the nearby pod with E or
// its button, and check the departure status. Ctrl-C stops the scratch server.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dir, '..');
const scratch = await mkdtemp(join(tmpdir(), 'eidoverse-interaction-'));
const rendererOrigin = 'http://127.0.0.1:8993';
const parentOrigin = 'http://127.0.0.1:8994';
const key = 'synthetic-interaction-test';
const instance = crypto.randomUUID();
const child = Bun.spawn([process.execPath, 'server/server.ts'], {
  cwd: root, env: { ...process.env, PORT: '8993', WORLDS_DIR: scratch, JOIN_TOKEN: key, WORLD_INSTANCE_NONCE: instance,
    EIDOVERSE_DIR: resolve(root, '../../anima-research/eidoverse-video'), EMBED_PARENT_ORIGIN: parentOrigin },
  stdout: 'ignore', stderr: 'inherit',
});
process.on('exit', () => child.kill());
process.on('SIGINT', () => process.exit(0));
let healthy = false;
for (let attempt = 0; attempt < 100; attempt++) {
  if (child.exitCode !== null) throw new Error('Scratch renderer exited before becoming ready');
  healthy = await fetch(`${rendererOrigin}/version`).then(async r => r.ok && (await r.json()).instance === instance).catch(() => false);
  if (healthy) break;
  await Bun.sleep(100);
}
if (!healthy) throw new Error('Scratch renderer did not start');
const seed = new WebSocket(`${rendererOrigin.replace('http', 'ws')}/ws`);
const messages: any[] = [];
seed.addEventListener('message', event => messages.push(JSON.parse(String(event.data))));
await new Promise<void>(done => seed.addEventListener('open', () => done(), { once: true }));
seed.send(JSON.stringify({ type: 'join', world: 'interaction-a', id: 'fixture-author', token: key }));
async function waitFor(predicate: (m: any) => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = messages.find(predicate);
    if (match) return match;
    if (messages.some(m => m.type === 'error')) throw new Error('Fixture operation refused');
    await Bun.sleep(50);
  }
  throw new Error('Fixture operation timed out');
}
await waitFor(m => m.type === 'snapshot');
const operations = [
  ['spawn', { id: 'example-pod', lib: 'eidoverse/assets/models/scifi_barrels_strapped_to_scifi_pallet.glb', pos: [0, 0, 3] }],
  ['comp', { id: 'example-pod', type: 'structure', data: { tile: 1, wallH: 2.8, wallT: 0.12, slabT: 0.12,
    levels: [{ y: 0, tiles: [[-1, 0], [0, 0], [-1, 1], [0, 1]],
      walls: [[0, -1, 0], [0, 0, 0], [1, -1, 0], [1, -1, 1], [1, 1, 0], [1, 1, 1]],
      apertures: [[0, -1, 0, 'window'], [0, 0, 0, 'window'], [1, -1, 0, 'window'], [1, 1, 0, 'window']] }] } }],
  ['comp', { id: 'example-pod', type: 'label', data: { name: 'Example destination', visibility: 'nearby' } }],
  ['comp', { id: 'example-pod', type: 'portos', data: { route: '/eidoverse', action: 'visit' } }],
];
for (const [verb, args] of operations) {
  messages.length = 0;
  seed.send(JSON.stringify({ type: 'verb', verb, args }));
  await waitFor(m => m.type === 'log');
}
let leftSource = false;
seed.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if (message.type === 'leave' && message.id === 'fixture-visitor') leftSource = true;
  if (message.type === 'arrive' && message.id === 'fixture-visitor') leftSource = false;
});
const html = `<!doctype html><html><head><title>World interaction acceptance</title></head>
<body style="margin:0;background:#132327;color:white;font:16px sans-serif">
<p id="status" style="margin:8px">Approach the example pod and press E, or tap its prompt. Labels are off.</p>
<iframe id="world" title="Scratch world" style="width:100%;height:90vh;border:0"></iframe>
<script>
const frame = document.getElementById('world'), status = document.getElementById('status');
const origin = ${JSON.stringify(rendererOrigin)};
let nonce = 'fixture-a', destination = false;
const url = world => origin+'/?world='+world+'&name=fixture-visitor&key='+${JSON.stringify(key)}+'&avatar=eidoverse%2Fassets%2Fvrms%2Fclaude.vrm';
frame.onload = () => frame.contentWindow.postMessage({type:'portos:connect',version:1,nonce,labelVisibility:'off'}, origin);
addEventListener('message', async event => {
  const m = event.data;
  if(event.source!==frame.contentWindow || event.origin!==origin || m.nonce!==nonce || m.version!==1) return;
  if(m.type==='eidoverse:navigate' && m.entityId==='example-pod' && m.route==='/eidoverse') {
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
const parent = Bun.serve({ port: 8994, hostname: '127.0.0.1', fetch(request) {
  if (new URL(request.url).pathname === '/status') return Response.json({ leftSource });
  return new Response(html, { headers: { 'content-type': 'text/html' } });
} });
console.log(`Open ${parentOrigin} — disposable interaction fixture ready`);
await child.exited;
parent.stop();
