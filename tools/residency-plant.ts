// Plant a residency marker (a hosting system saying, in-world, where it lives) and read back who a world says lives in
// it. PortOS fork only (docs/FORK.md).
//
//   bun tools/residency-plant.ts residency/example.json --dry-run
//   WORLD_URL=ws://localhost:8940/ws AGENT_TOKEN=aid1… \
//     bun tools/residency-plant.ts <descriptor>.json --world commons --pos 4,0,-6
//   WORLD_URL=… bun tools/residency-plant.ts --report --world commons
//
// The DESCRIPTOR is the host system's own instance data and lives wherever that host keeps it (`$RESIDENCY_DESCRIPTOR`,
// or a path: residency/README.md says why it does not belong in this repo). The REQUEST it becomes is shared/residency.js's
// `residencyRequest`, so this tool decides nothing about what a residency IS: it carries one request to the authority,
// as a WorldAgent (mcpl/agent.ts) carries any, and reads the projection back. Builder rank: a create, or a set.
//
// Re-running is the normal case (plant it from a schedule and the record stays current): the authority mints ids, so a
// marker that already stands is FOUND by its record's key (instance + mind) and re-authored in place, through its lock.

import { existsSync, readFileSync } from "node:fs";
import {
  RESIDENCY_COMPONENT, normalizeResidency, residencyRequest, findResidencyMarker, describeResidency, describeTraces,
} from "../shared/residency.js";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string | null = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name: string) => argv.includes(`--${name}`);

const URL_ = process.env.WORLD_URL ?? "ws://localhost:8940/ws";
const WORLD = flag("world") ?? "commons";
const ME = flag("as") ?? process.env.RESIDENCY_ID ?? "residency-planter";
/** The projection rides the same host as the door: ws→http, minus /ws. */
const httpBase = URL_.replace(/^ws/, "http").replace(/\/ws$/, "");
const key = process.env.AGENT_TOKEN || process.env.WORLD_TOKEN || "";

/** The read side: what this world says about everyone who lives in it, the claim and the log's evidence, in prose. */
async function report(): Promise<number> {
  const where = `${httpBase}/residency?world=${encodeURIComponent(WORLD)}`;
  const body = await fetch(where, { headers: key ? { authorization: `Bearer ${key}` } : {} }).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<any>;
  }).catch((err) => { console.error(`✗ ${where} — ${err.message}`); return null; });
  if (!body) return 1;
  if (!body.residencies?.length) { console.log(`\nnobody has recorded a residency in "${WORLD}"\n`); return 0; }
  const now = Date.now();
  for (const r of body.residencies) {
    console.log(`\n[${r.label ?? r.entity}] ${r.record ? describeResidency(r.record) : `unreadable record — ${r.why}`}`);
    for (const line of describeTraces(r.traces ?? [], { now })) console.log(`    ${line}`);
  }
  console.log(`\n(evidence read from ${body.history?.acts ?? 0} acts in ${body.history?.entries ?? 0} log entries)\n`);
  return 0;
}

const file = argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) ?? process.env.RESIDENCY_DESCRIPTOR;
// `--report` with no descriptor to plant is the read-only mode
if (has("report") && !file) process.exit(await report());
if (!file || !existsSync(file)) {
  console.error("usage: bun tools/residency-plant.ts <descriptor.json> [--world W] [--pos x,y,z] [--yaw rad] [--no-lock] [--dry-run]");
  console.error("       bun tools/residency-plant.ts --report [--world W]        # read back who lives there");
  console.error("       the descriptor path may also come from $RESIDENCY_DESCRIPTOR");
  process.exit(2);
}

const descriptor = JSON.parse(readFileSync(file, "utf8"));
const check = normalizeResidency(descriptor);
if (!check.ok) { console.error(`✗ ${file}: ${check.why}`); process.exit(1); }
for (const n of check.notes) console.warn(`  ! ${n}`);

const pos = (flag("pos") ?? "0,0,0").split(",").map(Number);
if (pos.length !== 3 || pos.some((n) => !Number.isFinite(n))) { console.error("--pos wants x,y,z"); process.exit(2); }
const opts = { pos, lock: !has("no-lock"), ...(flag("yaw") != null ? { yaw: Number(flag("yaw")) } : {}) };
const fresh = residencyRequest(descriptor, opts);
if (!fresh.ok) { console.error(`✗ ${fresh.why}`); process.exit(1); }
console.log(`\n${describeResidency(fresh.record)}\n`);

if (has("dry-run")) {
  console.log(`  ${fresh.request.verb} ${JSON.stringify(fresh.request.args)}`);
  console.log(`\n(a new marker; one that already stands is re-authored with a batch of sets through its lock) — nothing was sent\n`);
  process.exit(0);
}

const { WorldAgent } = await import("../mcpl/agent.ts");
const a: any = new WorldAgent({ name: ME, world: WORLD, url: URL_, declares: "agent" });
try {
  await a.connect();
  const standing = findResidencyMarker(Object.fromEntries(a.entities), descriptor);
  const plan = standing ? residencyRequest(descriptor, { ...opts, id: standing }) : fresh;
  if (!plan.ok) throw new Error(plan.why);
  if (standing) console.log(`  [${a.handle(standing)}] already stands — re-authoring its record only`);
  const r = await a.request(plan.request.verb, plan.request.args);
  if (!r?.ok) { console.error(`✗ refused: ${r?.refused?.code} — ${r?.refused?.reason}${r?.refused?.fix ? ` (${r.refused.fix})` : ""}`); process.exitCode = 1; }
  else {
    const id = standing ?? r.ids?.$residency;
    console.log(`\n✓ planted [${id}] (${RESIDENCY_COMPONENT}) in "${WORLD}" via ${URL_} as ${ME}`);
    // a plant nobody can see is not a plant: read the world's own account of it back
    if (has("report")) process.exitCode = await report();
  }
} catch (err) {
  console.error(`✗ ${(err as Error).message ?? err}`); process.exitCode = 1;
} finally {
  try { a.close(); } catch { /* gone */ }
}
process.exit(process.exitCode ?? 0);
