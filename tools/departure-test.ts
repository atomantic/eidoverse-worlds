// departure-test.ts — leaving a world lets it go (fork-only, docs/portos-frame.md `worldDeparture`).
// The REAL client/lib/net.js lifecycle with controlled sockets and timers: departure must cancel a queued redial and an
// in-flight connect, answer requests still in flight, and close the socket before the host opens the next world — not
// merely hide a body. Every other module net.js imports is a no-op stub derived from its import list; shared/ is real.
//   BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun tools/departure-test.ts
// Mutation (must go red): drop `clearTimeout(retryTimer)` from leaveWorld(). (connect() guards departure twice, before
// and after its identity fetch, so dropping either one alone stays green: the other holds.)
import { strict as assert } from 'node:assert';
import { mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'https://renderer.example/' });

const base = resolve(import.meta.dir, '../client/lib') + sep;
const REAL = new Set(['net.js', 'base.js']);
const wanted = new Map<string, Set<string>>();
for (const file of REAL) {
  const src = readFileSync(base + file, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*'(\.\.?\/[\w./]+\.js)'/g)) {
    const abs = resolve(base, m[4]);
    if (!abs.startsWith(base)) continue;   // shared/: real
    const target = relative(base, abs).split(sep).join('/');
    const names = wanted.get(target) ?? new Set<string>();
    for (const part of (m[2] ?? '').split(',')) { const n = part.trim().split(/\s+as\s+/)[0]; if (n) names.add(n); }
    if (m[1]) names.add('default');
    wanted.set(target, names);
  }
}
for (const [file, names] of wanted) {
  if (REAL.has(file)) continue;
  const exports: Record<string, unknown> = {};
  for (const n of names) exports[n] = () => undefined;
  if (file === 'mounts.js') exports.avatarMounts = new Map();
  if (file === 'scheduler.js') { exports.P = {}; exports.pending = () => 0; }
  if (file === 'presence.js') exports.presence = {};
  mock.module(resolve(base, file), () => exports);
}

// no identity service here: /whoami and /authcfg answer 404, so the join is a plain door join
globalThis.fetch = (async () => new Response('', { status: 404 })) as any;
const timers = new Map<number, Function>();
let timerId = 0;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: Function) => { timers.set(++timerId, fn); return timerId; }) as any;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as any;
const sockets: any[] = [];
globalThis.WebSocket = function () {
  const socket = Object.assign(new EventTarget(), {
    readyState: 0, onclose: null as any, onopen: null as any, onmessage: null as any, sent: [] as string[],
    send(d: string) { this.sent.push(d); }, close() { if (this.readyState < 2) this.readyState = 2; },
    finish(code = 1006) { this.readyState = 3; const ev = Object.assign(new Event('close'), { code }); Object.defineProperty(ev, 'target', { value: this }); this.onclose?.(ev); this.dispatchEvent(new Event('close')); },
  });
  sockets.push(socket);
  return socket;
} as any;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

const { net, connect, leaveWorld, rejoin, wireNet, sendRequest } = await import('../client/lib/net.js');
wireNet({ myAvatarPath: () => 'eidoverse/assets/vrms/claude.vrm', myPose: () => null });

await connect();
const first = sockets[0];
first.readyState = 1; first.onopen();
first.finish();
const redials = () => [...timers.values()].length;
assert.ok(redials() >= 1, 'a dropped connection schedules a redial');
const before = timers.size;
await leaveWorld();
assert.ok(timers.size < before, 'departure cancels the pending redial');
for (const fn of [...timers.values()]) fn();   // anything left (a clock tick, a history timeout) must not redial
await flush();
assert.equal(sockets.length, 1, 'no redial survives departure');
assert.equal(net.joined, false);
assert.equal(net.status, 'departed');
await connect(); assert.equal(sockets.length, 1, 'a departed page cannot connect again by itself');

// an explicit re-entry is allowed, but departing during its identity fetch wins
rejoin();
await leaveWorld();
await flush();
assert.equal(sockets.length, 1, 'an in-flight connect cannot resurrect departed presence');

// a re-entry that opens; a request in flight is answered when the visitor leaves, never left to land later
rejoin(); await flush();
const second = sockets.at(-1); assert.notEqual(second, first);
second.readyState = 1; second.onopen();
net.joined = true;   // the snapshot's job; this suite doesn't speak the join protocol
const asked = sendRequest('say', { text: 'still here?' });
let done = false;
const leaving = leaveWorld().then(() => { done = true; });
await flush();
assert.deepEqual((await asked).refused?.code, 'offline', 'a request in flight is answered at departure');
assert.equal(done, false, 'departure waits for the socket to close');
assert.equal(second.readyState, 2);
const timersBeforeClose = timers.size;
second.finish(1000); await leaving;
assert.equal(done, true);
assert.equal(timers.size <= timersBeforeClose, true, 'closing deliberately schedules no redial');
assert.equal(net.status, 'departed', 'and shows no refusal or retry');
globalThis.setTimeout = realSetTimeout;
console.log('World departure lifecycle checks passed');
process.exit(0);
