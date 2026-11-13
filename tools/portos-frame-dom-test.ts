// The REAL frame receiver (client/lib/portosframe.js) and the REAL use prompt (client/lib/useprompt.js), which is where
// the current protocol offers a thing's contextual action (E, the pad's X / □, a tap). Fork-only (docs/portos-frame.md).
// No GPU, no live world: the use prompt's other imports are stubs, the world is a map of flat component bags.
// Configuration timing and stale-message guards use promises, never sleeps.
//   BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun tools/portos-frame-dom-test.ts
// Ported to the current protocol: the old protocol drove this through the floating-label overlay's details panel (objectlabels.js, upstream PR #168, closed
// as superseded). The host's actions now ride the use prompt, and a label preference is ignored (no overlay ships).
import { mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { strict as assert } from 'node:assert';
import * as THREE from '../client/node_modules/three/build/three.module.js';
GlobalRegistrator.register({ url: 'https://renderer.example/' });
const origin = 'https://host.example';
const sent: { data: any; origin: string }[] = [];
const host = { postMessage: (data: any, origin: string) => sent.push({ data, origin }) };
Object.defineProperty(window, 'parent', { value: host, configurable: true });
let answer: (value: Response) => void;
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => new Promise(resolve => { answer = resolve; })) as typeof fetch;
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const send = (data: any, from: any = host, sourceOrigin = origin) => window.dispatchEvent(new MessageEvent('message', {
  data, source: from as any, origin: sourceOrigin,
}));

const base = `${import.meta.dir}/../client/lib/`;
const bags = new Map<string, any>();
const entities = new Map<string, any>();
const uses: string[] = [];
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 1.6, 2); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
mock.module(`${base}core.js`, () => ({ THREE, camera }));
mock.module(`${base}world.js`, () => ({ bags: () => bags, bagOf: (id: string) => bags.get(id) ?? null, entities }));
mock.module(`${base}myview.js`, () => ({ outOfMyView: () => false }));
mock.module(`${base}base.js`, () => ({ bus: { on() {}, emit() {} } }));
mock.module(`${base}actions.js`, () => ({ register() {} }));
mock.module(`${base}xrask.js`, () => ({ xrActive: () => false }));
mock.module(`${base}plainwords.js`, () => ({ nameOf: (id: string) => id, plain: (w: string) => w }));
mock.module(`${base}net.js`, () => ({ sendRequest: async () => ({ ok: true }) }));
mock.module(`${base}thingphysics.js`, () => ({ requestWithBody: async (_v: string, a: any) => { uses.push(`${a.id}:${a.action}`); return { ok: true }; } }));
mock.module(`${base}ui.js`, () => ({ flashHint() {} }));
mock.module(`${base}input.js`, () => ({ usePrompt: () => 'E' }));
mock.module(`${base}markup.js`, () => ({ html: (s: TemplateStringsArray, ...v: unknown[]) => String.raw({ raw: s }, ...v) }));

const { requestIdentityRename, setDepartureHandler, portosSession } = await import('../client/lib/portosframe.js');
const { initUsePrompt, usable, useNearest } = await import('../client/lib/useprompt.js');
initUsePrompt({ myPos: () => ({ x: 0, y: 0, z: 0.5 }), camera, editing: () => false, busy: () => false });

const thing = (id: string, bag: any) => { bags.set(id, bag); const o = new THREE.Group(); o.position.set(0, 0, 0); entities.set(id, o); };
thing('landmark', { label: 'Example Goals', 'portos/link': { route: '/goals/list' }, reactions: { ring: { kind: 'play' } } });

