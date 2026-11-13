// residency — the `portos/residency` component's MEANING, as one pure module.
//
// PortOS fork only (docs/FORK.md): upstream PR #164 was withdrawn on purpose.
//
// A `set {id, component: "portos/residency", value: {...}}` declares that an
// entity is a HOST SYSTEM's marker in this world: a waystone saying which
// machine lives here, which mind runs it, and which agents it fields. Under
// this protocol a bare component name is the registry's, so the record is a
// NAMESPACED component (AGENTS.md "Components"): the authority keeps it,
// replays it and shows it honestly without reading it — no verb, no registry
// entry, no fold change. This file is the evaluator.
//
// Why a world needs one at all: an agent ecosystem is otherwise invisible.
// The log records that `harbor.wright` spawned a crate, and nothing anywhere
// says that body is one of six an instance called Harbor fields, or that
// Harbor is a coordinator mind on a ExampleHost install, or that the install
// considers this world somewhere it LIVES rather than somewhere it visited.
// That is the difference between an actor id and a resident. The declaration
// carries the identity; the log carries the proof (see `traceResidents` —
// the roster is a claim, the acts are the evidence, and they are reported
// separately on purpose).
//
// Nothing here touches THREE, the DOM, the network or the clock; it is
// imported verbatim by
//
//   mcpl/agent.ts       text-tier perception: look(), and the live change line
//   server/routes.ts    GET /residency — the projection other instances poll
//                       (a record that won't read is reported there, with why)
//   tools/residency-plant.ts   descriptor → the request that plants it
//
// so a browser, a late joiner, a resident who perceives by reading and the
// instance that planted the marker cannot disagree about who lives here.
// Same discipline as particles.js and forecast.js: shared facts out of one
// function, no second opinions.
//
// The DATA belongs to the instance, not to this repo: a descriptor is a
// host system's own identity, kept wherever that host keeps its instance data
// (residency/README.md), and passed to the planter as a path. What lives here
// is only what could not live anywhere else — the meaning a world gives it.
//
// NOTHING IN A RESIDENCY RECORD IS A CREDENTIAL OR AN ADDRESS. The bag is
// public, permanent, replayed to everyone who ever joins, and forkable — so
// the model deliberately has no field for a hostname, an IP, a tailnet name,
// a token, or a person. An instance identifies itself by a name it chose.
//
// Unit-tested in tools/residency-test.ts.

/** The component this module gives meaning to. Namespaced: the protocol refuses an
 *  unregistered bare name, and this meaning is the fork's, not the registry's. */
export const RESIDENCY_COMPONENT = 'portos/residency';

/** The roles an ecosystem's members announce themselves in, and how each
 *  reads in prose. A role outside this list is never erased — it reads
 *  quoted, the same forward-compatibility the component bag has everywhere
 *  else — because the vocabulary of a hosting stack is not this world's to
 *  fix. */
export const RESIDENT_ROLES = Object.freeze({
  'coordinator': 'coordinator',
  planner: 'planner',
  builder: 'builder',
  reviewer: 'reviewer',
  scribe: 'scribe',
  sentinel: 'sentinel',
  courier: 'courier',
  researcher: 'researcher',
  operator: 'operator',
});

/** A roster is a marker, not a directory: an instance that fields hundreds of
 *  ephemeral workers names the standing ones. A full roster stays a few KB,
 *  well inside one writer's per-window byte budget at the door, so a record
 *  that hits the cap is a modelling mistake rather than a size problem. */
export const RESIDENCY_MAX_AGENTS = 24;

/** The one asset every checkout of the library has (every test tool spawns
 *  it). A marker whose declared asset can't be a library path falls back
 *  here rather than failing to plant: a visible wrong box beats an invisible
 *  right one, and the note says which happened. */
export const RESIDENCY_MARKER_FALLBACK = 'eidoverse/assets/models/crate_large_red.glb';

