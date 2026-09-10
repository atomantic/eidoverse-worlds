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
# What we have offered upstream and are waiting on (5 open PRs):
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
independently revertable. `docs/UPSTREAM-FLAGS.md` §6 explains the reasoning
for the frame bridge specifically.

## What lives on `portos` and why

| Commit | Why it is not going upstream |
|---|---|
| `residency` | PR #164, withdrawn on purpose: the schema assumes an instance, a coordinator mind and an agent roster. Hosting semantics, not a framework contract. |
| `portos` frame bridge | One consumer — the PortOS iframe host. The vocabulary and the navigable routes are PortOS's own. |
| `guest entry` | The visitor door exists for host-admitted PortOS travel. |
| `net: leave a world` | Only a host that opens the next world needs the departure handshake. |
| `/name` hosted rename | Stages identity in World Design, which is a PortOS surface. |
| `interaction` teleport pod | Routes to the host instead of issuing a verb. |
| `landscapes` | Horizon-scale worlds are ours; plausibly upstreamable later, never proposed. |
| `models` loading phase | Small fix layered on PR #166; fold into that PR if it is still open. |
| `probe-harness` | **Port candidate.** Small and generic — see UPSTREAM-FLAGS §6. |

## Syncing upstream

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main

# Rebuild the contribution stack from whatever is still open:
git checkout -B contrib/pending-upstream main
for b in fix/explicit-ground-sit fix/object-loading fix/particle-parts \
         fix/object-labels codex/upstream-gamepad; do
  git merge --no-edit -m "Merge contribution branch $b (open upstream PR)" "origin/$b"
done

# Replay the overrides on top:
git rebase --onto contrib/pending-upstream <old-contrib-sha> portos
```

Drop a branch from that loop as soon as its PR merges — the commits arrive
through `main` instead, and re-merging them only manufactures conflicts.

`git config rerere.enabled true` is worth setting: the same handful of
conflicts (client/main.js system registration, server/config.ts exports,
client/lib/objectlabels.js) recur on every sync, and rerere replays them.

## After every sync, before deploying

```sh
bun tools/client-boot-check.mjs
```

Nothing imports `client/main.js` — it is the browser's entry point, so a merge
that duplicates an import there passes every test in `tools/` and then fails at
`the engine failed to load` in the browser. This walks the client module graph
the way the browser resolves it (`client/` is the web root, so `../../shared/x.js`
from `client/lib/realize/` is `/shared/x.js`) and fails on duplicate top-level
bindings. It caught exactly that break on the first portos deploy.
