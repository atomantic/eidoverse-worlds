# Fork-only embedding: the PortOS frame contract V1

Carried on `portos` and never offered upstream (docs/FORK.md). One consumer: the
PortOS install that embeds this client in an iframe. The wire vocabulary names it
(`portos:connect`, `eidoverse:ready`, `eidoverse:navigate`), the navigable routes
are sections of PortOS's own interface, and the entity metadata driving the action
is the `portos/link` component PortOS writes when it projects its world. The
normative host-side contract is PortOS `docs/features/eidoverse.md`, section
*Renderer capabilities and frame contract V1*.

## Capabilities

`GET /version` reports `capabilities`; the handshake is what proves a loaded
browser bundle speaks them, so a stale bundle against a fresh sequencer says yes
there and stays silent here.

| capability | what |
|---|---|
| `portosNavigation` | an action on a linked thing sends `eidoverse:navigate` |
| `objectInteraction` | that action rides the contextual use prompt (E, the pad's X / □, a tap) |
| `worldDeparture` | `portos:depart` closes the world connection before the host opens the next |
| `identityRenameRequest` | `/name` stages a draft in the host's identity settings |
| `guestEntry` | `/?guest=1` is a host-admitted visitor door (docs/portos-guests.md) |

**Port to the current protocol.** The old-protocol build also advertised `objectLabels` and `labelPreferences`:
the floating-label overlay (upstream PR #168), which was closed as superseded by
the current protocol's string `label` and `description` components. This build ships no overlay, so
it claims neither, and a `portos:label-preference` message is ignored. The **Open
in PortOS** action that lived in the overlay's details panel is now the use
prompt's action for a linked thing.

## Configuration is the authorization boundary

Set `EMBED_PARENT_ORIGIN` to the host's exact `http(s)` origin — no path, no
query, not even a trailing slash, because the browser compares with `===`. PortOS
instead answers `/embed-config` at its own proxy, deriving the exact parent origin
from the browser-facing hostname and the PortOS port. Unset (the default) leaves
the bridge permanently dormant: an opener, a referrer and a query parameter are all
things a page claims about itself, and none of them is trusted in its place.
`GET /embed-config` returns the configured origin, or `null`, so leave the variable
unset on a public sequencer. The boot log says which (`embedded by: …`).

The host posts `portos:connect` with `version: 1` and a fresh nonce; the renderer
answers `eidoverse:ready` to that exact origin, echoing both and advertising its
capabilities. The receiver installs before the renderer has a scene (main.js
imports it first), and a connect that still arrives first is held until the
configuration answer lands. Each later message repeats the version and nonce; a
replacement connect or a reload retires the previous session, and its nonce stops
working. Anything unsupported or invalid is ignored, so an older client and a
standalone tab both keep a working scene.

## The host's component: `portos/link`

`{route, action?}` on a thing. the current protocol refuses an unregistered bare component name, so
the old protocol's `comp.portos` is spelled as a namespaced draft: kept, replayed and shown
honestly; the authority never reads it. **PortOS must write `portos/link`, not
`portos`.** A world owner may list it in `@world.trusted-components`.

While a validated session is live, a linked thing within reach offers, on the use
prompt and ahead of any of its own reactions:

- **open in PortOS** — any recognized section route;
- **teleport as guest** — `action: "visit"` with the route `/eidoverse` (the host's
  world launcher). A visit naming any other route offers nothing.

Activating it emits one `eidoverse:navigate` carrying the version, the nonce, the
entity id and that route — nothing else. A route is a rooted, lowercase path of at
most three segments; a URL, a query, a fragment, an escape, a traversal and any
path derived from an authored name are refused here before the host re-checks the
pair against its own legend. The press is re-evaluated when it happens, so a stale
prompt cannot send a moved or unlinked thing. The bridge issues no world request,
claims no lease, and never reads the log across the frame.

## Verification

`bun tools/portos-frame-test.ts` for the pure policy; `bun tools/portos-frame-dom-test.ts`
for the real receiver and the real use prompt: delayed configuration,
invalid/stale messages, navigation and teleport, session replacement and departure.
