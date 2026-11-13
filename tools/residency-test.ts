// The `portos/residency` component's meaning, projection and evidence (PortOS fork only: docs/FORK.md).
//
//   BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun tools/residency-test.ts
//
// Six legs, matching what a residency has to be worth:
//
//   1. DECLARATION — what a record may say, what it may not, and what fails LEGIBLY (an unknown role still reads; a
//      marker path that isn't a library path falls back with a note; a record with nobody home is refused outright).
//   2. PROJECTION  — descriptor → the one request that plants it: a create for a new marker, a batch of sets through
//      its lock for one that stands.
//   3. EVIDENCE    — the claim/trace split: a roster is what a system SAYS, the log is what its bodies DID, and a
//      declared-but-absent agent stays visible as exactly that.
//   4. THE AUTHORITY — the protocol's door itself (shared/protocol/authority.js over server/filehost.ts openWorld): it takes the
//      namespaced record, a re-plant finds and re-authors the one marker through its lock, and the projection reads
//      the real log's acts (refused attempts and caused changes are not acts).
//   5. PERCEPTION — the mcpl agent (tools/agent-scratch.ts agentOnDoor): look() names the residency on its thing, and a
//      live record / revision arrives as one ambient line, never as your own echo.
//   6. THE ROUTE  — a scratch sequencer's GET /residency: the claim, the evidence, an unreadable record, a 404.

import "./protocol/fixture-ids.ts";   // fixtures seed the ids they read (R 10-17)
import { scratch } from "./protocol/common.ts";
import { request } from "../shared/protocol/authority.js";
import { openWorld } from "../server/filehost.ts";
import { viewState } from "../shared/protocol/view.js";
import {
  RESIDENCY_COMPONENT as RC, RESIDENT_ROLES, RESIDENCY_MAX_AGENTS, RESIDENCY_MARKER_FALLBACK,
  normalizeResidency, describeResidency, residencyRequest, findResidencyMarker, projectResidencies, residencyTransition,
  residencyLine, traceResidents, describeTraces, wornName, roleReads,
} from "../shared/residency.js";

let pass = 0, fail = 0;
const check = (name: string, ok: unknown, detail = "") => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
};

const HARBOR = {
  instance: "example:harbor", system: "ExampleHost", since: "2026-09-04",
  mind: { name: "Harbor", id: "agent:harbor@example", role: "coordinator" },
  agents: [
    { id: "agent:harbor.wright@example", role: "builder" },
    { id: "agent:harbor.scribe@example", role: "scribe" },
  ],
  lore: "one instance, one mind, its standing agents — none of them a person",
  marker: { model: "eidoverse/assets/models/crate_large_red.glb" },
};

