# Host-admitted guest entry

A PortOS host can grant a fresh opaque identity `visitor` with generation and
flight disabled, then link its browser to `/?guest=1&world=example&name=guest-example`.
The ordinary world door key still applies. `/version` advertises
`capabilities.guestEntry: 1` for hosts to check before offering this flow.

The browser skips account discovery and automatic login, preserves its saved
resident name, disables the early owner socket, and sends `guest: true` in its
join. The server ignores an existing login for that join and checks the final
normalized identity against an already-owned world's visitor grant. Missing
grants, open worlds, builder/owner identities, generation, and flight authority
are refused. This is an explicit reduction in authority, not another builder door.

Guest snapshots and scrollback contain chat only after admission. They still
render the authored scene and show its current occupants. Debug history is
unavailable in guest mode. This cutoff controls the explicit guest protocol; it
does not turn the world's otherwise public history into a confidential archive.
Ordinary joins and existing world-history endpoints retain their current access
model. Chat remains ordinary authored `say` traffic, with
no automatic AI call or agent wake added by this protocol.

PortOS scene objects can set `comp.portos.action: 'visit'` alongside an existing
allowlisted navigation route. Their inspection button says **Teleport as guest**;
it sends the same entity-bound navigation message as other PortOS objects. The
embedding host resolves the destination and owns admission; the renderer never
receives a peer URL to follow from scene data.

Run `bun tools/guest-entry-test.ts` for the owned-process admission matrix
(account cookie, visitor chat, historic-chat exclusion, edit rejection and door
key). It folds every entry by default; run with `FOLD_EVERY=150` to exercise the
unfolded log tail. `bun tools/portos-frame-dom-test.ts` verifies the inspection
button and the existing frame trust checks.
