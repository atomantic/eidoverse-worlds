// tools/protocol/guest-entry-check.ts — the host-admitted guest door (fork-only, docs/portos-guests.md), against a real
// sequencer. Scratch port, scratch WORLDS_DIR, its own tokens.json; never 8968/8970. usage: bun tools/protocol/guest-entry-check.ts
//   G1  /version advertises capabilities.guestEntry
//   G2  the door key still applies to a guest
//   G3  a world whose owner hasn't opted in (@world portos/guests {admit: true}) refuses the guest door
//   G4  an opted-in world admits a guest: anonymous, the base rung, no permission — even when the typed name is an account's
//       here (TRUST_NAMES) and an agent's credential rides along: the guest door can only be less
//   G5  speech is arrival-only for the guest: nothing said before it came is in its snapshot or its history read
//   G6  a guest can't build; and reads no flight recorder (debug)
//   G7  a world whose guests hold more than a visitor (default-role.guests builder) refuses the guest door
//   G8  a guest visit is embodied: a spectating guest join is refused
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { ENGINE, scratch } from "./common.ts";
import { tryUntil } from "./wait.ts";
import { freePort } from "../harness.ts";
import { helloOf } from "../../shared/protocol/hello.js";

const root = scratch("guest-entry");
let pass = 0, fail = 0;
const ok = (cond, what, detail?) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); } };

const W = path.join(root, "w"); fs.mkdirSync(W, { recursive: true });
const TOK = path.join(root, "tokens.json");
fs.writeFileSync(TOK, JSON.stringify({ "tok-rowan": { id: "Rowan" } }));
const DOOR = "test-door";
const env = (extra = {}) => ({ ...process.env, WORLDS_DIR: W, OPT_DIR: path.join(root, "opt"), SKIP_OPT_SWEEP: "1", HOST: "127.0.0.1",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", JOIN_TOKEN: DOOR, SERVER_OPERATORS: "", AGENT_TOKENS_PATH: TOK, SESSIONS_PATH: path.join(root, "sessions.json"),
  TRUST_NAMES: "1", ...extra });
const tool = (args) => { const r = Bun.spawnSync(["bun", "tools/protocol/world.ts", ...args], { cwd: ENGINE, env: env() }); return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() }; };
async function start() {
  const port = freePort(9610);
  const logf = path.join(root, `srv-${port}.log`);
  const p = Bun.spawn(["bun", "server/server.ts"], { cwd: ENGINE, env: env({ PORT: String(port) }), stdout: Bun.file(logf), stderr: Bun.file(logf + ".err") });
  const up = await tryUntil("the scratch sequencer answers /version", async () => {
    if (p.exitCode != null) return "dead";
    try { return (await fetch(`http://127.0.0.1:${port}/version`, { signal: AbortSignal.timeout(800) })).ok || null; } catch { return null; } }, { ms: 15_000, step: 150 });
  return { port, proc: p, dead: up !== true, log: logf };
}
async function sock(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const msgs = []; let n = 0; const waiters = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); msgs.push(m); if (m.type === "reply") waiters.get(m.id)?.(m.reply); };
  let closed = null; ws.onclose = (e) => { closed = e.code; };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const next = (pred, what) => tryUntil(what, () => msgs.find(pred) ?? (closed != null ? "closed" : null), { ms: 8_000, step: 30 });
  return {
    msgs, get closed() { return closed; }, next,
    async join(world, id, extra = {}) { const k = msgs.length; ws.send(JSON.stringify({ type: "join", hello: helloOf(), world, id, avatar: "", replica: true, token: DOOR, ...extra }));
      await tryUntil(`${id}'s join is answered (or its socket closes)`, () => msgs.slice(k).some((m) => m.type === "snapshot" || m.type === "error") || closed != null, { ms: 10_000, step: 50 });
      await tryUntil(`${id}'s refusal closes its socket`, () => msgs.slice(k).some((m) => m.type === "snapshot") || closed != null || null, { ms: 3_000, step: 30 }).catch(() => {});
      return { snapshot: msgs.slice(k).find((m) => m.type === "snapshot"), errors: msgs.slice(k).filter((m) => m.type === "error").map((m) => m.error) }; },
    req: (verb, args = {}) => new Promise((res) => { const id = `r${++n}`; waiters.set(id, res); ws.send(JSON.stringify({ type: "request", id, verb, args })); setTimeout(() => res({ ok: false, timeout: true }), 4000); }),
    raw: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
}