// ---- 1. declaration --------------------------------------------------------
console.log("\ndeclaration — what a record may say, and what fails legibly\n");
{
  const r = normalizeResidency(HARBOR, { entityId: "marker1" });
  check("a well-formed record normalizes clean", r.ok === true && r.notes.length === 0, r.ok ? "" : r.why);
  const rec = (r as { residency: any }).residency;
  check("the mind's worn name is derived from its durable id", rec.mind.wears === "harbor");
  check("...and so is each agent's", rec.agents[0].wears === "harbor.wright");
  check("an ISO `since` becomes epoch ms", typeof rec.since === "number" && new Date(rec.since).toISOString().startsWith("2026-09-04"));
  check("the record carries a key stable across worlds", rec.key === "example:harbor:harbor");

  check("a record with no instance is refused", normalizeResidency({ mind: { name: "X" } }).ok === false);
  check("a record with nobody home is refused", normalizeResidency({ instance: "example:x" }).ok === false);
  check("a non-object bag fails legibly", normalizeResidency(42).ok === false);

  const odd = normalizeResidency({ ...HARBOR, mind: { name: "Harbor", role: "hierophant" } });
  check("an unknown role is kept, with a note", (odd as any).residency.mind.role === "hierophant"
    && (odd as any).notes.some((n: string) => n.includes("hierophant")));
  check("...and still reads in prose", roleReads("hierophant") === '"hierophant"');
  check("known roles read as phrases", roleReads("coordinator") === RESIDENT_ROLES["coordinator"]);

  const escaped = normalizeResidency({ ...HARBOR, marker: { model: "../../etc/passwd" } });
  check("a marker path that isn't a library path falls back, with a note",
    (escaped as any).residency.marker.model === RESIDENCY_MARKER_FALLBACK
    && (escaped as any).notes.some((n: string) => n.includes("marker.model")));
  // a descriptor written for the old protocol named the model `lib`: this protocol's one vocabulary says `model`
  const old = normalizeResidency({ ...HARBOR, marker: { lib: "eidoverse/assets/models/crate_large_red.glb" } }) as any;
  check("the old `marker.lib` spelling is noted, not read", old.residency.marker.model === RESIDENCY_MARKER_FALLBACK
    && old.notes.some((n: string) => n.includes("marker.model")));

  const dup = normalizeResidency({ ...HARBOR, agents: [{ id: "agent:a@x" }, { id: "agent:a@y" }] });
  check("two agents wearing one name is a note, not two rows",
    (dup as any).residency.agents.length === 1 && (dup as any).notes.some((n: string) => n.includes("wear")));

  const many = normalizeResidency({ ...HARBOR, agents: Array.from({ length: 40 }, (_, i) => ({ id: `agent:w${i}@x` })) });
  check(`a roster is capped at ${RESIDENCY_MAX_AGENTS}, with a note`,
    (many as any).residency.agents.length === RESIDENCY_MAX_AGENTS && (many as any).notes.some((n: string) => n.includes("truncated")));

  const long = normalizeResidency({ ...HARBOR, lore: "x".repeat(4000) });
  check("lore is clamped rather than allowed to eat the bag", (long as any).residency.lore.length === 400);

  // The privacy rule the model exists to make structural: there is nowhere to
  // put an address, so an authored one simply is not in the record.
  const sneaky = normalizeResidency({ ...HARBOR, host: "some-host.example", url: "http://10.0.0.4:5555", token: "sekrit" });
  const flat = JSON.stringify((sneaky as any).residency);
  check("a record has nowhere to carry a host, a URL or a token",
    !flat.includes("some-host") && !flat.includes("10.0.0.4") && !flat.includes("sekrit"));

  check("wornName strips the scheme and the home node", wornName("agent:harbor.wright@example") === "harbor.wright");
}

// ---- 2. projection ---------------------------------------------------------
console.log("\nprojection — descriptor to one request\n");
{
  const p = residencyRequest(HARBOR, { pos: [4, 0, -6] }) as any;
  check("a new marker is one create, with a placeholder id (the authority mints the real one)",
    p.ok === true && p.request.verb === "create" && p.request.args.id === "$residency" && p.id === null);
  const c = p.request.args.components;
  check("it shows the declared model", p.request.args.model === HARBOR.marker.model);
  check(`the record rides the namespaced \`${RC}\` component`, RC.includes("/") && c[RC]?.instance === "example:harbor");
  check("the marker is nailed down by default", c.lock === true);
  check("--no-lock leaves it loose", residencyRequest(HARBOR, { lock: false }).request.args.components.lock === undefined);
  check("it stands where it was asked, turned by its yaw", c.transform.pos[0] === 4
    && Math.abs(residencyRequest(HARBOR, { yaw: Math.PI }).request.args.components.transform.q[1] - 1) < 1e-9);
  check("it carries a label people can name it by (≤ 80)", typeof c.label === "string" && c.label.includes("Harbor") && c.label.length <= 80);
  check("the planted record carries no marker asset — that rode the create", c[RC].marker === undefined && c[RC].entity === undefined);
  // a standing marker is re-authored in place, through its lock (this protocol's lock binds every component write, its locker's too)
  const again = residencyRequest(HARBOR, { id: "m1" }) as any;
  check("re-planting a standing marker is a batch of sets through its lock, never a second create",
    again.request.verb === "batch" && again.request.args.throughLock === true
    && again.request.args.requests.every((r: any) => r.verb === "set" && r.args.id === "m1")
    && again.request.args.requests[0].args.component === RC);
  check("a record that won't normalize projects nothing", residencyRequest({ instance: "x" }).ok === false);
  check("a standing marker is found by its record's key, not its id",
    findResidencyMarker({ a: { label: "x" }, b: { [RC]: { ...HARBOR, lore: "older" } } }, HARBOR) === "b"
    && findResidencyMarker({ b: { [RC]: { ...HARBOR, instance: "example:elsewhere" } } }, HARBOR) === null);
}

