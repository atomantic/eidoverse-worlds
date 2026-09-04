# Structural audit: instance identity, agent presence, and the PortOS seam

Status: audit, 2026-09-04. Read-only pass over the whole repo — data models,
asset pipeline, setting/lore surfaces, and the projection layers — asking one
question: **where would a PortOS install and its Chief-of-Staff agents attach
to this world, and what is missing before they can?**

Nothing here is decided. Every recommendation names the seam it lands on and
the file that owns it. Where a recommendation would be a protocol amendment
rather than an extension, it says so — `spec/PROTOCOL.md` §10 keeps the verb
set closed on purpose, and most of what follows fits the three open lanes
without touching it.

Notation: `file:line` refs are to the tree at the time of writing.

---

## 0. The one-paragraph finding

The world model is in excellent shape and needs almost nothing: the fold is
pure, the component bag is genuinely open, and the presence plane already
carries everything an embodied agent needs. What is missing is one layer
*above* the world — **the host has no identity, and an agent's origin has no
representation**. `agent: true` is a self-declared boolean with no provenance
(`server/server.ts:510`); the MCPL door names itself with a hardcoded literal
(`mcpl/net-server.ts:1171`); the only per-instance value in the whole tree is
a test nonce (`server/routes.ts:459`). A world therefore cannot say who hosts
it, an avatar cannot say what stack it runs on, and two sequencers both
serving `commons` are indistinguishable from outside. Everything a PortOS
integration wants — "this world is hosted by that install", "this body is a
CoS agent working on a task" — is blocked on those two absences, and both are
fixable inside the existing extension lanes.

---

## 1. Core data models

### 1.1 The two planes

The whole architecture is `spec/PROTOCOL.md` §5, honoured everywhere:

| plane | carrier | persisted | rate | owner |
|---|---|---|---|---|
| **authored** | append-only JSONL log of intent verbs | forever | low | sequencer orders it |
| **presence** | avatar pose, gaze, emotes, reach relations | never | ~15Hz | each client owns its own body |

A world *is* its log; there is no scene file. Everything else — snapshots,
scenes, text descriptions — is derived cache.

### 1.2 The log

- Entry: `{seq, ts, actor, verb, args}` — `spec/PROTOCOL.md` §1.
- Storage: `worlds/<name>/log.jsonl` + `snapshot.json` + `poses.json`,
  owned by `WorldLog` (`server/world.ts:75`). Snapshot carries a byte offset
  so boot is proportional to the tail, not to history.
- **The fold is singular**: `shared/fold.js` is consumed verbatim by the
  sequencer, the browser (`client/lib/state.js`), and the MCPL agent.
  Conformance is pinned by `spec/fixtures/*` via `tools/foldfix-test.ts`.
- Folding is *total*: unknown verbs and unknown component types fold to
  nothing and are kept. That is the entire forward-compatibility story.

### 1.3 Folded state (`WorldState`, `shared/fold.js:35-101`)

```
entities   id → { pos, yaw, scale?, lib?, kind:"light"?, collide?,
                  comp: { <type>: opaque }, parent: {to,slot,offset,yaw} }
mounts     body-id → { to, slot?, offset?, yaw? }
terrain | grass | sky        world-scope singletons (sky carries the clock +
                             forecast policy, normalized by shared/forecast.js)
assets     [{name, path}]    the world's asset palette
roles      id → { role, gen?, sub? }        event-sourced permissions
bans       id → { by, ts, reason?, sub? }
behaviors  id → { src, attach?, caps?, knobs?, author, ts, state? }
recentChat / chatTotal       an arrival's conversational window
```

Two structural notes that matter downstream:

- **The id namespace is flat and world-scope state is a fixed set of keys.**
  There is no `meta` slot, and no way to hang world-scope data off anything
  but the three singletons above (`terrain`, `grass`, `sky`). §4.5 returns to
  this.
- **`comp` requires an existing entity.** `shared/fold.js` returns early when
  `st.entities[a.id]` is absent — so "a component on the world itself" is not
  expressible today without spawning a carrier entity first.

### 1.4 Identity, rights, and actors

Three identity mechanisms, layered:

1. **`actor`** — the log's attribution ink (`spec/PROTOCOL.md` §6). A string,
   ≤64 chars. `world`, `bhv:*` and `*` are reserved and refused at the door
   (`server/server.ts:477-481`).
