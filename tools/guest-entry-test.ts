// Guest entry must downgrade a logged-in browser, retain the door key gate,
// and require a visitor grant in an already-owned world. Own every resource.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scratchSequencer } from './harness.ts';

const run = await scratchSequencer('guest-entry', {
  prepare(scratch) {
    const world = join(scratch, 'worlds', 'guest-test');
    mkdirSync(world, { recursive: true });
    writeFileSync(join(world, 'log.jsonl'), JSON.stringify({
      seq: 0, ts: 1700000000000, actor: 'world', verb: 'grant',
      args: { id: 'ExampleOwner', role: 'owner', gen: true, sub: 'human:example:owner' },
    }) + '\n');
  },
  preload: new URL('./fixtures/guest-entry-session.ts', import.meta.url).pathname,
  serverEnv: { JOIN_TOKEN: 'test-door', WORLD_ADMIN: '', FOLD_EVERY: process.env.FOLD_EVERY || '1' },
});
const sockets: WebSocket[] = [];
const cookie = `ew_sess=${'a'.repeat(64)}`;
function connect(args: Record<string, unknown>, authenticated = false) {
  const ws = new WebSocket(run.BASE.replace('http:', 'ws:') + '/ws', authenticated ? { headers: { cookie } } as any : undefined);
  sockets.push(ws);
  const queued: any[] = [];
  const waiting: { predicate: (message: any) => boolean; resolve: (message: any) => void }[] = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const index = waiting.findIndex((entry) => entry.predicate(message));
    if (index < 0) queued.push(message);
    else waiting.splice(index, 1)[0].resolve(message);
  };
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', world: 'guest-test', ...args }));
  const next = (predicate: (message: any) => boolean) => {
    const index = queued.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('world response timeout')), 5000);
      waiting.push({ predicate, resolve: (message) => { clearTimeout(timer); resolve(message); } });
    });
  };
  return { ws, next };
}
let failed = true;
try {
  const version = await (await fetch(`${run.BASE}/version`)).json() as any;
  assert.equal(version.capabilities.guestEntry, 1);
  const owner = connect({ id: 'IgnoredName' }, true);
  const ownerSnapshot = await owner.next((message) => message.type === 'snapshot');
  assert.equal(ownerSnapshot.you, 'ExampleOwner');
  assert.equal(ownerSnapshot.yourRights.role, 'owner');
  owner.ws.send(JSON.stringify({ type: 'verb', verb: 'grant', args: { id: 'guest-example', role: 'visitor', gen: false } }));
  await owner.next((message) => message.type === 'log' && message.entry.verb === 'grant' && message.entry.args.id === 'guest-example');
  owner.ws.send(JSON.stringify({ type: 'verb', verb: 'say', args: { text: 'Example conversation before the visit.' } }));
  await owner.next((message) => message.type === 'log' && message.entry.verb === 'say');

  const noKey = connect({ id: 'guest-example', guest: true }, true);
  assert.match((await noKey.next((message) => message.type === 'error')).error, /join token/);
  const guest = connect({ id: 'guest-example', guest: true, token: 'test-door' }, true);
  const snapshot = await guest.next((message) => message.type === 'snapshot');
  assert.equal(snapshot.you, 'guest-example');
  assert.equal(snapshot.yourRights.role, 'visitor');
  assert.equal(snapshot.yourRights.gen, false);
  assert.equal(snapshot.yourRights.open, false);
  assert.deepEqual(snapshot.state.recentChat, []);
  assert.equal(snapshot.entries.some((entry: any) => entry.verb === 'say'), false);
  guest.ws.send(JSON.stringify({ type: 'verb', verb: 'say', args: { text: 'Hello from the example guest.' } }));
  const greeting = await owner.next((message) => message.type === 'log' && message.entry.verb === 'say');
  assert.equal(greeting.entry.actor, 'guest-example');
  guest.ws.send(JSON.stringify({ type: 'history', reqId: 'guest-history', limit: 50 }));
  const history = await guest.next((message) => message.type === 'history');
  assert.equal(history.entries.some((entry: any) => entry.args?.text === 'Example conversation before the visit.'), false);
  assert.equal(history.entries.some((entry: any) => entry.args?.text === 'Hello from the example guest.'), true);
  guest.ws.send(JSON.stringify({ type: 'verb', verb: 'spawn', args: { id: 'forbidden', lib: 'example.glb', pos: [0, 0, 0] } }));
  assert.match((await guest.next((message) => message.type === 'error')).error, /visitor|permission|builder|role/i);

  owner.ws.send(JSON.stringify({ type: 'verb', verb: 'grant', args: { id: '*', role: 'visitor', gen: false } }));
  await owner.next((message) => message.type === 'log' && message.entry.verb === 'grant' && message.entry.args.id === '*');
  // A wildcard visitor policy is not an admission for an ungranted identity.
  for (const args of [
    { id: 'ExampleOwner' }, { id: 'unknown-guest' }, { id: 'guest-example', world: 'empty-world' },
  ]) {
    const refused = connect({ ...args, guest: true, token: 'test-door' }, true);
    assert.match((await refused.next((message) => message.type === 'error')).error, /visitor grant/);
  }
  console.log('Guest admission passed: account downgrade, visitor chat, edit refusal, door key, and existing-world gates.');
  failed = false;
} finally {
  sockets.forEach((socket) => socket.close());
  await run.cleanup(failed ? 1 : 0);
}