// ---- 3. evidence -----------------------------------------------------------
console.log("\nevidence — the claim and the log, kept apart\n");
{
  const log = [
    { seq: 10, ts: 1_000, actor: "harbor", verb: "say" },
    { seq: 11, ts: 2_000, actor: "harbor.wright", verb: "spawn" },
    { seq: 12, ts: 3_000, actor: "harbor.wright", verb: "comp" },
    { seq: 13, ts: 4_000, actor: "harbor.wright", verb: "spawn" },
    { seq: 14, ts: 5_000, actor: "somebody-else", verb: "spawn" },
  ];
  const traces = traceResidents(log, HARBOR);
  const byName = Object.fromEntries(traces.map((t) => [t.wears, t]));
  check("the mind's acts are counted", byName.harbor.acts === 1 && byName.harbor.verbs.say === 1);
  check("an agent's acts are counted per verb", byName["harbor.wright"].acts === 3 && byName["harbor.wright"].verbs.spawn === 2);
  check("first and last are the entries' own timestamps",
    byName["harbor.wright"].first === 2_000 && byName["harbor.wright"].last === 4_000 && byName["harbor.wright"].lastSeq === 13);
  check("a declared agent that never acted is reported, not dropped",
    byName["harbor.scribe"].acts === 0 && traces.length === 3);
  check("a stranger's acts attach to nobody", !traces.some((t) => t.wears === "somebody-else"));

  const prose = describeTraces(traces, { now: 6_000 });
  check("the mind leads the prose", prose[0].startsWith("harbor "), prose[0]);
  check("an unseen agent says so in words", prose.some((l) => l.includes("declared, but has done nothing")));
  check("relative ages need a clock the caller passes", prose[0].includes("ago")
    && describeTraces(traces)[0].includes("last 1970"));

  // an `as` on the roster is how a body that joins under some other name is
  // still recognizable as this instance's
  const aliased = traceResidents([{ seq: 1, ts: 1, actor: "vw-7", verb: "say" }],
    { ...HARBOR, agents: [{ id: "agent:harbor.wright@example", as: "vw-7" }] });
  check("an explicit `as` binds a body joining under another name",
    aliased.find((t) => t.wears === "vw-7")!.acts === 1);
  check("a record that won't normalize traces nothing", traceResidents([], { instance: "x" }).length === 0);
}

