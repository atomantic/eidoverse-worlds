// The actual net lifecycle with controlled sockets and timers: departure must
// cancel a queued reconnect and an in-flight connect, not merely hide a body.
import { strict as assert } from 'node:assert';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mock } from 'bun:test';
GlobalRegistrator.register({ url: 'https://renderer.example/' });
const stubs = await import('./remotes-stubs.mjs');
for (const name of ['core', 'assets', 'world', 'chat', 'fp_view', 'boot', 'ui', 'avatar']) {
  mock.module(`${import.meta.dir}/../client/lib/${name}.js`, () => stubs);
}
mock.module(`${import.meta.dir}/../client/lib/capture.js`, () => ({ captureFrame() {}, captureFrom() {} }));
mock.module(`${import.meta.dir}/../client/lib/reachnet.js`, () => ({ myReachBag() {} }));
mock.module(`${import.meta.dir}/../client/lib/remotes.js`, () => ({ remotes: new Map(), ensureRemote() {},
  dropRemote() {}, pushPose() {}, noteServerTime() {}, noteSpeaking() {} }));
const { CONFIG } = await import('../client/lib/base.js');
CONFIG.guest = true;
const timers = new Map<number, Function>();
let timerId = 0;
globalThis.setTimeout = ((fn: Function) => { timers.set(++timerId, fn); return timerId; }) as any;
globalThis.clearTimeout = ((id: number) => timers.delete(id)) as any;
const sockets: any[] = [];
globalThis.WebSocket = function () {
  const socket = Object.assign(new EventTarget(), {
    readyState: 0, onclose: null as any, onopen: null as any, onmessage: null as any,
    send() {}, close() { this.readyState = 2; },
    finish() { this.readyState = 3; this.onclose?.({ code: 1000 }); this.dispatchEvent(new Event('close')); },
  });
  sockets.push(socket);
  return socket;
} as any;
const { net, connect, leaveWorld, rejoin } = await import('../client/lib/net.js');
await connect();
const first = sockets[0]; first.readyState = 1; first.onopen();
first.finish();
assert.equal(timers.size, 1, 'disconnect schedules a retry');
await leaveWorld();
assert.equal(timers.size, 0, 'departure cancels the retry');
assert.equal(net.joined, false);
await connect(); assert.equal(sockets.length, 1, 'departure cannot reconnect');
// Explicit re-entry is allowed, but departing during its identity await wins.
rejoin();
await leaveWorld();
await Promise.resolve();
assert.equal(sockets.length, 1, 'in-flight connect cannot resurrect departed presence');
rejoin(); await Promise.resolve(); await Promise.resolve();
const second = sockets.at(-1); second.readyState = 1; second.onopen();
let done = false;
const leaving = leaveWorld().then(() => { done = true; });
await Promise.resolve(); assert.equal(done, false, 'departure waits for socket close');
assert.equal(second.readyState, 2);
second.finish(); await leaving;
assert.equal(done, true);
assert.equal(timers.size, 0, 'closing deliberately never schedules a reconnect');
console.log('World departure lifecycle checks passed');
