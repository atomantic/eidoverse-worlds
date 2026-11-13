# How this fork is branched

Three kinds of branch, so that "what have we changed?" and "what do we owe
upstream?" are different questions with different answers.

| Branch | What it is | Syncing |
|---|---|---|
| `main` | A clean mirror of `upstream/main`. Nothing of ours is ever committed here. | Fast-forward only. It can never conflict. |
| `fix/*`, `codex/*` | One branch per upstream PR. Cut from `main`, offered to anima-research. | Rebase on `main` when upstream moves. |
| `contrib/pending-upstream` | `main` + every open PR branch merged. The integration point for work we HAVE offered upstream but that has not landed. | Rebuilt from `main` + the still-open PRs after each sync. |
| `portos` | `contrib/pending-upstream` + the PortOS override commits. **This is what deploys.** | Rebase the override commits onto the freshly rebuilt `contrib/pending-upstream`. |

`main` deliberately does not deploy. `deploy/deploy-vps.sh` tracks
`origin/portos` (override with `DEPLOY_BRANCH=`).

## Seeing what is different

```sh
# What we have offered upstream and are waiting on (3 open PRs: #165, #166, #171):
git log --oneline main..contrib/pending-upstream --merges
git diff main...contrib/pending-upstream

# The deliberate divergence — everything we are NOT sending upstream:
git log --oneline contrib/pending-upstream..portos
git diff contrib/pending-upstream..portos

# What upstream has that we have not taken yet:
git fetch upstream && git log --oneline main..upstream/main
```

The second of those is the important one. It is the whole answer to "what is
PortOS-specific here", it is one commit per feature, and every commit on it is
independently revertable.

## What lives on `portos`, and why it isn't upstream or in PortOS

**The bar.** Ideally `portos` is empty. A commit stays here only when it is
specific to PortOS *and* can't be done from PortOS's side. Anything generic goes
upstream as a PR; anything PortOS can do as an ordinary client of the world (the
authority's requests, MCPL, the HTTP routes) belongs in PortOS. Every row says
which, and the "next step" column is the debt.

| Commit | What it does | Verdict | Why | Next step |
|---|---|---|---|---|
| `docs` (this file, deploy script) | Branch topology; deploy follows `portos`. | **Keep** | Fork infrastructure, nothing to offer. | — |
| `portos` frame bridge | The iframe handshake with the PortOS host: an operator-set exact parent origin (`EMBED_PARENT_ORIGIN`), `GET /embed-config`, `/version` capabilities, "Open in PortOS" / "teleport as guest" on the use prompt for things carrying `portos/link`. | **Keep** | One consumer, and its vocabulary (`portos:connect`, `eidoverse:navigate`, PortOS's routes) is PortOS's own. It is dormant by default (no `EMBED_PARENT_ORIGIN`: answers nobody), writes nothing to the log and claims no lease. | If upstream ever wants embedding, offer the *generic* shape: exact trusted origin, receiver before boot, a nonce a reload retires, outbound messages naming only scene entities and host-rechecked routes. The PortOS names stay here. |
| `net: leave a world` | The client leaves a world cleanly (answers in-flight requests, cancels redials) before the host navigates to the next. | **Keep, with the bridge** | Only an embedding host swaps worlds under a live page. | Goes upstream with the generic embedding shape, if that ever happens. |
| `/name` hosted rename | Inside a PortOS session, `/name` hands off to PortOS's World Design. | **Keep, with the bridge** | Identity is staged in a PortOS surface; standalone it behaves as upstream. | Could be folded into the bridge commit. |
| `interaction` teleport pod | Now only a hand-test rig (`tools/interaction-preview.ts`) and docs: the pod's routing moved into the bridge on the port. | **Weak** | No runtime code left; it's a test rig for the bridge. | Fold into the bridge commit, or drop. |
| `guest entry` | `?guest=1` makes a join anonymous (ignores the browser's sign-in, agent tokens, TRUST_NAMES), and admits it only where the owner set `@world` `portos/guests {admit: true}`. | **Revisit** | The anonymous-entry half is generic (a visitor choosing to arrive without their account) and is only ever a *reduction* in authority. The opt-in half overlaps upstream's own `access` and `default-role.guests`. | Propose `?guest=1` upstream as "enter anonymously"; replace `portos/guests` with upstream's access settings; then this row is empty. |
| managed visitors (3 commits) | A loopback-only, bearer-gated broker for PortOS-managed nonhumanoid (`fly-v1`) visitors: scoped leases, bounded deadlines, a separate presence packet, no log writes. | **Keep (experimental)** | Deliberately *not* world-agent rights or aid1 identities, so it can't ride MCPL; it serves one external system (fly-garden via PortOS). Disabled unless its two env vars are set. | If it matures past an experiment, propose "managed visitors" upstream as an operator feature. |
| `residency` | A `portos/residency` record per resident (instance, mind, roster), its planter tool, a `GET /residency` evidence projection, and a `look()` line. | **Move to PortOS** | PR #164 was withdrawn because it's hosting semantics. But on this protocol the record is a namespaced component the engine already stores and shows without fork code; the planter is an ordinary authority client; the projection reads the log. None of it needs the engine. | Move `shared/residency.js`, the planter and the projection into PortOS (through MCPL / `world_history` / the routes), then drop the commit. |
| `landscapes` | Colliders index horizon-scale meshes once instead of per cell; the fallback sky follows the camera at 10 km. | **Upstream** | Generic engine behaviour: any large world needs it, nothing PortOS-specific. | Open a PR. |
| `probe-harness` | `launchBrowser({args})` adds a probe's own Chromium switches. | **Upstream** | Small and generic. | Open a PR. |
| `tools: client-boot-check` | Walks the browser's module graph from `client/main.js` and fails on duplicate top-level bindings. | **Upstream** | Catches a break no test in `tools/` can see (nothing imports `main.js`); generic. | Open a PR. |

The `models` loading-phase fix that used to live here is part of PR #166 now. The
port from the first protocol to this one (2026-11-13) rebuilt every override above on
this protocol's shapes; each commit's body says what changed. Names PortOS writes:
`portos/link` (was `portos`), `portos/residency` (was `residency`, and a
descriptor's `marker.lib` is now `marker.model`), `portos/guests` (new).

## Syncing upstream

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main

# Rebuild the contribution stack from whatever is still open:
git checkout -B contrib/pending-upstream main
for b in fix/explicit-ground-sit fix/object-loading codex/upstream-gamepad; do
  git merge --no-edit -m "Merge contribution branch $b (open upstream PR)" "origin/$b"
done

# Replay the overrides on top:
git rebase --onto contrib/pending-upstream <old-contrib-sha> portos
```

Drop a branch from that loop as soon as its PR merges — the commits arrive
through `main` instead, and re-merging them only manufactures conflicts.

`git config rerere.enabled true` is worth setting: the same handful of
conflicts (client/main.js system registration, server/config.ts exports, and the
suite rows in tools/protocol/suites.ts) recur on every sync, and rerere replays them.
docs/GATE-MANIFEST.md is generated: on a conflict take either side and regenerate it
(`bun tools/protocol/run.ts --manifest` replaces its generated block; `--check-manifest` confirms).