ok(tool(["found", "visit", "--owner", "Ann"]).code === 0, "(setup) found visit, Ann owns it");
const srv = await start();
ok(!srv.dead, "(setup) the server is up", srv.dead ? fs.readFileSync(srv.log + ".err", "utf8").slice(-400) : "");
try {
  // G1
  const version = await (await fetch(`http://127.0.0.1:${srv.port}/version`)).json();
  ok(version.capabilities?.guestEntry === 1, "G1 /version advertises guestEntry", version.capabilities);

  const own = await sock(srv.port); const jo = await own.join("visit", "Ann");
  ok(jo.snapshot?.yourRights?.role === "owner", "(setup) Ann joins as the owner", [jo.errors, jo.snapshot?.yourRights]);
  const said = await own.req("say", { text: "Example conversation before the visit." });
  ok(said.ok, "(setup) the owner says something before the guest comes", said);

  // G2
  const nokey = await sock(srv.port); const jn = await nokey.join("visit", "visitor-one", { guest: true, token: "" });
  ok(!jn.snapshot && jn.errors.some((e) => /join token/.test(e)), "G2 a guest still needs the door key", jn.errors);

  // G3
  const early = await sock(srv.port); const je = await early.join("visit", "visitor-one", { guest: true });
  ok(!je.snapshot && je.errors.some((e) => /doesn't admit host guests/.test(e)) && early.closed === 4005, "G3 a world that hasn't opted in refuses the guest door (4005)", [je.errors, early.closed]);

  // G4
  const optin = await own.req("set", { id: "@world", component: "portos/guests", value: { admit: true } });
  ok(optin.ok, "(G4 setup) the owner opts the world in", optin);
  const guest = await sock(srv.port); const jg = await guest.join("visit", "Ann", { guest: true, agentToken: "tok-rowan" });
  const r = jg.snapshot?.yourRights;
  ok(!!jg.snapshot && r?.guest === true && r?.role === "member" && r?.rank === 0 && r?.permissions?.length === 0 && !r?.gen && !r?.fly,
    "G4 an opted-in world admits the guest at the base rung with no permission, not as the owner whose name it typed nor the agent whose token rode along", [jg.errors, r]);
  ok(jg.snapshot && jg.snapshot.actor !== jo.snapshot.actor, "G4 the guest is not the owner's identity", [jg.snapshot?.actor, jo.snapshot?.actor]);

  // G5
  const chat = JSON.stringify(jg.snapshot?.state?.recentChat ?? []) + JSON.stringify(jg.snapshot?.entries ?? []);
  ok(!chat.includes("Example conversation before the visit."), "G5 the guest's snapshot holds nothing said before it came");
  const hello = await guest.req("say", { text: "Hello from the example guest." });
  ok(hello.ok, "G5 the guest may speak", hello);
  guest.raw({ type: "history", reqId: "gh", limit: 50 });
  const hist = await guest.next((m) => m.type === "history" && m.reqId === "gh", "the guest's history read");
  const histText = JSON.stringify(hist);
  ok(!histText.includes("Example conversation before the visit.") && histText.includes("Hello from the example guest."), "G5 the guest's history read starts at its arrival", hist?.entries?.slice?.(-3));

  // G6
  const made = await guest.req("create", { components: { label: "forbidden" } });
  ok(made.ok === false && !!made.refused, "G6 a guest can't build", made);
  guest.raw({ type: "debug", reqId: "gd", limit: 5 });
  const dbg = await guest.next((m) => (m.type === "debug" && m.reqId === "gd") || (m.type === "error" && /debug history/.test(m.error)), "the guest's debug read");
  ok(dbg?.type === "error", "G6 a guest reads no flight recorder", dbg);
  const odbg = (own.raw({ type: "debug", reqId: "od", limit: 5 }), await own.next((m) => m.type === "debug" && m.reqId === "od", "the owner's debug read"));
  ok(odbg?.type === "debug", "G6 …while an ordinary join still does", odbg?.type);

  // G7
  const raised = await own.req("set", { id: "@world", component: "default-role", value: { role: "builder", guests: "builder" } });
  ok(raised.ok, "(G7 setup) the owner raises guests to builder", raised);
  const more = await sock(srv.port); const jm = await more.join("visit", "visitor-two", { guest: true });
  ok(!jm.snapshot && jm.errors.some((e) => /hold more than a visitor/.test(e)), "G7 a world whose guests build refuses the guest door", jm.errors);
  const lowered = await own.req("set", { id: "@world", component: "default-role", value: { role: "builder" } });
  ok(lowered.ok, "(G7) guests back to the base rung", lowered);

  // G8
  const watch = await sock(srv.port); const jw = await watch.join("visit", "visitor-three", { guest: true, spectate: true });
  ok(!jw.snapshot && jw.errors.some((e) => /embodied/.test(e)), "G8 a guest visit is never a watcher", jw.errors);
  const again = await sock(srv.port); const ja = await again.join("visit", "visitor-four", { guest: true });
  ok(!!ja.snapshot, "G8 …and the door still opens for an embodied guest", ja.errors);

  for (const s of [own, nokey, early, guest, more, watch, again]) s.close();
} finally {
  srv.proc.kill();
}
console.log(`[guest-entry-check] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