const LIMITS = { instance: 64, system: 64, name: 64, about: 200, lore: 400, id: 96 };

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A key that only exists when it has content: an absent field and an empty
 *  one are the same thing in a record, and storing `""` would make a reader
 *  believe someone wrote it down. */
const some = (key, value) => (value ? { [key]: value } : {});

/** A library path, or null. Same shape rule the sequencer's resolveLibFile
 *  enforces (no ascent, .glb/.vrm), applied here so a descriptor is judged
 *  the same way on a machine with no library checked out at all. */
function markerModel(path) {
  const s = typeof path === 'string' ? path.trim() : '';
  if (!s || s.includes('..') || s.startsWith('/') || !/\.(glb|vrm)$/i.test(s)) return null;
  return s;
}

/** The display id an identity WEARS in a world, derived from its durable one:
 *  `agent:harbor.wright@example` → `harbor.wright`. Bodies join under short
 *  names; rosters are written with durable ones; this is the seam between
 *  them, and it is exported because the trace matcher and the planter must
 *  agree about it exactly. An explicit `as` on the roster entry always wins —
 *  derivation is a default, never an override. */
export function wornName(id) {
  return String(id ?? '').replace(/^[a-z]+:/i, '').split('@')[0].trim().toLowerCase();
}

/** How a role reads. Unknown roles stay legible rather than disappearing. */
export const roleReads = (role) => (typeof role === 'string' && Object.hasOwn(RESIDENT_ROLES, role)
  ? RESIDENT_ROLES[role] : role ? `"${role}"` : 'unspecified role');

/** Epoch ms from either an epoch or an ISO date. `Date.parse` is a pure
 *  function of its argument — this module still never asks what time it is. */
function sinceMs(v, notes) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 8.64e15) return Math.floor(v);
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  notes.push('since must be epoch ms or an ISO date — dropped');
  return null;
}

/** A role outside the vocabulary is kept and noted, never corrected: the
 *  vocabulary of a hosting stack is not this world's to fix. */
function noteRole(role, who, notes) {
  if (role && !Object.hasOwn(RESIDENT_ROLES, role)) {
    notes.push(`role "${role}" on ${who} is not one this world has a phrase for (${Object.keys(RESIDENT_ROLES).join('/')}) — it reads quoted`);
  }
  return role;
}

/**
 * Normalize an authored `residency` bag into the record every consumer reads.
 *
 * Returns `{ok: true, residency, notes}` — `notes` naming everything that was
 * clamped, dropped or defaulted — or `{ok: false, why}` when the bag names no
 * instance or no mind. As with particles, a failure here is never a fold
 * failure: the component still persists and still reads as *someone's* marker
 * (`describeResidency`). It only means the record is not machine-usable.
 *
 * @param {unknown} data
 * @param {{entityId?: string}} [opts]
 */
