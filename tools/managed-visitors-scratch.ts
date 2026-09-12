// Explicit isolated full-sequencer check. Never points at an existing world/port.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = mkdtempSync(join(tmpdir(), 'eidoverse-managed-'));
const reservation = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
const port = reservation.port; reservation.stop(true);
const token = 'ab'.repeat(32);
const child = Bun.spawn(['bun', 'server/server.ts'], { env: { ...process.env, PORT: String(port), WORLDS_DIR: root, JOIN_TOKEN: 'scratch-door', SKIP_OPT_SWEEP: '1', PORTOS_EIDOVERSE_VISITOR_TOKEN: token, PORTOS_EIDOVERSE_VISITOR_WORLDS: 'managedscratch' }, stdout: 'ignore', stderr: 'pipe' });
let socket: WebSocket | null = null;
try {
  const base = `http://127.0.0.1:${port}/api/managed-visitors/v1`;
  let ready = false;
  for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${base}/version`, { headers: { authorization: `Bearer ${token}` } })).ok; } catch {} if (ready) break; await Bun.sleep(100); }
  assert(ready, 'scratch sequencer must boot');
  const messages: any[] = [];
  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.onmessage = event => messages.push(JSON.parse(String(event.data)));
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => { socket!.send(JSON.stringify({ type: 'join', id: 'scratch-observer', world: 'managedscratch', token: 'scratch-door', spectate: true })); resolve(); }; socket!.onerror = reject; });
  for (let i = 0; i < 50 && !messages.some(m => m.type === 'snapshot'); i++) await Bun.sleep(50);
  assert(messages.some(m => m.type === 'snapshot'), 'observer joined scratch world');
  const response = await fetch(`${base}/admissions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ version: 1, appId: 'test', individualId: 'one', individualSessionId: 'neural', worldId: 'managedscratch', body: 'fly-v1', ttlMs: 1000 }) });
  assert.equal(response.status, 200); const admission = await response.json();
  for (let i = 0; i < 20 && !messages.some(m => m.type === 'managed-flies' && m.visitors.length); i++) await Bun.sleep(50);
  const presence = messages.find(m => m.type === 'managed-flies' && m.visitors.length);
  assert.equal(presence.visitors[0].sessionId, admission.sessionId);
  assert.equal(presence.visitors[0].body, 'fly-v1');
  const scope = Object.fromEntries(['appId', 'individualId', 'individualSessionId', 'worldId', 'epoch'].map(k => [k, admission[k]]));
  assert.equal((await fetch(`${base}/sessions/${admission.sessionId}/leave`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(scope) })).status, 200);
  messages.length = 0;
  for (let i = 0; i < 20 && !messages.some(m => m.type === 'managed-flies' && !m.visitors.length); i++) await Bun.sleep(50);
  assert(messages.some(m => m.type === 'managed-flies' && !m.visitors.length), 'observer sees lease removal');
  console.log('PASS isolated sequencer negotiation, paused admission, observer presence and leave');
} finally {
  socket?.close(); child.kill(); await child.exited;
  const errors = await new Response(child.stderr).text();
  if (errors.includes('error:')) console.error(errors.slice(-3000));
  rmSync(root, { recursive: true, force: true });
}