// ---- 3b. perception, serverless -------------------------------------------
console.log("\nperception — what a reader is told, and what is never claimed\n");
{
  const line = describeResidency(normalizeResidency(HARBOR).residency);
  check("the line names the instance, the mind and the roster size",
    line.includes("example:harbor") && line.includes("Harbor") && line.includes("2 agents"), line);
  check("...and the residency date, not an age that would silently drift", line.includes("resident since 2026-09-04"));
  check("...and says it is a declaration rather than a presence", line.includes("not a presence"));
  check("...and claims nothing about anyone being here",
    !/\b(present|online|connected|running|here now)\b/i.test(line), line);
  check("a malformed record still reads as somebody's marker",
    describeResidency({ instance: "example:x" }).includes("nobody named"));
  check("a non-object bag reads as malformed", describeResidency(7).includes("malformed"));

  const begin = residencyLine("antra", "m1", residencyTransition(null, HARBOR));
  check("a record beginning narrates once, naming the mind", begin!.includes("records Harbor's residency"));
  const end = residencyLine("antra", "m1", residencyTransition(HARBOR, null));
  check("a withdrawal narrates as a withdrawal", end!.includes("withdraws"));
  const swap = residencyLine("antra", "m1", residencyTransition(HARBOR, { ...HARBOR, mind: { name: "Hesper" } }));
  check("a rededication names both minds", swap!.includes("Harbor") && swap!.includes("Hesper"));
  const tweak = residencyLine("antra", "m1", residencyTransition(HARBOR, { ...HARBOR, lore: "changed" }));
  check("an ordinary revision narrates as a revision", tweak!.includes("revises"));
  check("an identical re-author narrates nothing", residencyTransition(HARBOR, { ...HARBOR }) === null);
}

// Normalized records are inputs to planting and projection too: aliases
// must survive that second normalization and remain bound to actor evidence.
{
  const raw = { ...HARBOR, mind: {...HARBOR.mind, as: "Captain"}, agents: [{id:"agent:worker@example", as:"Dockhand"}] };
  const once = normalizeResidency(raw).residency;
  const twice = normalizeResidency(once).residency;
  check("normalized aliases survive another normalization", twice.mind.wears === "captain" && twice.agents[0].wears === "dockhand");
  const planted = (residencyRequest(raw) as any).request.args.components[RC];
  check("planting preserves aliases in actor traces", traceResidents([{actor:"dockhand",verb:"use",ts:1,seq:1}], planted)[1].acts === 1);
  for (const since of [1e100, -1e100, Infinity, NaN]) {
    const r = normalizeResidency({...raw, since});
    check("out-of-range residency dates are dropped with a note", r.ok && r.residency.since == null && r.notes.some(n=>n.includes("since")));
    check("invalid authored dates remain perceivable", typeof describeResidency({...raw,since}) === "string");
  }
}