export function normalizeResidency(data, { entityId = '' } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, why: 'residency data must be an object {instance, system, mind, agents?, …}' };
  }
  const d = /** @type {Record<string, any>} */ (data);
  const instance = text(d.instance, LIMITS.instance);
  if (!instance) return { ok: false, why: 'residency needs an `instance` — the name the hosting system calls itself (never a hostname or an address)' };
  const mindName = text(d.mind?.name, LIMITS.name);
  if (!mindName) return { ok: false, why: 'residency needs `mind.name` — the mind that runs the instance; a system with nobody home is not a residency' };

  const notes = [];
  const seen = new Set();
  const agents = [];
  for (const raw of Array.isArray(d.agents) ? d.agents : []) {
    if (agents.length >= RESIDENCY_MAX_AGENTS) {
      notes.push(`roster truncated to ${RESIDENCY_MAX_AGENTS} — a marker names an instance's standing agents, not every worker it ever spawns`);
      break;
    }
    const id = text(typeof raw === 'string' ? raw : raw?.id, LIMITS.id);
    if (!id) { notes.push('an agent entry with no id was dropped'); continue; }
    const wears = text(raw?.as, LIMITS.id).toLowerCase() || text(raw?.wears, LIMITS.id).toLowerCase() || wornName(id);
    if (seen.has(wears)) { notes.push(`two agents wear "${wears}" here — the later one was dropped`); continue; }
    seen.add(wears);
    const role = noteRole(text(raw?.role, 32), id, notes);
    agents.push({ id, wears, ...some('role', role), ...some('about', text(raw?.about, LIMITS.about)) });
  }

  const mindRole = noteRole(text(d.mind?.role, 32), mindName, notes);
  // the protocol names a model's path `model` everywhere (the one vocabulary); a descriptor written for the old protocol says
  // `lib`, which is noted, never read: the marker then wears the fallback until the descriptor is updated
  const model = markerModel(d.marker?.model);
  if (d.marker?.model != null && !model) {
    notes.push(`marker.model ${JSON.stringify(d.marker.model)} is not a library path (.glb/.vrm, no ascent) — using ${RESIDENCY_MARKER_FALLBACK}`);
  }
  if (d.marker && typeof d.marker === 'object' && 'lib' in d.marker && d.marker.model == null) {
    notes.push(`the marker names its model as "lib", the old protocol's word: write marker.model — using ${RESIDENCY_MARKER_FALLBACK}`);
  }
  const scale = Number(d.marker?.scale);
  const yaw = Number(d.marker?.yaw);

  const mindId = text(d.mind?.id, LIMITS.id);
  const residency = {
    instance,
    ...some('system', text(d.system, LIMITS.system)),
    mind: {
      name: mindName,
      ...some('role', mindRole),
      ...some('about', text(d.mind?.about, LIMITS.about)),
      wears: text(d.mind?.as, LIMITS.id).toLowerCase() || text(d.mind?.wears, LIMITS.id).toLowerCase() || wornName(mindId || mindName),
      ...some('id', mindId),
    },
    agents,
    ...some('lore', text(d.lore, LIMITS.lore)),
    marker: {
      model: model ?? RESIDENCY_MARKER_FALLBACK,
      ...(Number.isFinite(scale) && scale > 0 ? { scale: Math.min(8, scale) } : {}),
      ...(Number.isFinite(yaw) ? { yaw } : {}),
    },
  };
  const since = sinceMs(d.since, notes);
  if (since != null) residency.since = since;
  // A durable id for the record itself, so two markers planted by the same
  // instance in two worlds are recognizably the same residency.
  residency.key = `${instance}:${residency.mind.wears}`;
  if (entityId) residency.entity = entityId;
  return { ok: true, residency, notes };
}

// ---- perception ------------------------------------------------------------

/**
 * How a residency reads in prose, from the RAW component bag.
 *
 * Deliberately tolerant where `normalizeResidency` is strict: a record this
 * world cannot fully parse still says whose marker it is, for the same reason
 * an unknown particle preset still reads as an emitter. Names the semantic
 * thing on the entity that owns it — never a bare `components: residency`.
 */
export function describeResidency(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'a residency marker (malformed record)';
  const d = /** @type {Record<string, any>} */ (data);
  const mind = text(d.mind?.name, LIMITS.name);
  const instance = text(d.instance, LIMITS.instance) || 'an unnamed system';
  const system = text(d.system, LIMITS.system);
  const who = mind ? `${mind} (${roleReads(d.mind?.role)})` : 'nobody named';
  const roster = (Array.isArray(d.agents) ? d.agents : [])
    .map((a) => text(typeof a === 'string' ? a : a?.id, LIMITS.id))
    .filter(Boolean);
  const bits = [`instance ${instance}${system ? ` (${system})` : ''}`, `mind ${who}`];
  bits.push(roster.length
    ? `${roster.length} agent${roster.length === 1 ? '' : 's'}: ${roster.map(wornName).join(', ')}`
    : 'no agents declared');
  const since = sinceMs(d.since, []);
  // The DATE, never "N days ago": this module is not allowed to know what
  // time it is, and a perception line that silently ages is not replayable.
  if (since != null) bits.push(`resident since ${new Date(since).toISOString().slice(0, 10)}`);
  const lore = text(d.lore, LIMITS.lore);
  // The claim is deliberately thin. A residency record asserts that a system
  // says it lives here — not that anything of it is RUNNING here, not that
  // its agents are present, and not that any of them ever acted. The log
  // answers all three (traceResidents), and a resident who reads "5 agents"
  // as "5 agents are here" would act on it.
  return `residency: ${bits.join('; ')} — a declaration, not a presence${lore ? ` · “${lore.length > 120 ? `${lore.slice(0, 119)}…` : lore}”` : ''}`;
}