2. **`sub`** — the durable principal, from a verified `aid1` token
   (`server/aid1.ts`). Shape: `human:discord:<id>` / `agent:<name>@<domain>`.
   Grants may bind to it (`roles[id].sub`), so a display name is a nameplate
   and the `sub` is the deed (`server/rights.ts:34-51`).
3. **bearer tokens** — `mcpl/tokens.json`, read fail-closed by
   `mcpl/token-registry.ts`, mirrored into the sequencer by
   `server/auth.ts` `agentTokens()` so an agent's name is *reserved*.

Rights ladder: `visitor < builder < owner`, plus the orthogonal `gen` spend
capability. Per-verb requirements: `server/rights.ts` `VERB_NEEDS`.

**The gap is visible here already.** `aid1` payloads carry
`kind: "human" | "agent" | "service"` (`server/aid1.ts` `PrincipalKind`), and
the login path drops it on the floor: `server/routes.ts:331` builds the
session as `{sub, name, scopes, claims, exp}` — every field of the verified
payload except `kind`. The *verified* answer to "is this an agent" exists in
the credential and is discarded one line before it would have been stored;
the *unverified* answer (`msg.agent`) is what reaches the roster.

### 1.5 The extension lanes

`spec/PROTOCOL.md` §10 — three lanes are always open, and a new verb is an
amendment:

- **state-shaped** → `comp {id, type, data}`, ≤8KB, folded blindly;
- **event-shaped** → `use {id, action}`, action strings freeform;
- **semantic** → uploaded behavior scripts (QuickJS, server-side).

**Behavior scripts cannot be the PortOS bridge.** The sandbox surface
(`sdk/behavior.d.ts`) is `on` / `every` / `emit` / `entity` / `entities` /
`people` / `kv` / `log` — there is no network primitive, by design. Anything
that needs to read PortOS state must be an *outside connector holding a
world connection*, not a script inside the world.

---

## 2. Assets and the store

| layer | where | notes |
|---|---|---|
| upstream library | `EIDOVERSE_DIR` (eidoverse-video checkout) | not vendored; `.gitignore` excludes `assets/`, `*.glb`, `*.vrm` |
| deliberate forks | `upstream-patched/` | served with **top** precedence by `/library`; the one asset path that travels with the repo |
| uploads | `store/<sha256-16>.<ext>` | content-addressed; `POST /upload` (`server/upload.ts`) |
| optimized shadows | `assets/opt/store-min/` | draco+webp@1024, served preferentially at the same path |
| KTX2 shadows | `store/<hash>.glb.ktx2.glb` | `server/store-variants.ts`, keyed by `?ktx2=<key>` |
| seat profiles | `assets/opt/seats/profiles.json` + provenance log | `server/seats.ts` |

Read surfaces for agents: `GET /geom` (bbox, flat zones, named parts — three
tiers, `server/geometry.ts`), `GET /library/<lib>` (raw bytes),
`GET /library-list` / `/library-models` / `/avatars` / `/animations`.

**`eido:` URIs are specified and unimplemented.** `spec/EIDO-URIS.md` is a
complete v1 draft — content-addressed references that survive leaving the
host, a `/eido/<alg>/<hex>` resolver endpoint, `variant` and `resolvers`
verbs, and a mandatory `media` sibling field. None of it exists in the tree:
there is no `/eido/` route in `server/routes.ts`, and neither verb is in
`VERB_NEEDS` or the fold. §4.6 argues this is the single biggest structural
blocker to a PortOS install participating as a peer rather than as a client.

---

## 3. Lore, setting, and the projection layers

### 3.1 Where the setting actually lives — and doesn't

There is **no setting bible in this repo**, and that is a deliberate
consequence of the architecture rather than an oversight: a world's content
*is* its log, and `worlds/` is gitignored ("runtime world data"). The
narrative surfaces that do exist are:

- `AGENTS.md` — the in-world manual, also served live at `GET /agents.md`
  (`server/routes.ts:798`). This is the closest thing to a setting document
  an arriving agent reads.
- `DESIGN.md` — philosophy: archipelago-not-grid, real places, travel,
  tiered perception.
- `TEL0S_NOTES.md` — rebuild notes (loading/lighting/perf). Engineering, not
  setting, despite the size.
- `notes/`, `docs/` — SFU spec, leases, incidents, awareness roadmap, the
  local-chat-spaces design.

**Consequence for the audit:** a world's lore is unversioned, unreviewable,
and cannot be seeded on a fresh install. There is no `worlds.reference/`, no
export format, and no `/worlds` listing route — the archipelago is
undiscoverable from outside a running sequencer.

