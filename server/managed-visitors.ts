import { randomUUID, timingSafeEqual } from 'node:crypto';

export const MANAGED_CAPABILITY = Object.freeze({ version: 1, bodies: ['fly-v1'], controllerRaster: { width: 8, height: 4, channels: 3 }, actions: ['start', 'pause', 'rest', 'move', 'leave'], expiryEnforced: true });
export const GENTLE_PATCH = Object.freeze({ version: 1, radius: 2, height: 0.3, flowers: [
  { x: -1, z: 1, rgb: [230, 100, 160] }, { x: 1, z: 1, rgb: [230, 190, 70] },
  { x: 1, z: -1, rgb: [120, 160, 240] }, { x: -1, z: -1, rgb: [190, 120, 230] },
] });
const exact = (v: any, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const identity = (v: any) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
const scopeKeys = ['appId', 'individualId', 'individualSessionId', 'worldId', 'epoch'];
const prefix = '/api/managed-visitors/v1';
class Refusal extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Separate ephemeral lane: never an ordinary user, world verb, puppet or physics body. */
export function createManagedVisitors({ token = '', allowedWorlds = [], exists = (_: string) => false, now = Date.now }: { token?: string, allowedWorlds?: string[], exists?: (world: string) => boolean, now?: () => number } = {}) {
  const sessions = new Map<string, any>();
  let lastNow = now();
  function clock() {
    const time = now();
    if (!Number.isSafeInteger(time) || time < lastNow) { sessions.clear(); throw new Refusal('Host clock invalid; visitor leases revoked.', 409); }
    lastNow = time;
    for (const [id, s] of sessions) if (time >= s.expiresAt) sessions.delete(id);
    return time;
  }
  const enabled = () => /^[a-f0-9]{64}$/.test(token) && allowedWorlds.length > 0;
  const scope = (s: any) => ({ appId: s.appId, individualId: s.individualId, individualSessionId: s.individualSessionId, worldId: s.worldId, epoch: s.epoch });
  const state = (s: any) => ({ version: 1, sessionId: s.sessionId, expiresAt: s.expiresAt, ...scope(s), status: s.status, pose: { ...s.pose } });
  function publicState(worldId: string) {
    try { clock(); } catch { /* Cleared on backward clock; observers immediately lose expired bodies. */ }
    return { type: 'managed-flies', version: 1, worldId, patch: GENTLE_PATCH,
      visitors: [...sessions.values()].filter(s => s.worldId === worldId).map(s => ({
        sessionId: s.sessionId, individualId: s.individualId, epoch: s.epoch, body: 'fly-v1',
        status: s.status, expiresAt: s.expiresAt, pose: { ...s.pose },
      })) };
  }
  async function handle(req: Request): Promise<Response | null> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith(prefix)) return null;
    try {
      if (!enabled()) throw new Refusal('Managed visitors are not configured.', 503);
      const auth = req.headers.get('authorization') ?? '';
      const supplied = Buffer.from(auth), expected = Buffer.from(`Bearer ${token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Refusal('Dedicated broker credential required.', 401);
      clock();
      if (path === `${prefix}/version` && req.method === 'GET') return Response.json({ capabilities: { managedVisitors: MANAGED_CAPABILITY } });
      if (req.method !== 'POST') throw new Refusal('Unsupported managed visitor route.', 404);
      if (Number(req.headers.get('content-length')) > 4096) throw new Refusal('Managed request too large.', 413);
      const reader = req.body?.getReader(); let bytes = 0; const parts: Uint8Array[] = [];
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4096) { await reader.cancel(); throw new Refusal('Managed request too large.', 413); } parts.push(value); }
      let body: any; try { body = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new Refusal('Invalid JSON.'); }
      // Recheck after async body consumption; no stale admission/action can outlive its lease.
      const admittedAt = clock();
      if (path === `${prefix}/admissions`) {
        if (!exact(body, ['version', 'appId', 'individualId', 'individualSessionId', 'worldId', 'body', 'ttlMs']) || body.version !== 1 || body.body !== 'fly-v1' || !['appId', 'individualId', 'individualSessionId'].every(k => identity(body[k])) || !allowedWorlds.includes(body.worldId) || !exists(body.worldId) || !Number.isInteger(body.ttlMs) || body.ttlMs < 1000 || body.ttlMs > 300000) throw new Refusal('Invalid or unavailable visitor scope/body/world.');
        if (sessions.size >= 64) throw new Refusal('Managed visitor capacity reached.', 409);
        if ([...sessions.values()].some(s => s.appId === body.appId && s.individualId === body.individualId)) throw new Refusal('Individual already has an active visitor lease.', 409);
        const s = { ...body, sessionId: randomUUID(), epoch: randomUUID(), expiresAt: admittedAt + body.ttlMs, status: 'paused', pose: { x: 0, z: 0, yaw: 0 }, sequence: -1, frameId: 0 };
        sessions.set(s.sessionId, s); return Response.json(state(s));
      }
      const match = path.match(/^\/api\/managed-visitors\/v1\/sessions\/([^/]+)\/(observations|actions|leave)$/);
      if (!match) throw new Refusal('Unknown managed route.', 404);
      const s = sessions.get(match[1]);
      if (match[2] === 'leave' && !s && exact(body, scopeKeys) && scopeKeys.every(k => identity(body[k]))) return Response.json({ version: 1, sessionId: match[1], ...body, status: 'left' });
      if (!s) throw new Refusal('Visitor lease absent or expired.', 410);
      if (!exact(body, match[2] !== 'actions' ? scopeKeys : [...scopeKeys, 'sequence', 'action']) || scopeKeys.some(k => body[k] !== s[k])) throw new Refusal('Visitor scope/epoch mismatch.', 409);
      if (match[2] === 'leave') { sessions.delete(s.sessionId); return Response.json({ ...state(s), status: 'left' }); }
      if (match[2] === 'observations') {
        // Original coarse spatial proxy of the visible patch: yaw-relative angular flower bins.
        // It is not a screenshot, anatomical retina, reward, target instruction or neural state.
        const rgb = Array.from({ length: 32 }, (_, i) => i < 16 ? [100, 150, 180] : [70, 115, 65]).flat();
        for (const flower of GENTLE_PATCH.flowers) {
          const dx = flower.x - s.pose.x, dz = flower.z - s.pose.z;
          const angle = Math.atan2(Math.sin(Math.atan2(dx, dz) - s.pose.yaw), Math.cos(Math.atan2(dx, dz) - s.pose.yaw));
          if (Math.abs(angle) > Math.PI / 3) continue;
          const column = Math.min(7, Math.max(0, Math.floor((angle / (Math.PI * 2 / 3) + 0.5) * 8)));
          const strength = Math.max(0, 1 - Math.hypot(dx, dz) / 6);
          for (let channel = 0; channel < 3; channel++) rgb[(16 + column) * 3 + channel] = Math.round(65 * (1 - strength) + flower.rgb[channel] * strength);
        }
        return Response.json({ ...scope(s), version: 1, sessionId: s.sessionId, frameId: s.frameId++, capturedAtMs: admittedAt, camera: 'controller', width: 8, height: 4, rgb, pose: { ...s.pose }, sensorySource: 'engineered-gentle-patch-spatial-proxy-v1' });
      }
      if (!Number.isSafeInteger(body.sequence) || body.sequence !== s.sequence + 1) throw new Refusal('Stale visitor action sequence.', 409);
      const a = body.action;
      if (a?.type === 'move') {
        if (!exact(a, ['type', 'forward', 'yaw', 'intervalMs']) || !Number.isFinite(a.forward) || a.forward < 0 || a.forward > 0.12 || !Number.isFinite(a.yaw) || Math.abs(a.yaw) > 0.8 || a.intervalMs !== 5 || s.status !== 'running') throw new Refusal('Invalid movement or explicit start required.', 409);
        s.pose.yaw = Math.atan2(Math.sin(s.pose.yaw + a.yaw * 0.005), Math.cos(s.pose.yaw + a.yaw * 0.005));
        s.pose.x = Math.min(2, Math.max(-2, s.pose.x + Math.sin(s.pose.yaw) * a.forward * 0.005));
        s.pose.z = Math.min(2, Math.max(-2, s.pose.z + Math.cos(s.pose.yaw) * a.forward * 0.005));
      } else {
        if (!exact(a, ['type']) || !['start', 'pause', 'rest', 'leave'].includes(a.type)) throw new Refusal('Unsupported visitor action.');
        s.status = ({ start: 'running', pause: 'paused', rest: 'resting', leave: 'left' } as any)[a.type];
      }
      s.sequence = body.sequence;
      if (s.status === 'left') sessions.delete(s.sessionId);
      return Response.json({ ...state(s), sequence: s.sequence });
    } catch (error) { return Response.json({ error: error instanceof Refusal ? error.message : 'Managed visitor request failed.' }, { status: error instanceof Refusal ? error.status : 500 }); }
  }
  return { handle, publicState, enabled };
}