/** begin / change / end, from the two component states around a live `comp`.
 *  `null` on either side means there was no record. Returns null when nothing
 *  perceptible happened (an identical re-author). Mirrors particles.js
 *  exactly — one shape for every "a component changed near you" narration. */
export function residencyTransition(prev, next) {
  const p = prev && typeof prev === 'object' ? prev : null;
  const n = next && typeof next === 'object' ? next : null;
  if (!p && !n) return null;
  const nameOf = (x) => text(x?.mind?.name, LIMITS.name) || text(x?.instance, LIMITS.instance) || 'a system';
  if (!p) return { kind: 'begin', who: nameOf(n) };
  if (!n) return { kind: 'end', who: nameOf(p) };
  if (JSON.stringify(p) === JSON.stringify(n)) return null;
  return { kind: 'change', who: nameOf(n), from: nameOf(p) };
}

/** The one ambient line a live attach/replace/remove produces. `who` is the
 *  line's subject; the caller supplies the tags and the radius gate. */
export function residencyLine(actor, entityId, transition) {
  if (!transition) return null;
  if (transition.kind === 'begin') return `${actor} records ${transition.who}'s residency on [${entityId}] (residency)`;
  if (transition.kind === 'end') return `${actor} withdraws ${transition.who}'s residency from [${entityId}] (residency)`;
  return transition.from && transition.from !== transition.who
    ? `${actor} rededicates [${entityId}]: ${transition.from} → ${transition.who} (residency)`
    : `${actor} revises ${transition.who}'s residency record on [${entityId}] (residency)`;
}

// ---- traces ----------------------------------------------------------------

/**
 * What the LOG says about the roster: per member, what they actually did here.
 *
 * This is the evidence half of the model and it is kept scrupulously apart
 * from the claim half. Anyone with builder rights can write a residency
 * record naming anyone; nobody can write someone else's acts into the log,
 * because the sequencer stamps `actor` from the connection. So the record
 * says who an instance CLAIMS to field and this says who was here — and a
 * member with `acts: 0` is reported as declared-but-unseen rather than
 * quietly dropped, which is the only way the difference stays visible.
 *
 * Pure over the entries handed in: the caller decides how much history to
 * read (a page, a window, the whole file), and the result says so.
 *
 * @param {{actor?: string, verb?: string, ts?: number, seq?: number}[]} entries
 * @param {unknown} data raw residency bag
 * @returns {{id: string, wears: string, role?: string, mind: boolean,
 *            acts: number, verbs: Record<string, number>, first: number|null,
 *            last: number|null, lastSeq: number|null}[]}
 */