### 3.2 The projection layers

One state, four opinions of it:

1. **Browser (three.js / WebGPU)** — `fold → state → realize`.
   `client/lib/state.js` holds the folded state and nothing else (no THREE, no
   DOM); the realizers project it: `realize/models.js` (+ its pure half
   `models_field.js`), `environment.js` (terrain/grass/sky), `structure.js`
   (griddled buildings, thinking half in `shared/structure.js`), `social.js`
   (roles/behaviors/chat window), `causes.js` (verbs that fold to *nothing* —
   `use`, `force`, `punt`, moderation, live `say`).
2. **Text tier (MCPL)** — `mcpl/agent.ts` `look()` at :2200. Header, structural
   "where you are" from the `structure` comp, `World:` bag (sky + effective
   clock + description), `People (n)`, `Things (n)` with affordances read
   aloud from six component types (§4.3). Plus `measure`, `snapshot`,
   `world_history`, `world_debug`, `catch_up`, `activity`.
3. **Geometry tier** — `server/geometry.ts`, offline GLB parsing, cached.
4. **Headless / film crew** — `deploy/run-mac-renderer.sh`,
   `deploy/render-watchdog.ts`, the `snap` route, `RECORD_FRAMES=1` frame
   capture (`server/config.ts`).

Voice/media is a fifth, orthogonal plane: `server/sfu*.ts`, aux "surfaces"
per identity (`server/world.ts` `Client.surface`).

**Finding:** the text tier is where an agent-ecosystem marker would be *read*,
and it is currently silent about agents. `look()`'s People lines print
distance, bearing, position, activity, pose and ride — never whether the
person is an agent, while the Things lines beside them narrate six component
types in detail — even though `isAgent()` exists three hundred lines above
(`mcpl/agent.ts:777`) and is used only for chat tagging and ping delivery
(`mcpl/net-server.ts:769,836`).

---

## 4. The gaps

Ordered by how much else depends on them.

### 4.1 Gap A — the host has no identity

**What exists.** `GET /version` returns the build stamp plus, optionally,
`instance: WORLD_INSTANCE_NONCE` — and that is explicitly *"an opt-in TEST
affordance"* (`server/routes.ts:441`), a per-process nonce whose only
consumers are test harnesses (`tools/object-lod-test.ts`,
`tools/join-rfc005.test.ts`, `tools/door-cap-gate-live-test.mjs`). MCPL's
`serverInfo` is the hardcoded literal `{name: "eidoverse-worlds", version:
"0.1.0"}` (`mcpl/net-server.ts:1171`). The join snapshot
(`server/server.ts:695`) names the world and the joiner and says nothing
about the host.

**Why it blocks everything.** `spec/EIDO-URIS.md` §4 already requires it —
*"Hosts implementing this spec MUST advertise an `eido` capability in their
hello/info payload so clients can feature-detect instead of authoring
blind"* — and there is no payload to advertise it in. Federation, resolver
lists, cross-host provenance, and "which install am I talking to" all need
one durable answer.

**Recommendation.** A host descriptor, computed once at boot in
`server/config.ts`, served at a new `GET /host` (and mirrored into
`/version`, MCPL `serverInfo`, and the join snapshot):

```jsonc
{
  "id":    "hst_<opaque>",        // durable, survives restarts, NOT derived from hostname
  "kind":  "standalone" | "portos",
  "label": "Example Commons",     // human-facing, operator-chosen
  "version": "<build sha>",
  "caps":  { "eido": false, "leases": true, "behaviors": true },
  "resolvers": ["https://example.invalid"]
}
```

Privacy constraint, non-negotiable for a PortOS install: **the descriptor is
an opaque id plus an operator-chosen label.** No hostname, no tailnet name,
no LAN address, no OS username — those are the operator's private data, and
this payload is world-readable by anyone who can reach the door.

For PortOS specifically, `kind: "portos"` plus the install's own id is what
lets a world say "this place is hosted by that install" without the install
leaking where it runs.

### 4.2 Gap B — `agent: true` is unverified and says nothing

**What exists.** `c.agent = Boolean(msg.agent)` (`server/server.ts:510`) —
self-declared at join, propagated into the roster (`:723`) and the `arrive`
broadcast (`:732`), read by the browser (`client/lib/remotes.js:42,69,95`)
and by `mcpl/agent.ts:777`. The comment at `mcpl/agent.ts:489` is candid
about its scope: *"`agent: true` is not a capability — it changes nothing
about what this body may do. It exists so the world can SAY who it is talking
to."*

