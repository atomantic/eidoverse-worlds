// A port occupied by an unrelated world must never receive fixture seed writes.
import { strict as assert } from 'node:assert';
let writes = 0;
const unrelated = Bun.serve({ hostname: '127.0.0.1', port: 8993, fetch(request) {
  if (request.method !== 'GET' || new URL(request.url).pathname !== '/version') writes++;
  return Response.json({ sha: 'unrelated-server', instance: 'not-the-fixture' });
} });
const child = Bun.spawn([process.execPath, 'tools/interaction-preview.ts'], {
  cwd: `${import.meta.dir}/..`, stdout: 'ignore', stderr: 'ignore',
});
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
const code = await child.exited;
clearTimeout(timeout);
unrelated.stop();
assert.equal(timedOut, false, 'the fixture exits promptly when its own server cannot bind');
assert.notEqual(code, 0);
assert.equal(writes, 0, 'an unrelated listener receives no world/seed requests');
console.log('Interaction preview ownership guard passed');