export function traceResidents(entries, data) {
  const r = normalizeResidency(data);
  if (!r.ok) return [];
  const roster = [
    { id: r.residency.mind.id ?? r.residency.mind.name, wears: r.residency.mind.wears,
      role: r.residency.mind.role, mind: true },
    ...r.residency.agents.map((a) => ({ id: a.id, wears: a.wears, role: a.role, mind: false })),
  ];
  const byWorn = new Map();
  const traces = roster.map((m) => {
    const t = { ...m, acts: 0, verbs: /** @type {Record<string, number>} */ ({}), first: null, last: null, lastSeq: null };
    if (m.role == null) delete t.role;
    // Two rosters wearing one name is already a normalization note; here the
    // first claimant simply keeps the acts rather than both counting them.
    if (!byWorn.has(m.wears)) byWorn.set(m.wears, t);
    return t;
  });
  for (const e of Array.isArray(entries) ? entries : []) {
    const actor = String(e?.actor ?? '').toLowerCase();
    if (!actor) continue;
    const t = byWorn.get(actor);
    if (!t) continue;
    const verb = String(e?.verb ?? 'unknown');
    t.acts++;
    t.verbs[verb] = (t.verbs[verb] ?? 0) + 1;
    const ts = typeof e?.ts === 'number' && Number.isFinite(e.ts) && Math.abs(e.ts) <= 8.64e15 ? e.ts : null;
    if (ts != null) {
      if (t.first == null || ts < t.first) t.first = ts;
      if (t.last == null || ts > t.last) t.last = ts;
    }
    if (typeof e?.seq === 'number' && (t.lastSeq == null || e.seq > t.lastSeq)) t.lastSeq = e.seq;
  }
  return traces;
}

/** The traces, in prose — one line per member, busiest first, the mind always
 *  leading. Relative ages need a clock, so the caller passes `now`; without
 *  one the lines carry dates, which is what a replay wants anyway. */
export function describeTraces(traces, { now = null } = {}) {
  const ago = (ts) => {
    if (ts == null || !Number.isFinite(ts) || Math.abs(ts) > 8.64e15) return '';
    if (now == null) return ` (last ${new Date(ts).toISOString().replace('T', ' ').slice(0, 16)}Z)`;
    const s = Math.max(0, Math.round((now - ts) / 1000));
    const rel = s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
    return ` (last acted ${rel} ago)`;
  };
  return [...(traces ?? [])]
    .sort((a, b) => (b.mind ? 1 : 0) - (a.mind ? 1 : 0) || b.acts - a.acts || a.wears.localeCompare(b.wears))
    .map((t) => {
      const head = `${t.wears}${t.role ? ` — ${roleReads(t.role)}` : ''}${t.mind ? ' (the mind)' : ''}`;
      if (!t.acts) return `${head}: declared, but has done nothing in the history read`;
      const verbs = Object.entries(t.verbs).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([v, n]) => `${v} ×${n}`).join(', ');
      return `${head}: ${t.acts} act${t.acts === 1 ? '' : 's'} — ${verbs}${ago(t.last)}`;
    });
}

// ---- projection ------------------------------------------------------------

/** [x, y, z, w] for a turn about +Y (the transform's `q`), from radians. */
const qYaw = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

/**
 * The marker a world already holds for this descriptor's residency, by its
 * record key (`instance:mind`), or null. Ids are minted by the authority in
 * this protocol, so "re-plant the same marker" is found, not derived.
 *
 * @param {Record<string, any>} entities view-form entities (flat components)
 * @param {unknown} descriptor
 */
export function findResidencyMarker(entities, descriptor) {
  const want = normalizeResidency(descriptor);
  if (!want.ok) return null;
  for (const [id, e] of Object.entries(entities ?? {})) {
    const have = e?.[RESIDENCY_COMPONENT];
    if (have == null) continue;
    const r = normalizeResidency(have);
    if (r.ok && r.residency.key === want.residency.key) return id;
  }
  return null;
}

/**
 * The ONE authority request that plants a residency: descriptor in, an
 * ordinary request out.
 *
 * One projection, so the planting tool, a script, and whatever an instance
 * writes for itself all put the SAME marker in the world: the declared model,
 * the record on it, a label, and (by default) a `lock`, because a marker that
 * can be punted across the map is a marker that stops meaning where a system
 * lives. Sending it is the caller's job; deciding what it is is this module's.
 *
 * A new marker is one `create` (the authority mints its id: the reply's
 * `ids["$residency"]`). A marker that already stands (`id`, from
 * findResidencyMarker) is re-authored in place: a `batch` of `set`s sent
 * `throughLock`, since this protocol's lock binds every component write on a locked
 * thing (its locker's included), and a planter is a builder, who may act
 * through a lock a builder set.
 *
 * @param {unknown} descriptor
 * @param {{id?: string|null, pos?: number[], yaw?: number|null, lock?: boolean}} [opts]
 * @returns {{ok: true, id: string|null, request: {verb: string, args: Record<string, unknown>}, record: Record<string, unknown>, notes: string[]}
 *          | {ok: false, why: string}}
 */
