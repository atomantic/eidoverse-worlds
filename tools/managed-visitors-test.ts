import { test, expect } from 'bun:test';
import { createManagedVisitors } from '../server/managed-visitors.ts';
const token = 'ab'.repeat(32);
const prefix = '/api/managed-visitors/v1';
function fixture() {
  let time = 10000;
  const host = createManagedVisitors({ token, allowedWorlds: ['scratch'], exists: id => id === 'scratch', now: () => time });
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: async (req, srv) => await host.handle(req, srv.requestIP(req)?.address ?? '') ?? new Response('missing', { status: 404 }) });
  const request = async (path: string, body?: any, credential = token) => {
    const response = await fetch(`${server.url}${prefix}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${credential}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const admission = { version: 1, appId: 'fly-garden', individualId: 'one', individualSessionId: 'neural-session', worldId: 'scratch', body: 'fly-v1', ttlMs: 1000 };
  return { host, server, request, admission, setTime: (v: number) => time = v };
}
const scope = (s: any) => Object.fromEntries(['appId', 'individualId', 'individualSessionId', 'worldId', 'epoch'].map(k => [k, s[k]]));
test('HTTP negotiation default denies; only exact configured body/world scopes admit paused', async () => {
  expect((await createManagedVisitors().handle(new Request(`http://localhost${prefix}/version`)))?.status).toBe(503);
  const f = fixture(); try {
    expect((await f.request('/version', undefined, 'wrong')).status).toBe(401);
    expect((await f.request('/version')).body.capabilities.managedVisitors.bodies).toEqual(['fly-v1']);
    for (const patch of [{ body: 'humanoid' }, { worldId: 'other' }, { ttlMs: 300001 }, { privateHistory: [] }]) expect((await f.request('/admissions', { ...f.admission, ...patch })).status).toBe(400);
    const { body: s } = await f.request('/admissions', f.admission);
    expect(s.status).toBe('paused'); expect(f.host.publicState('scratch').visitors.length).toBe(1);
    expect(f.host.publicState('other').visitors).toEqual([]);
    expect((await f.request('/admissions', f.admission)).status).toBe(409);
  } finally { f.server.stop(true); }
});
test('HTTP observation/movement causal pose, stale sequences, scope isolation, rest and leave', async () => {
  const f = fixture(); try {
    const { body: s } = await f.request('/admissions', f.admission), base = `/sessions/${s.sessionId}`;
    const action = (sequence: number, action: any, patch = {}) => f.request(`${base}/actions`, { ...scope(s), sequence, action, ...patch });
    expect((await action(0, { type: 'move', forward: 0.12, yaw: 0, intervalMs: 5 })).status).toBe(409);
    expect((await action(0, { type: 'start' }, { epoch: 'stale' })).status).toBe(409);
    expect((await action(0, { type: 'start' })).status).toBe(200);
    expect((await action(0, { type: 'pause' })).status).toBe(409);
    expect((await action(1, { type: 'force', power: 1 })).status).toBe(400);
    const move = await action(1, { type: 'move', forward: 0.12, yaw: 0, intervalMs: 5 });
    expect(move.body.pose.z).toBeCloseTo(0.0006);
    const observation = await f.request(`${base}/observations`, scope(s));
    expect(observation.body.rgb).toHaveLength(96); expect(observation.body.pose).toEqual(move.body.pose);
    expect(observation.body.sensorySource).toBe('engineered-gentle-patch-spatial-proxy-v1');
    expect((await f.request(`${base}/observations`, { ...scope(s), individualId: 'other' })).status).toBe(409);
    expect((await action(2, { type: 'rest' })).body.status).toBe('resting');
    expect((await action(3, { type: 'move', forward: 0.1, yaw: 0, intervalMs: 5 })).status).toBe(409);
    expect((await action(3, { type: 'leave' })).body.status).toBe('left');
    expect(f.host.publicState('scratch').visitors).toEqual([]);
    expect((await f.request(`${base}/observations`, scope(s))).status).toBe(410);
  } finally { f.server.stop(true); }
});
test('expiry and backward clock revoke both observation authority and public presence', async () => {
  const f = fixture(); try {
    const { body: s } = await f.request('/admissions', f.admission);
    f.setTime(11000); expect(f.host.publicState('scratch').visitors).toEqual([]);
    expect((await f.request(`/sessions/${s.sessionId}/observations`, scope(s))).status).toBe(410);
    const { body: newer } = await f.request('/admissions', f.admission);
    expect(newer.epoch).not.toBe(s.epoch);
    f.setTime(10999); expect(f.host.publicState('scratch').visitors).toEqual([]);
  } finally { f.server.stop(true); }
});

test('unsequenced scoped leave wins over delayed commands and remains idempotent', async () => {
  const f = fixture(); try {
    const { body: s } = await f.request('/admissions', f.admission), base = `/sessions/${s.sessionId}`;
    expect((await f.request(`${base}/leave`, { ...scope(s), epoch: 'wrong' })).status).toBe(409);
    expect((await f.request(`${base}/leave`, scope(s))).body.status).toBe('left');
    expect((await f.request(`${base}/leave`, scope(s))).body.status).toBe('left');
    expect((await f.request(`${base}/actions`, { ...scope(s), sequence: 0, action: { type: 'start' } })).status).toBe(410);
    expect(f.host.publicState('scratch').visitors).toEqual([]);
  } finally { f.server.stop(true); }
});

test('server-only host lane uses actual socket address and rejects browser origins', async () => {
  const host = createManagedVisitors({ token, allowedWorlds: ['scratch'], exists: () => true });
  const request = (extra = {}) => new Request(`http://localhost${prefix}/version`, { headers: { authorization: `Bearer ${token}`, ...extra } });
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect((await host.handle(request(), address))?.status).toBe(200);
  for (const address of ['', '192.0.2.1', '100.64.1.2']) expect((await host.handle(request({ 'x-forwarded-for': '127.0.0.1' }), address))?.status).toBe(403);
  for (const origin of ['https://outside.invalid', 'http://localhost', 'null']) expect((await host.handle(request({ origin }), '127.0.0.1'))?.status).toBe(403);
});
