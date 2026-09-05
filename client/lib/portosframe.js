// The browser half of frame-contract V1 (docs/labels.md): a data-only bridge
// to ONE trusted embedding host. Deliberately dependency-free — main.js
// imports it first, before core.js touches a GPU, because the host posts
// `portos:connect` the moment the iframe's load event fires and that is long
// before this renderer has a scene. A connect that beats our configuration
// fetch is HELD, never answered from the sender's own claim about itself.
//
// Read-only in both directions: no verb, no lease, no world write, and the one
// outbound message names an already-projected entity plus one route the host
// re-checks against its own legend.
import {
  FRAME_VERSION, FRAME_CAPABILITIES, acceptsFrameMessage,
  readFrameNonce, readFrameOrigin, readFramePreference, readFrameRoute, frameRouteFor,
} from '../../shared/portosframe.js';

export { frameRouteFor };

// Standalone tabs have no host. `window.parent === window` at the top level,
// so the bridge simply never arms and the scene is unchanged.
const host = typeof window !== 'undefined' && window.parent !== window ? window.parent : null;
let origin = null;      // the exact configured parent origin, once known
let configured = false; // the fetch settled — held connects stop accumulating
let nonce = null;       // the CURRENT session; a replacement retires the last
let preference = null;  // last preference the host asked for
const held = [];        // connects that arrived before configuration landed
const preferenceSinks = new Set(), sessionSinks = new Set();

/** Is a validated host session live right now? */
export function portosSession() { return nonce !== null; }

/** Label preference from the host. Replays the current value on subscribe, so
 *  a panel built after the handshake still opens in the state the host asked
 *  for rather than the one it happened to load with. */
export function onPortosLabelPreference(fn) {
  preferenceSinks.add(fn);
  if (preference !== null) fn(preference);
}

/** Session came up or went away — the affordances it gates redraw on this. */
export function onPortosSession(fn) {
  sessionSinks.add(fn);
  if (nonce !== null) fn(true);
}

/** The one outbound message, and only from an explicit user action. Returns
 *  false when anything about the session or the route fails to check out. */
export function openInPortos(entityId, route) {
  const target = readFrameRoute(route);
  if (!host || origin === null || nonce === null || target === null) return false;
  if (typeof entityId !== 'string' || !entityId || entityId.length > 128) return false;
  host.postMessage({ type: 'eidoverse:navigate', version: FRAME_VERSION, nonce, entityId, route: target }, origin);
  return true;
}

function applyPreference(value) {
  const next = readFramePreference(value);
  if (next === null || next === preference) return;
  preference = next;
  for (const sink of preferenceSinks) sink(next);
}

function connect(data) {
  const next = readFrameNonce(data.nonce);
  const was = nonce !== null;
  // A replacement supersedes the prior session even when the new one is
  // unusable: whatever the host held is gone, so its old nonce must stop
  // working rather than outlive the handshake that retired it.
  nonce = next;
  if (next !== null) {
    host.postMessage({ type: 'eidoverse:ready', version: FRAME_VERSION, nonce: next,
      capabilities: { ...FRAME_CAPABILITIES } }, origin);
    applyPreference(data.labelVisibility);
  }
  if (was !== (next !== null)) for (const sink of sessionSinks) sink(next !== null);
}

function receive(event) {
  // Only the actual parent window is ever heard, so nothing else can queue.
  if (!host || event.source !== host) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  if (!configured) {
    if (data.type === 'portos:connect' && held.length < 8) held.push(event);
    return;
  }
  if (origin === null || !acceptsFrameMessage(event, { source: host, origin })) return;
  if (data.type === 'portos:connect') connect(data);
  // A preference only ever rides the session that asked for it.
  else if (data.type === 'portos:label-preference' && nonce !== null && data.nonce === nonce) {
    applyPreference(data.labelVisibility);
  }
  // Anything else is ignored: an unsupported message leaves the scene alone.
}

function settle(value) {
  // Idempotent on purpose: a second answer must never retract the first, and
  // the bridge must not be disarmed by anything that throws downstream of it.
  if (configured) return;
  origin = readFrameOrigin(value);
  configured = true;
  const queued = held.splice(0, held.length);
  if (origin !== null) for (const event of queued) receive(event);
}

if (host) {
  window.addEventListener('message', receive);
  // GET /embed-config is the trusted embedding configuration; the operator
  // sets it, and an unset one leaves the bridge permanently dormant.
  // The rejection handler sits BEFORE settle, so a failed fetch, a non-200
  // answer or unparseable JSON all resolve to "no embedder" while an exception
  // raised by a subscriber during the replay is left to surface as itself.
  fetch('/embed-config')
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => c?.parentOrigin ?? null, () => null)
    .then(settle);
}
