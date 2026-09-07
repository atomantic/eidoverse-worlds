# Contextual object controls

Approach a visible interactive object within three metres. **E** or the on-screen
button performs its primary action. Labels can stay off. Occlusion, editing,
photo mode, open modal overlays, chat focus, and held-key repeat suppress use.

Authors declare the primary action with data:

```text
comp {id: "example-lamp", type: "interaction",
      data: {action: "toggle", label: "Toggle lamp"}}
```

The control sends the existing `use {id, action}` verb. It does not grant building
rights or execute component data. A single authored `reactions` entry is also
discoverable without this component; with several reactions, declare the primary
action explicitly. Other actions remain available through the existing protocol.
Attach an authored behavior to supply a toggle's effect; see
`sdk/examples/toggle-lamp.js`. Effects are ordinary logged verbs, so replay and
late joining reconstruct state without running the input again.

PortOS guest pods are a fork-specific adapter. A trusted embedding session offers
the pod's action through `openInPortos`, which sends only the entity and section
route. PortOS resolves that entity against its own projection and admits travel
through its registered peer. No destination URL or credential belongs in the
component or renderer's outbound navigation message.

The frame advertises `objectInteraction: 1` and `worldDeparture: 1`. A valid
`portos:depart` message carries the current V1 nonce and comes from the configured
parent origin/window. The renderer stops presence and retries, closes its world
socket, then returns `eidoverse:departed` with the same nonce and `ok: true`.
Failure reports `ok: false`; the parent must not enter the destination. `pagehide`
also closes the socket, and a persisted `pageshow` can re-enter the previous world.

Verification:

```sh
bun tools/interaction-test.ts
bun tools/departure-test.ts
bun tools/portos-frame-dom-test.ts
```

Gamepads should feed these same semantic actions. Movement, camera, dead zones,
focus, disconnect handling, and embedded permissions are tracked separately in
[issue 11](https://github.com/atomantic/eidoverse-worlds/issues/11).