const hello = { type: 'portos:connect', version: 1, nonce: 'one', capabilities: { identityRenameRequest: 1 } };
assert.equal(requestIdentityRename('Example Visitor'), false, 'without a trusted handshake no identity change is requested');
assert.equal(usable()?.action, 'ring', 'no session: the thing offers its ordinary use');
send(hello);
assert.equal(sent.length, 0, 'an early host claim is held until trusted config resolves');
assert.equal(portosSession(), false);
answer!(new Response(JSON.stringify({ parentOrigin: origin }), { status: 200 }));
await settle();
assert.deepEqual(sent[0], { origin, data: { type: 'eidoverse:ready', version: 1, nonce: 'one', capabilities: { portosNavigation: 1, worldDeparture: 1, objectInteraction: 1, identityRenameRequest: 1 } } });
assert.equal(requestIdentityRename('  Example Visitor  '), true);
assert.deepEqual(sent.at(-1), { origin, data: { type: 'eidoverse:identity-rename', version: 1, nonce: 'one', name: 'Example Visitor' } });
assert.equal(requestIdentityRename('x'.repeat(65)), false, 'oversized identity requests never cross the frame');

// the host's action wins the prompt while the session lives, and the press is the one navigate
assert.deepEqual(usable(), { id: 'landmark', action: 'open', verb: 'open in PortOS', portos: true });
await useNearest();
assert.deepEqual(sent.at(-1), { origin, data: { type: 'eidoverse:navigate', version: 1, nonce: 'one', entityId: 'landmark', route: '/goals/list' } });
assert.deepEqual(uses, [], 'and it is not also a world use');

// forged, stale or foreign messages change nothing; a label preference is ignored (no overlay ships)
const before = sent.length;
send({ ...hello, nonce: 'forged' }, { postMessage: () => {} });
send({ ...hello, nonce: 'forged' }, host, 'https://other.example');
send({ ...hello, nonce: 'forged', version: 2 });
send({ type: 'portos:label-preference', version: 1, nonce: 'one', labelVisibility: 'off' });
await useNearest();
assert.equal(sent.at(-1)!.data.nonce, 'one', 'invalid messages cannot replace the session');
assert.equal(sent.length, before + 1);

send({ ...hello, nonce: 'two' });
await useNearest(); assert.equal(sent.at(-1)!.data.nonce, 'two', 'a replacement connect retires the old nonce');
send({ ...hello, nonce: 'no-rename', capabilities: {} });
assert.equal(requestIdentityRename('Example Two'), false, 'a host must advertise identity rename support for the current session');

// a teleport pod: the launcher route with action visit
bags.set('landmark', { ...bags.get('landmark'), 'portos/link': { route: '/eidoverse', action: 'visit' } });
assert.equal(usable()?.verb, 'teleport as guest', 'a visitor pod names the action it performs');
await useNearest();
assert.deepEqual(sent.at(-1)!.data, { type: 'eidoverse:navigate', version: 1, nonce: 'no-rename', entityId: 'landmark', route: '/eidoverse' });
for (const route of ['https://other.example/', '/goals/list?query=1', '/goals/../apps']) {
  bags.set('landmark', { ...bags.get('landmark'), 'portos/link': { route } });
  assert.equal(usable()?.portos, undefined, `malformed route ${route} never offers navigation`);
}
bags.set('landmark', { ...bags.get('landmark'), 'portos/link': { route: '/goals/list' } });
assert.equal(usable()?.portos, true);
send({ ...hello, nonce: null });
assert.equal(portosSession(), false, 'an invalid replacement retires the session');
assert.equal(usable()?.action, 'ring', 'and the ordinary use is offered again');

// departure: the right nonce from the right window, once
send({ ...hello, nonce: 'departure' });
let closeSocket: Function, departures = 0;
setDepartureHandler(() => { departures++; return new Promise(resolve => { closeSocket = resolve; }); });
const request = { type: 'portos:depart', version: 1, nonce: 'departure' };
send({ ...request, nonce: 'stale' }); send(request, host, 'https://other.example');
await settle(); assert.equal(departures, 0);
send(request); send(request); await settle();
assert.equal(departures, 1, 'repeated departure requests close the session once');
assert(!sent.some(message => message.data.type === 'eidoverse:departed'));
closeSocket!(); await settle();
assert.deepEqual(sent.at(-1), { origin, data: { type: 'eidoverse:departed', version: 1, nonce: 'departure', ok: true } });

console.log('frame DOM: delayed trust, use-prompt navigation and teleport, invalid/stale messages, session retirement and departure passed');
globalThis.fetch = originalFetch;
GlobalRegistrator.unregister();
process.exit(0);
