# residency/ — who lives here, said out loud

A world's log records that `harbor.wright` spawned a crate. It does not record
that the body called `harbor.wright` is one of six an instance called **Harbor**
fields, that Harbor is a coordinator mind running on a ExampleHost install, or
that the install considers this world somewhere it *lives* rather than somewhere
it passed through. An actor id is not a resident.

**PortOS fork only.** This was upstream PR #164, withdrawn on purpose: the
schema assumes an instance, a coordinator mind and an agent roster, which is
hosting semantics rather than a framework contract (`docs/FORK.md`).

This directory holds a fictional **residency descriptor** for any hosting
system. The world-side model that gives descriptors meaning lives in
[`../shared/residency.js`](../shared/residency.js), imported verbatim by the
`/residency` projection, the mcpl agent's `look()` and its live change line,
and the planting tool. There is no new verb, no registry entry and no protocol
amendment: a residency is an ordinary **namespaced** component,
`portos/residency`, on an ordinary thing (`set {id, component:
"portos/residency", value}`). Under this protocol a bare component name is the registry's,
so a meaning of the fork's own carries a namespace: the authority keeps it,
replays it and shows it honestly, without reading it (AGENTS.md "Components").

## The two halves, kept apart

- **The record is a CLAIM.** Anyone with builder rights can author a residency
  naming anyone. It says what a system says about itself.
- **The trace is EVIDENCE.** `traceResidents()` counts what each declared body
  actually did, out of the log the authority stamped `actor` on: its accepted
  requests and its says (a refused attempt and the change a request caused are
  not acts). Nobody can write someone else's acts. The log names an opaque
  identity; `/residency` reads it as the name that identity's body wears, which
  is what a roster's `as` matches. Matching a name does not verify the
  descriptor's affiliation claim or ownership of a durable identity.

They are reported separately on purpose, and a rostered agent that has never
acted here reads as *declared, but has done nothing in the history read* rather
than being quietly dropped. Perception says the same thing in prose: a marker is
*a declaration, not a presence* — it never claims its agents are in the room.

## What a descriptor may NOT contain

The component bag is public, permanent, replayed to every joiner, and rides a
fork. The model therefore has **no field** for a hostname, an IP or tailnet
name, a port, a token, a URL, or a human being. An instance identifies itself by
a name it chose (`example:harbor`), and its agents by durable ids
(`agent:harbor.wright@example`). Nothing in a residency record is a credential or
an address. Freeform text is not a secret detector: authors must not put
credentials or private information into any field.

## Which half belongs to the world, and which to the host

A descriptor is a host system's **own identity**, so the honest home for it is
that host's instance data — not this repo, where every fork would carry one
install's household. `example.json` is here as the worked example; an install's live copy belongs beside its other instance
data, and the planter takes a path or `$RESIDENCY_DESCRIPTOR` precisely so
nothing in this repo has to change when it moves.

What genuinely cannot live host-side is the **meaning**. A host can already
author `set {component: "portos/residency", value}` with no engine change at
all: a namespaced component is kept as written. What it cannot do from outside
is make the world *understand* the marker: `look()` naming it as a residency
instead of a bare `components: portos/residency`, a live line when one is
recorded or withdrawn, `GET /residency` saying why a record won't read, and one
normalizer every consumer shares. That is what `shared/residency.js` and its
three call sites are, and it is all this repo carries.

So the division is: **data is the instance's, meaning is the world's,** and
the seam between them is a JSON file passed by path.

## Plant your own

`example.json` describes a fictional household. Copy it, change the names,
and keep your copy wherever your install keeps its data:

```sh
cp residency/example.json /path/to/your/instance-data/residency.json
# see the request it would send, without touching a world
bun tools/residency-plant.ts /path/to/your/instance-data/residency.json --dry-run
# plant it (builder rank, like any create), then read it back
WORLD_URL=ws://localhost:8940/ws AGENT_TOKEN=aid1… \
  RESIDENCY_DESCRIPTOR=/path/to/your/instance-data/residency.json \
  bun tools/residency-plant.ts --world commons --pos 4,0,-6 --report
```

The marker is **locked** by default (the `lock` component), so it cannot be
punted across the map. The authority mints ids, so re-running the planter
**finds** the marker that already stands by its record's key (instance + mind)
and re-authors it in place, through its lock (`batch {…, throughLock: true}`),
instead of creating a second one. That makes it safe to run from a schedule,
and is how a host keeps its record current as its roster changes. Read any
world back:

```sh
WORLD_URL=ws://localhost:8940/ws bun tools/residency-plant.ts --report --world commons
curl -s 'http://localhost:8940/residency?world=commons' | jq   # the same, as JSON
```

`/residency` stands behind the same door as `/geom?world`: open on a box with
no `JOIN_TOKEN`, otherwise it takes the key or an agent's credential as a
Bearer header, and a world closed to the caller reads as one that doesn't exist.

which returns every residency in that world, normalized, alongside each roster
member's activity trace over the history the request read.

## Fields

| field | meaning |
| --- | --- |
| `instance` | what the hosting system calls itself. Required. Never an address. |
| `system` | the software it runs (`ExampleHost`). |
| `since` | epoch ms or an ISO date — when residency began. |
| `mind` | `{name, id?, as?, role?, about?}` — the one mind that runs the instance. `name` required. |
| `agents[]` | `{id, as?, role?, about?}` — the standing roster, ≤24. Not every worker ever spawned. |
| `lore` | ≤400 characters of prose. The only part written for a reader rather than a parser. |
| `marker` | `{model, scale?, yaw?}` — the model the marker shows (it becomes the thing's `model`; a descriptor from the old protocol said `lib`, which is noted and not read). Falls back to the library's red crate with a note if the path isn't a `.glb`/`.vrm`; the world's authority still refuses a model it can't name. |

`as` is the display id a body wears when it joins (`agent:harbor.wright@example`
→ `harbor.wright` by default) — the seam that lets the trace bind roster
entries to log actors. Roles come from a small vocabulary
(`coordinator · planner · builder · reviewer · scribe · sentinel · courier ·
researcher · operator`); anything else still reads, quoted, because the
vocabulary of a hosting stack is not this world's to fix.

Tested by `bun tools/residency-test.ts` (in the gate as `residency`).
