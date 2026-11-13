// Frame-contract V1 policy — the half that is pure data and can therefore be
// exercised without a renderer, a browser or a socket. The host side of this
// contract is PortOS's docs/features/eidoverse.md, "Renderer capabilities and
// frame contract V1"; docs/portos-frame.md carries our end of it. Fork-only
// (docs/FORK.md): never offered upstream.
//
// Nothing here reads or writes the world log. Semantic interpretation only:
// the component fold stays blind to the host's component.
export const FRAME_VERSION = 1;
// What THIS build implements, versioned independently so a host can adopt one
// leg without the others. Reported by GET /version and echoed at handshake.
// Ported to the current protocol: `objectLabels` and `labelPreferences` are NOT advertised. They were
// the floating-label overlay (upstream PR #168), closed as superseded by the current protocol's
// string `label`; this build has no overlay for a preference to drive, so it
// does not claim one, and a `portos:label-preference` is ignored.
export const FRAME_CAPABILITIES = Object.freeze({ portosNavigation: 1, worldDeparture: 1, objectInteraction: 1, identityRenameRequest: 1 });
// The host's own component on a projected entity: {route, action?}. the current protocol refuses
// an unregistered BARE component name, so the old `comp.portos` is spelled as a
// namespaced draft (AGENTS.md "Components"): kept, replayed, read only here.
export const PORTOS_COMPONENT = 'portos/link';
// A section route names a place in the HOST's own interface: rooted, lowercase,
// at most three segments, and nothing else. A URL, a query, a fragment, a
// percent-escape, a dot segment and any path built from an authored name all
// fail this, so component data can never widen navigation into a redirect.
// Every segment reads the same — alphanumeric runs joined by single hyphens —
// so a hyphenated top-level section is as legal as a hyphenated nested one,
// while a segment of nothing but punctuation is legal nowhere.
const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ROUTE = new RegExp('^/' + SEGMENT + '(?:/' + SEGMENT + '){0,2}$');
// The one route a teleport pod may name: the host's world launcher.
export const VISIT_ROUTE = '/eidoverse';

/** A recognized section route, or null. Bounded before the pattern runs. */
export function readFrameRoute(value) {
  return typeof value === 'string' && value.length <= 64 && ROUTE.test(value) ? value : null;
}

/** An opaque session nonce, or null. Never parsed — only compared. */
export function readFrameNonce(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null;
}

/** A human identity draft for the host, or null. The host still owns the
 *  authoritative validation and save; this keeps malformed requests off the
 *  frame wire and matches the shared 64-character identity boundary. */
export function readFrameIdentityName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  const hasControlCharacter = [...name]
    .some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
  return name.length > 0 && name.length <= 64 && !hasControlCharacter ? name : null;
}

/** An exact http(s) origin, or null. A value carrying a path, a query or a
 *  trailing slash is not an origin and is refused rather than repaired. */
export function readFrameOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value ? value : null;
}

/** The host's link on a thing's (flat, current-protocol) component bag, or null. */
export function portosLinkOf(bag) {
  const link = bag?.[PORTOS_COMPONENT];
  return link && typeof link === 'object' && !Array.isArray(link) ? link : null;
}

/** The host section route a thing's component bag names, or null. */
export function frameRouteFor(bag) {
  return readFrameRoute(portosLinkOf(bag)?.route);
}

/** What a thing offers while a validated host session is live, or null:
 *  'visit' (Teleport as guest) for a pod naming the host's world launcher,
 *  'open' (Open in PortOS) for any other recognized route. A visit naming any
 *  other route offers nothing: the pod's one destination is the launcher. */
export function portosAction(bag, hosted) {
  if (!hosted) return null;
  const route = frameRouteFor(bag);
  if (!route) return null;
  if (portosLinkOf(bag).action === 'visit') return route === VISIT_ROUTE ? 'visit' : null;
  return 'open';
}

/** Window, origin and version together — the authorization boundary. A sender
 *  that is merely first, merely referred or merely asking is none of these. */
export function acceptsFrameMessage(event, { source, origin } = {}) {
  const data = event?.data;
  return Boolean(source && origin && event?.source === source && event?.origin === origin
    && data && typeof data === 'object' && !Array.isArray(data)
    && data.version === FRAME_VERSION);
}
