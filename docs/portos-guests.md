# Host-admitted guest entry (fork-only)

Carried on `portos` and never offered upstream (docs/FORK.md). A PortOS host sends a
visitor's browser to `/?guest=1&world=example&name=guest-example`; `/version` advertises
`capabilities.guestEntry: 1` for hosts to check before offering the flow.

**It is a reduction in authority, never another door in.** The browser skips account
discovery and automatic login, keeps the resident's saved name and account untouched,
skips the early socket, and sends `guest: true` in its join. For that join the server:

- ignores the browser's sign-in session, any agent credential, and a private server's
  typed-name account (TRUST_NAMES): the visitor is **anonymous**, so it is an ordinary guest
  with an identity minted for the connection;
- still applies the door key (`JOIN_TOKEN`) and every access rule the protocol has (an invite-only
  world, a ban by address) exactly as for any anonymous join;
- then admits it only when all of these hold, else refuses with the reason (close 4005,
  which the client shows and never redials):
  - the world has an owner;
  - the owner opted in: `@world` carries `portos/guests` `{admit: true}`;
  - the visit is embodied (never `spectate`, never a renderer);
  - what a guest holds there is the base rung (rank 0) with **no permission** — no
    build, no flight, no generation, no moderation, no chat read-back. That is the protocol's
    default for guests (`member`, no permissions); a world that raises
    `default-role.guests` closes this door.

```
act {verb: "set", args: {id: "@world", component: "portos/guests", value: {admit: true}}}   # owner: open the guest door
act {verb: "delete", args: {id: "@world", component: "portos/guests"}}                       # close it
```

A guest visit reads no flight recorder (`debug` is refused). Its speech is arrival-only,
like everyone's now: its snapshot and its history reads hold nothing said before it came.

## The port to the current protocol

the old protocol's door checked an explicit per-identity `visitor` grant (`grant {id: <name>, role:
"visitor", gen: false}`). the current protocol has no `visitor` role and mints a guest's identity per
connection, so no grant can name it in advance. The explicit, host-admitted part is
now the owner's world-level opt-in plus the rights check above; the host still decides
whom it sends. the old protocol's guest chat cutoffs (snapshot, scrollback, the history read) are the current protocol's
own arrival-only speech, so the fork no longer carries them.

PortOS scene objects can carry `portos/link` `{route: "/eidoverse", action: "visit"}`:
the use prompt offers **teleport as guest**, which sends the same entity-bound
navigation message as other PortOS objects (docs/portos-frame.md). The embedding host
resolves the destination and owns admission; the renderer never receives a peer URL to
follow from scene data.

Verification: `bun tools/protocol/guest-entry-check.ts` (a real scratch sequencer:
door key, opt-in, the downgrade of an account's typed name and an agent's credential,
arrival-only chat, edit and debug refusal, raised guests, spectating).