Three problems, in increasing order of importance:

1. **Unverified.** Anyone can claim it, or decline it. Meanwhile the two
   verified channels — the aid1 `kind` and the `tokens.json` bearer that
   already resolved to a named agent — both know the truth and are ignored
   at this line.
2. **One bit.** "Not a person at a keyboard" is the whole vocabulary. There
   is no room for *which* stack, *whose* install, or *what kind* of agent.
3. **Never perceived.** The text tier does not surface it at all (§3.2).

**Recommendation.** Replace the boolean at the join seam with a server-derived
`embodiment` descriptor, and keep the boolean as a derived field so nothing
downstream breaks:

```jsonc
"embodiment": {
  "kind":     "human" | "agent" | "service",  // from the aid1 payload when verified,
                                              // else the self-declared claim
  "verified": true,                           // did a credential say so?
  "origin":   "portos" | "connectome" | "claude-code" | null,   // the agent's home stack
  "instance": "hst_<opaque>" | null           // §4.1's id, when the origin is a host
}
```

Three concrete edits, none of which touch the protocol:

- `server/auth.ts` + `server/routes.ts:331` — add `kind` to `HnSession` and
  store it (and any `claims.origin`) instead of dropping it. One field, and
  restored sessions from before the change simply read `undefined`.
- `server/server.ts:510` — derive from the credential; fall back to
  `msg.agent` only when nothing verified is present, and mark it
  `verified: false`.
- `mcpl/agent.ts:2264` — say it in `look()`. One suffix on the People line
  (`— agent`, `— agent (portos)`) closes the perception gap that
  `isAgent()` has been able to answer all along.

### 4.3 Gap C — there is no vocabulary for a *working* agent

Nothing in the world can represent a task in flight, a schedule, or an
instance's state. This is the CoS-presence gap proper, and it needs **no
protocol change** — it is squarely in the state-shaped lane.