export function residencyRequest(descriptor, { id = null, pos = [0, 0, 0], yaw = null, lock = true } = {}) {
  const r = normalizeResidency(descriptor);
  if (!r.ok) return r;
  const { entity: _e, marker, ...record } = r.residency;
  if (id) {
    // throughLock rides the batch (its requests take only their own verb's arguments)
    const set = (component, value) => ({ verb: 'set', args: { id, component, value } });
    return { ok: true, id, record, notes: r.notes,
      request: { verb: 'batch', args: { requests: [set(RESIDENCY_COMPONENT, record), ...(lock ? [set('lock', true)] : [])], throughLock: true } } };
  }
  const s = marker.scale;
  const components = {
    transform: { pos, q: qYaw(yaw ?? marker.yaw ?? 0), ...(s != null ? { scale: [s, s, s] } : {}) },
    label: `${record.mind.name} (${record.instance})`.slice(0, 80),
    [RESIDENCY_COMPONENT]: record,
    ...(lock ? { lock: true } : {}),
  };
  return { ok: true, id: null, record, notes: r.notes,
    request: { verb: 'create', args: { id: '$residency', model: marker.model, components } } };
}

// ---- the world's account ---------------------------------------------------

/** One log entry as an act a trace counts: an accepted request (its verb)
 *  or a say, under its actor's display name. A change entry (what a request
 *  caused), a refused attempt and anything else are not acts: null. */
function actOf(e, seq, nameOf) {
  if (!e || typeof e !== 'object' || typeof e.actor !== 'string') return null;
  let verb;
  if (e.kind === 'say') verb = 'say';
  else if (e.kind === 'request' && !e.body?.refused && typeof e.verb === 'string') verb = e.verb;
  else return null;
  return { seq, ts: e.ts, actor: nameOf(e.actor) ?? e.actor, verb };
}

/**
 * GET /residency's body, as a pure function of a world: every residency in its
 * view, each with the log's evidence beside the claim, never merged into it.
 * `entries` is the world's log (the request/change/say entries the authority
 * appends); `nameOf` turns an actor (an opaque identity in this protocol) into the name
 * its body wears, which is what a roster's `wears` is matched against.
 *
 * @param {{entities: Record<string, any>, entries: any[], nameOf?: (actor: string) => string|null|undefined,
 *          world?: string, limit?: number}} w
 */
export function projectResidencies({ entities, entries, nameOf = (a) => a, world = '', limit = 2000 }) {
  const all = Array.isArray(entries) ? entries : [];
  const from = Math.max(0, all.length - Math.max(1, limit));
  const acts = [];
  for (let i = from; i < all.length; i++) { const a = actOf(all[i], i, nameOf); if (a) acts.push(a); }
  const residencies = [];
  for (const [eid, e] of Object.entries(entities ?? {})) {
    const data = e?.[RESIDENCY_COMPONENT];
    if (data == null) continue;
    const r = normalizeResidency(data, { entityId: eid });
    residencies.push({
      entity: eid, label: typeof e.label === 'string' ? e.label : null, pos: e.pos ?? null, born: e.born ?? null,
      ...(r.ok
        ? { record: r.residency, notes: r.notes, traces: traceResidents(acts, data) }
        : { record: null, why: r.why, raw: data }),
    });
  }
  return {
    world, residencies,
    history: { entries: all.length - from, acts: acts.length, fromSeq: from, hasMore: from > 0 },
    note: `a record is what a system CLAIMS about itself; traces count matching actor names over the ${acts.length} acts in the last ${all.length - from} log entries read, not verified affiliation. Rosters cap at ${RESIDENCY_MAX_AGENTS}.`,
  };
}
