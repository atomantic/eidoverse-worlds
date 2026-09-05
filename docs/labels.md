# Optional object labels

Builders can opt an entity into a plaque with `comp {id, type:"label", data:{name:"Library", description:"Community reading room", visibility:"nearby"}}`. Objects without a valid non-empty authored name have no plaque. Remove the component to remove its plaque and restore fallback identity. The scene inspector offers an explicit Save label button; generic component JSON also supports offsets.

Names are trimmed plain text up to 120 Unicode code points; descriptions up to 2,000. `visibility` is `nearby` (default, 12m), `always` (60m maximum), or `inspect` (selected only). An optional `offset:[x,y,z]` is entity-local, finite and bounded to ±100m; otherwise the model's cached upper bound anchors the plaque. Components remain blind-folded data, including unknown fields; older clients can ignore them.

The browser's Inspect objects panel is read-only, available outside edit mode, and has a keyboard-accessible object list, centered-object action, and explicit Pick an object mode for mouse/touch mesh selection. A drag, pointer lock, placement or edit gesture does not inspect. Picking observes input and never issues verbs or leases. Details include stable ID, description, asset identity, socket and reaction names. Duplicate names are legal. Authored strings render as text, never markup.

Nearby, All nearby and Off are local browser preferences. All nearby additionally reveals authored inspect-only labels within range; it never opts unlabeled objects in. Off leaves explicit inspection available. At most 32 plaques appear, prioritizing selected and nearest entities after frustum/range filtering. The DOM plaque pool is allocated once; positions update at 10Hz, use live object transforms, and follow replacement/mount/motion without adding scene children or allocating textures. Records rebuild on folded changes so metadata is available before model hydration. The list includes unhydrated objects; plaques wait for a scene object. Occlusion uses the existing spatial collider index, at most four line-of-sight samples per update across the visible candidates, excluding the labeled entity itself. Results are cached between samples (up to roughly 800ms to revisit a full pool); the nearest 32 candidates are selected before occlusion, so hidden candidates do not backfill with farther labels. render-only geometry without a collider does not block plaques.

Browser, scene tree and agent look share `shared/label.js`: authored name, then matching logged asset name, then humanized basename, then entity ID. Only logged assets participate so optional catalog fetch timing cannot make clients disagree.

Verification: `bun tools/label-test.ts`, `bun tools/foldfix-test.ts`, `bun tools/look-test.ts`, and `bun tools/label-browser-test.ts`. The browser harness uses a disposable world and records a narrow-viewport screenshot and timing evidence in `/tmp/eido-label-*`.

## Embedding: the PortOS frame contract V1

A host application may embed this client in an iframe and drive three
independently versioned capabilities: `objectLabels`, `portosNavigation`, and
`labelPreferences`. `GET /version` reports what the build implements; the
handshake is what proves a loaded browser bundle actually speaks it, so a stale
bundle against a fresh sequencer says yes there and stays silent here. The
normative host-side contract is PortOS `docs/features/eidoverse.md`, section
*Renderer capabilities and frame contract V1*.

**Configuration is the authorization boundary.** Set `EMBED_PARENT_ORIGIN` to
the host's exact `http(s)` origin — no path, no query, not even a trailing
slash, because the browser compares with `===`. PortOS writes it into the
`.env.portos` file it generates for the managed checkout. Unset (the default)
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
floating plaques and leaves the Inspect objects panel — including the selected
object's details — fully usable.

**Open in PortOS** appears in that panel for an object whose `comp.portos`
names a recognized section route, and only while a validated session is live.
Activating it emits one `eidoverse:navigate` carrying the version, the nonce,
the entity ID, and that route — nothing else. A route is a rooted, lowercase
path of at most three segments; a URL, a query, a fragment, an escape, a
traversal, and any path derived from an authored name are all refused here
before the host re-checks the pair against its own legend. Preference changes
and inspection issue no world verb and claim no lease.

Verification: `bun tools/portos-frame-test.ts` for the policy, and
`bun tools/portos-frame-browser-test.ts` for the live handshake — a disposable
sequencer, two throwaway host origins, and a real parent/iframe pair covering
wrong-window, wrong-origin, wrong-nonce, wrong-version and arbitrary-route
rejection, keyboard and touch activation on a narrow viewport, slow
initialization, reload, and reconnect.