// ---- 4. the authority ------------------------------------------------------
console.log("\nthe authority — the protocol's door takes the record, a re-plant re-authors one marker, the log is the evidence\n");
{
  // any model path names a model here (the scratch door's catalogue), as tools/agent-scratch.ts does
  const ANY = { get: (n: unknown) => (typeof n === "string" && n ? { label: n, surfaces: [] } : undefined), list: () => [] };
  const w: any = Object.assign(openWorld(scratch("residency"), "harbor"), { catalogue: ANY });
  // the protocol logs an opaque identity as the actor; a roster names the name a body WEARS. The server's directory joins the two
  // (GET /residency's nameOf); here a table does.
  const WRIGHT = "u-wright0000000000000", MIND = "u-harbor0000000000000";
  const NAMES: Record<string, string> = { [WRIGHT]: "harbor.wright", [MIND]: "harbor", "u-stranger": "somebody-else" };
  const nameOf = (a: string) => NAMES[a] ?? a;
  check("fixture: a world is founded", request(w, "olive", "create-world", { title: "harbor" }).ok);
  const plan = residencyRequest(HARBOR, { pos: [2, 0, 3] }) as any;
  const made = request(w, WRIGHT, plan.request.verb, plan.request.args);
  const id = made.ids?.$residency;
  check("a builder's create plants the marker, the namespaced record and its lock in one act", made.ok && typeof id === "string", JSON.stringify(made.refused));
  const view = () => viewState(w.state()).entities as Record<string, any>;
  check("the world holds the record as it was written", view()[id]?.[RC]?.mind?.name === "Harbor" && view()[id]?.lock === true);
  // this protocol's lock binds every component write, its locker's too: a plain set is refused, which is why a re-plant goes through it
  const plain = request(w, WRIGHT, "set", { id, component: RC, value: { ...plan.record, lore: "x" } });
  check("a plain set on the locked marker is refused `locked`", !plain.ok && plain.refused?.code === "locked", JSON.stringify(plain.refused));
  const standing = findResidencyMarker(view(), { ...HARBOR, lore: "revised" });
  check("a re-plant finds the marker that stands, by its record", standing === id);
  const again = residencyRequest({ ...HARBOR, lore: "revised" }, { id: standing }) as any;
  const re = request(w, WRIGHT, again.request.verb, again.request.args);
  check("...and re-authors it through its lock, as one batch", re.ok && view()[id][RC].lore === "revised", JSON.stringify(re.refused));
  check("...leaving one marker, not two", Object.values(view()).filter((e) => e?.[RC] != null).length === 1);
  check("a stranger's say is in the log", request(w, "u-stranger", "say", { text: "hello" }).ok);
  check("the mind speaks", request(w, MIND, "say", { text: "we live here" }).ok);
  // an unreadable record, to prove the projection says so rather than omitting it
  const broken = request(w, "olive", "create", { id: "$b", components: { transform: { pos: [9, 0, 9] }, [RC]: { instance: "example:nobody" } } });
  check("fixture: a record nobody can read is still kept (the door doesn't read a namespaced component)", broken.ok, JSON.stringify(broken.refused));

  const body = projectResidencies({ entities: view(), entries: w.entries, nameOf, world: "harbor" });
  const planted = body.residencies.find((r: any) => r.entity === id);
  check("the projection names the instance that planted the marker", planted?.record?.instance === "example:harbor");
  check("...with the roster it declared, and where it stands", planted?.record?.agents?.length === 2 && planted?.pos?.[0] === 2);
  const wright = planted?.traces?.find((t: any) => t.wears === "harbor.wright");
  check("the log's evidence rides beside the claim: the wright's two accepted requests, never its refused attempt",
    wright?.acts === 2 && wright.verbs.create === 1 && wright.verbs.batch === 1, JSON.stringify(wright));
  check("...the mind's say counts as an act", planted?.traces?.find((t: any) => t.mind)?.verbs?.say === 1);
  check("...a declared agent that never acted is still listed", planted?.traces?.find((t: any) => t.wears === "harbor.scribe")?.acts === 0);
  check("...and a stranger's acts attach to nobody", !planted?.traces?.some((t: any) => t.wears === "somebody-else"));
  const unread = body.residencies.find((r: any) => r.entity === broken.ids?.$b);
  check("an unreadable record is reported as unreadable, with why, not omitted",
    unread && unread.record === null && /mind\.name/.test(unread.why ?? ""), JSON.stringify(unread));
  const windowed = projectResidencies({ entities: view(), entries: w.entries, limit: 2 });
  check("the history window is the newest N entries, and says there is more", windowed.history.entries === 2 && windowed.history.hasMore === true);
  check("without the name a body wears, an opaque actor id matches no roster entry (nameOf is load-bearing)",
    projectResidencies({ entities: view(), entries: w.entries })
      .residencies.find((r: any) => r.entity === id)?.traces.find((t: any) => t.wears === "harbor.wright")?.acts === 0);
}

