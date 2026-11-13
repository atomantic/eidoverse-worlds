// Explicit isolated full-sequencer check of the managed visitor lane (fork-only, docs/managed-visitors.md). Never points
// at an existing world or port: a fresh temp WORLDS_DIR, a world founded there, an unused loopback port.
//   bun tools/managed-visitors-scratch.ts
// Ported to the current protocol: the world is founded with tools/protocol/world.ts (joining never founds one), the observer joins with the
// protocol's hello and replica, and waits use wait.ts `until` (no fixed sleeps).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { until } from './protocol/wait.ts';
import { helloOf } from '../shared/protocol/hello.js';
const ENGINE = resolve(import.meta.dir, '..');
const root = mkdtempSync(join(tmpdir(), 'eidoverse-managed-'));
const reservation = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
const port = reservation.port; reservation.stop(true);
const token = 'ab'.repeat(32);
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', WORLDS_DIR: root, OPT_DIR: join(root, 'opt'), JOIN_TOKEN: 'scratch-door', SKIP_OPT_SWEEP: '1',
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0', PORTOS_EIDOVERSE_VISITOR_TOKEN: token, PORTOS_EIDOVERSE_VISITOR_WORLDS: 'managedscratch' };
const founded = Bun.spawnSync(['bun', 'tools/protocol/world.ts', 'found', 'managedscratch', '--owner', 'scratch-owner'], { cwd: ENGINE, env });
assert.equal(founded.exitCode, 0, `found managedscratch: ${founded.stderr.toString()}`);
const child = Bun.spawn(['bun', 'server/server.ts'], { cwd: ENGINE, env, stdout: 'ignore', stderr: 'pipe' });
let socket: WebSocket | null = null;
try {
  const base = `http://127.0.0.1:${port}/api/managed-visitors/v1`;
  await until('the scratch sequencer answers the managed lane', async () => {
    try { return (await fetch(`${base}/version`, { headers: { authorization: `Bearer ${token}` } })).ok || null; } catch { return null; } }, { ms: 15_000, step: 100 });
  const messages: any[] = [];
  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
  await new Promise<void>((done, fail) => { socket!.onopen = () => done(); socket!.onerror = fail; });
  socket.send(JSON.stringify({ type: 'join', hello: helloOf(), id: 'scratch-observer', world: 'managedscratch', token: 'scratch-door', spectate: true, replica: true }));
  await until('the observer joins the scratch world', () => messages.find((m) => m.type === 'snapshot') ?? (messages.find((m) => m.type === 'error') ? 'refused' : null), { ms: 8_000, step: 50 })
    .then((m) => assert.notEqual(m, 'refused', JSON.stringify(messages.filter((x) => x.type === 'error'))));
  const response = await fetch(`${base}/admissions`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'X-Managed-Visitor-Deadline': String(Date.now() + 1000) }, body: JSON.stringify({ version: 1, appId: 'test', individualId: 'one', individualSessionId: 'neural', worldId: 'managedscratch', body: 'fly-v1', ttlMs: 1000 }) });
  assert.equal(response.status, 200); const admission = await response.json();
  const presence = await until('the observer sees the fly', () => messages.find((m) => m.type === 'managed-flies' && m.visitors.length), { ms: 3_000, step: 50 });
  assert.equal(presence.visitors[0].sessionId, admission.sessionId);
  assert.equal(presence.visitors[0].body, 'fly-v1');
  const scope = Object.fromEntries(['appId', 'individualId', 'individualSessionId', 'worldId', 'epoch'].map((k) => [k, admission[k]]));
  assert.equal((await fetch(`${base}/sessions/${admission.sessionId}/leave`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(scope) })).status, 200);
  messages.length = 0;
  await until('the observer sees the lease removed', () => messages.some((m) => m.type === 'managed-flies' && !m.visitors.length) || null, { ms: 3_000, step: 50 });
  console.log('PASS isolated sequencer negotiation, paused admission, observer presence and leave');
} finally {
  socket?.close(); child.kill(); await child.exited;
  const errors = await new Response(child.stderr).text();
  if (errors.includes('error:')) console.error(errors.slice(-3000));
  rmSync(root, { recursive: true, force: true });
}