**Recommendation.** A component type, carried by an ordinary entity (a desk,
a terminal prop, a standing stone — whatever the agent's body stands beside):

```jsonc
comp {id: "cos-desk", type: "cos:presence", data: {
  instance: "hst_<opaque>",
  agent:    "<agent display id>",
  status:   "idle" | "working" | "blocked" | "done",
  task:     "short human-readable line",
  since:    1234567890000
}}
```

Folded blindly, ≤8KB, persists, replays, forks. Paired with the event lane
for interaction — `use {id, action: "cos:status"}` — and a `reactions`
component if the answer should be an in-world effect rather than a reply.

Two things this needs to be more than inert data:

- **A perception evaluator.** `look()`'s Things loop narrates six component
  types by name — `sockets`, `reactions`, `motion`, `particles`, `lock`,
  `structure` — and sweeps everything else into a bare
  `components: <names>` list. So a `cos:presence` comp would be *visible*
  (`components: cos:presence`) and *meaningless*: an agent reading the world
  would learn that a component exists and nothing about the work it
  describes. The doctrine is stated in the loop's own comment about
  `structure`: *"`components: structure` would be true and useless, where 'a
  building: 2 rooms, 14 walls, 1 door' is actionable."* A one-line
  `describeCosPresence()` beside `describeParticles()` is what makes the
  component mean something to a reading being. (`particles` is the worked
  precedent end to end — see `AGENTS.md`, "Things can EMIT".)
- **A writer that is not a behavior script.** §1.5: the sandbox has no
  network. See §4.4.

Deliberate non-recommendation: do **not** add a `cos` verb. The component
lane costs nothing, replays correctly, and survives a host that has never
heard of PortOS — a new verb would be refused at every other door in the
archipelago.

### 4.4 Gap D — the bridge shape is unbuilt, but the pattern exists

A PortOS install cannot push its state into a world from inside the world.
It needs an outside connector holding an embodied world connection.

**The prior art is exact.** `tools/chatbridge/index.ts` +
`deploy/eido-chatbridge.service`: an embodied (not spectator) client with its
own in-world identity, provenance carried inside the relayed text, and loop
safety enforced by identity in both directions. Its header comment is the
design doc for any second bridge.

**Recommendation.** A `tools/portosbridge/` built on the same shape:

- joins embodied under a reserved id so the presence is honest and visible;
- writes `cos:presence` comps (§4.3) rather than chat spam;
- one-directional by default (world ← PortOS). Reading *out* of the world
  into PortOS is a second, separately-reviewed decision, and it is the
  direction that carries privacy risk.
- credentials by env, never in the repo — `mcpl/tokens.json` and
  `.sessions.json` are already gitignored and the service file already
  models `FILL_ME` placeholders.

Rate discipline: `VERB_RATE` defaults to 12 authored verbs per client per 4s
(`server/config.ts`). A status heartbeat must be event-driven or slow; a
per-tick `comp` write would be rate-limited into silence and would bloat the
log, which is permanent.

### 4.5 Gap E — worlds carry no metadata about themselves

`WorldState` has no `meta` slot (§1.3), `genesis` carries only `{v, dialect}`,
and `comp` cannot address a world (the fold requires an existing entity).
So a world cannot record its own title, description, house rules, or which
host founded it — and a fork carries none of that either.

Three options, cheapest first:

1. **A convention entity.** Spawn a well-known id (`__world`) and hang
   `comp {type: "meta"}` on it. Zero protocol change, works today, but it is
   a real entity in the flat namespace and something will eventually
   `remove` it.
2. **Extend `genesis` args.** The fold ignores unknown args, so
   `genesis {v, dialect, meta: {...}}` is backward-compatible on the wire —
   but genesis is written once at creation and cannot be amended, so this
   only works for immutable facts (founding host, creation time).
3. **A world-scope singleton**, alongside `terrain`/`grass`/`sky`. This is a
   protocol amendment (§10) and should be argued upstream on its own merits,
   not smuggled in for this integration.

Recommend (1) for now, (3) as the thing to propose if it proves load-bearing.

### 4.6 Gap F — nothing can leave the host

`forkWorld` (`server/world.ts:478`) is a byte copy *within one sequencer*.
There is no export route, no import route, and no `/worlds` listing anywhere
in `server/routes.ts`. `spec/EIDO-URIS.md` exists precisely to fix this and is
entirely unimplemented (§2).

This is the structural blocker to "a PortOS install as a peer in the
archipelago" rather than "a PortOS install as a client of someone else's
sequencer". Until an `eido:` reference resolves anywhere, a world built on a
private install is stranded there and a world built publicly cannot be
mirrored privately.

**Recommendation.** Implement the draft in the order its own §5 suggests,
which is cheap and non-breaking at every step:

1. `GET /eido/<alg>/<hex>` serving the exact named bytes — the hash is
   already computed at ingestion, so this is a route, not a pipeline.
2. Advertise `caps.eido` in §4.1's host descriptor.
3. `variant` and `resolvers` verbs (a protocol amendment — argue upstream).
4. An exporter emitting log + blob bundle with `eido:` references and the
   `media` sibling.

Steps 1–2 are worth doing regardless of PortOS: they make the host
descriptor useful and cost nothing to anyone who ignores them.

---

## 5. Summary table

| # | Gap | Lands on | Protocol change? | Blocks |
|---|---|---|---|---|
| A | Host has no durable identity | `server/config.ts`, `server/routes.ts`, `mcpl/net-server.ts:1171` | no | everything below |
| B | `agent: true` unverified, one bit, never perceived | `server/auth.ts`, `server/server.ts:510`, `mcpl/agent.ts:2264` | no | agent-ecosystem markers |
| C | No vocabulary for a working agent | new `cos:presence` comp + a `look()` evaluator | no | CoS presence |
| D | No connector shape | new `tools/portosbridge/`, modeled on `tools/chatbridge/` | no | CoS presence |
| E | Worlds carry no self-description | convention entity now; world-scope singleton is an amendment | option-dependent | provenance, forks |
| F | Nothing can leave the host | `spec/EIDO-URIS.md`, unimplemented | steps 3–4 only | peer federation |

**Suggested order.** A → B → C+D together (C is inert without D, D has
nothing to write without C) → E → F. A and B are small, unblock the rest,
and are improvements to this repo on their own terms — neither mentions
PortOS in its implementation.

---

## 6. What this audit deliberately did not do

- **No code changed.** Every recommendation above is a proposal against a
  named seam, not a started implementation.
- **No new verbs proposed** except where §4.5/§4.6 flag them explicitly as
  upstream amendments. §10 of the protocol is right, and the three open
  lanes cover the PortOS integration completely.
- **No private data recorded.** The host descriptor in §4.1 is specified as
  an opaque id plus an operator-chosen label precisely so that adopting it
  cannot leak a machine name, an address, or a home-directory path into a
  world-readable payload or a permanent log.
