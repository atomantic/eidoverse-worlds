# Optional object labels

Object labels are a local rendering option, **off by default**. An authored
`label` component names an object; it does not opt visitors into an overlay.
Embedders can enable `?objectLabels=nearby` or `?objectLabels=all`, or call
`configureObjectLabels({ mode: 'nearby' | 'all' | 'off' })` from
`client/lib/objectlabels.js`. This changes no world state. There is no shared
browser preference that silently enables labels in another world.

Builders author ordinary component data:

```js
comp {id: 'library', type: 'label', data: {
  name: 'Library', description: 'Community reading room', visibility: 'nearby'
}}
```

Names are trimmed plain text up to 120 Unicode code points; descriptions up to
2,000. `visibility` is `nearby` (default, 12m), `always` (60m maximum), or
`inspect`. An `inspect` label never floats in `nearby` mode — it has no plaque
there, and the editor labels the option accordingly; the renderer's `all` mode
shows any authored label within 60m, inspect-only ones included, and its name
reaches the scene tree and an agent's `look` either way. Objects without an authored name
never acquire a floating label. `off` hides labels; already-open details remain
usable until dismissed. Existing scene-tree inspection remains available.

An optional `offset: [x, y, z]` is entity-local, finite and bounded to ±100m,
and is used exactly as given — it needs no geometry, so it is how a marker with
no mesh of its own gets a label. Otherwise the model's cached upper bound
anchors the label, with 0.2m of clearance above it. That bound is measured once
per rendered object and cached, including the "no bounds at all" answer: an
object never grows geometry in place — the realizer swaps in a new object — so a
geometry-less object with no authored offset is measured once, not every frame.
Labels follow live transforms and wait for actual geometry, including replacement
and promotion after loading. Range is measured from the entity root so a tall
object's own height does not make it disappear from the nearby set.

Each label is a keyboard-accessible button positioned over its object. Click or
tap it to reveal the name, description, and authored seat/action names. A close
button and Escape dismiss details. There is no separate object dropdown,
center-screen picker, or armed mouse mode. Selecting a label cannot move an
object, claim a physics lease, or write a world verb. Host-specific navigation
and meaning belong in the embedding application or its fork.

The overlay consumes only the keys it acts on — Enter, Space and Escape — and
lets every other key through to the world, so movement keeps working while a
plaque holds focus. Tab is not trapped: focus can always leave a label. A mouse
click activates a plaque without leaving focus on it; Tab still focuses it and
Enter or Space still opens its details. Pointer events over a plaque never
start a look-drag.

At most 32 labels appear. Selected and nearer objects take priority; labels that
overlap another label, or that would run past a viewport edge, are suppressed
instead of stacked into unreadable text or drawn half off-screen. DOM buttons are
reused without changing their entity identity when distance ordering changes.
Positions follow camera and object transforms. Occlusion uses existing spatial
colliders, with at most four sight-line samples every 100ms, excluding the object
itself. Cached results may lag by roughly 800ms for a full pool. The nearest 32
candidates are selected before occlusion and overlap suppression; hidden
candidates do not backfill farther labels. Render-only geometry without a
collider does not block labels.

Browser, scene tree and agent look share `shared/label.js`: authored name, then
matching logged asset name, humanized basename, and entity ID. Folded entity IDs
come from map keys, not an `id` property on the values. Components remain blind
folded data; older clients may ignore their presentation semantics.

Verification: `bun tools/label-test.ts`, `bun tools/label-dom-test.ts`, and
`bun tools/foldfix-test.ts`. The DOM test consumes actual folded records without
inventing ID fields and uses real THREE transforms. `bun tools/label-preview.ts`
starts an isolated synthetic scene for visual mouse, keyboard and touch checks;
open the printed URL and stop it with Ctrl-C when finished.

## Fork-only embedding: the PortOS frame contract V1

A host application may embed this client in an iframe and drive three
independently versioned capabilities: `objectLabels`, `portosNavigation`, and
`labelPreferences`. `GET /version` reports what the build implements; the
handshake is what proves a loaded browser bundle actually speaks it, so a stale
bundle against a fresh sequencer says yes there and stays silent here. The
normative host-side contract is PortOS `docs/features/eidoverse.md`, section
*Renderer capabilities and frame contract V1*.

**Configuration is the authorization boundary.** Set `EMBED_PARENT_ORIGIN` to
the host's exact `http(s)` origin — no path, no query, not even a trailing
slash, because the browser compares with `===`. PortOS instead answers `/embed-config` at its own proxy, deriving the exact
parent origin from the browser-facing hostname and the PortOS port. Unset (the default)
leaves the bridge permanently dormant: an opener, a referrer and a query
parameter are all things a page claims about itself, and none of them is
trusted in its place. `GET /embed-config` returns the configured origin, or
`null`, so leave the variable unset on a public sequencer.

The host posts `portos:connect` with `version: 1` and a fresh nonce; the
renderer answers `eidoverse:ready` to that exact origin, echoing both and
advertising its capabilities. The receiver installs before the renderer has a
scene, and a connect that still arrives first is held until the configuration
answer lands. Each later message repeats the version and nonce; a replacement
connect or a reload retires the previous session, and its nonce stops working.
Anything unsupported or invalid is ignored, so an older client and a standalone
tab both keep a working scene.

`portos:label-preference` carries `nearby`, `all-nearby`, or `off`.
`all-nearby` is the host's word for the local **All nearby** mode and is mapped
on arrival, so no stored preference or world record changes shape. `off` hides
floating labels and leaves already-open object details usable. The bridge maps
its preference onto `configureObjectLabels`; it never writes framework storage.

**Open in PortOS** appears in the selected label's details for an object whose `comp.portos`
names a recognized section route, and only while a validated session is live.
Activating it emits one `eidoverse:navigate` carrying the version, the nonce,
the entity ID, and that route — nothing else. A route is a rooted, lowercase
path of at most three segments; a URL, a query, a fragment, an escape, a
traversal, and any path derived from an authored name are all refused here
before the host re-checks the pair against its own legend. Preference changes
and inspection issue no world verb and claim no lease.

Verification: `bun tools/portos-frame-test.ts` for the pure policy and
`bun tools/portos-frame-dom-test.ts` for the actual handshake receiver and label
adapter, including delayed configuration, invalid/stale messages, navigation,
opt-out and session replacement. The upstream synthetic label preview verifies
the generic renderer; the host's frame acceptance also exercises its proxy.