// ---- 5. perception ---------------------------------------------------------
console.log("\nperception — what a resident who reads is told, through the mcpl agent\n");
{
  const { WorldAgent } = await import("../mcpl/agent.ts");
  const { agentOnDoor } = await import("./agent-scratch.ts");
  const ag: any = new WorldAgent({ name: "reader" });
  const events: any[] = [];
  ag.onEvent = (ev: any) => { if (ev.kind === "world-change") events.push(ev); };
  const door = agentOnDoor(ag, "residency-percept");
  await door.sync(false);
  const plan = residencyRequest(HARBOR, { pos: [2, 0, 3] }) as any;
  const made = await door.act(plan.request.verb, plan.request.args, { who: "antra" });
  const id = made.ids?.$residency;
  check("fixture: the marker is planted live", made.ok && typeof id === "string", JSON.stringify(made.refused));
  check("a record planted live (one create) arrives as one ambient line, naming the mind",
    events.length === 1 && events[0].text.includes("records Harbor's residency"), JSON.stringify(events));
  const out = ag.look();
  const line = out.split("\n").find((l: string) => l.includes("residency: instance example:harbor")) ?? "";
  check("look() names the residency on the thing that carries it", line.includes(ag.handle(id)), out.split("\n").filter((l: string) => l.includes("Harbor")).join(" | "));
  check("...as a declaration, not a presence", line.includes("not a presence"));
  check(`...and does not fall back to \`components: ${RC}\``, !new RegExp(`components:[^\\n]*${RC}`).test(out));

  const re = residencyRequest({ ...HARBOR, lore: "revised" }, { id }) as any;
  await door.act(re.request.verb, re.request.args, { who: "antra" });
  check("a live revision arrives as one ambient world-change line",
    events.length === 2 && events[1].text.includes("revises Harbor's residency"), JSON.stringify(events.slice(1)));
  const mine = residencyRequest({ ...HARBOR, lore: "again" }, { id }) as any;
  await door.act(mine.request.verb, mine.request.args, { who: "reader" });
  check("...and your own authoring is never echoed back at you", events.length === 2);
  await door.act("delete", { id, throughLock: true }, { who: "antra" });
  check("removing the marker narrates as a withdrawal", events.length === 3 && events[2].text.includes("withdraws"), JSON.stringify(events.slice(2)));
}

// ---- 6. the route ----------------------------------------------------------
console.log("\nthe route — GET /residency on a scratch sequencer\n");
{
  const { scratchSequencer } = await import("./harness.ts");
  const h = await scratchSequencer("residency-route", { serverEnv: { SKIP_OPT_SWEEP: "1", TRUST_NAMES: "1" }, worlds: ["harbor"], owner: "harbor.wright", portFrom: 9640 });
  const { WorldAgent } = await import("../mcpl/agent.ts");
  const a: any = new WorldAgent({ name: "harbor.wright", world: "harbor", url: h.BASE.replace("http", "ws") + "/ws" });
  try {
    await a.connect();
    // no model: a scratch server has no library to measure one from, and the route is about the record, not the box
    const plan = residencyRequest(HARBOR, { pos: [2, 0, 3] }) as any;
    const { model: _m, ...args } = plan.request.args;
    const made = await a.request("create", args);
    const id = made?.ids?.$residency;
    check("fixture: the wright plants a marker through the server's door", made?.ok && typeof id === "string", JSON.stringify(made?.refused));
    const res = await fetch(`${h.BASE}/residency?world=harbor`);
    const body = await res.json() as any;
    check("GET /residency answers for a live world", res.ok && body.world === "harbor", `${res.status} ${JSON.stringify(body).slice(0, 160)}`);
    const planted = body.residencies?.find((r: any) => r.entity === id);
    check("...naming the instance, and the roster it declared", planted?.record?.instance === "example:harbor" && planted?.record?.agents?.length === 2);
    const wright = planted?.traces?.find((t: any) => t.wears === "harbor.wright");
    check("...with the log's evidence: the wright's create, its identity read as the name it wears", wright?.verbs?.create === 1, JSON.stringify(planted?.traces));
    check("an unknown world is a 404, and never created", (await fetch(`${h.BASE}/residency?world=no-such-world`)).status === 404
      && !(await (await fetch(`${h.BASE}/worlds`)).text()).includes("no-such-world"));
  } finally {
    try { a.close(); } catch { /* gone */ }
    await h.cleanup(fail || process.exitCode ? 1 : 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
