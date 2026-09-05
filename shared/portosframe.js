// Frame-contract V1 policy — the half that is pure data and can therefore be
// exercised without a renderer, a browser or a socket. The host side of this
// contract is PortOS's docs/features/eidoverse.md, "Renderer capabilities and
// frame contract V1"; docs/labels.md carries our end of it.
//
// Nothing here reads or writes the world log. Semantic interpretation only:
// the component fold stays blind, exactly as shared/label.js leaves it.
export const FRAME_VERSION = 1;
// What THIS build implements, versioned independently so a host can adopt one
// leg without the others. Reported by GET /version and echoed at handshake.
export const FRAME_CAPABILITIES = Object.freeze({ objectLabels: 1, portosNavigation: 1, labelPreferences: 1 });
// The host's wire vocabulary mapped onto the preference names this renderer
// already stores. `all-nearby` is the host's word for our `all`; the mapping
// lives here so no stored preference or world record has to change to speak it.
const PREFERENCES = { nearby: 'nearby', 'all-nearby': 'all', off: 'off' };
// A section route names a place in the HOST's own interface: rooted, lowercase,
// at most three segments, and nothing else. A URL, a query, a fragment, a
// percent-escape, a dot segment and any path built from an authored name all
// fail this, so component data can never widen navigation into a redirect.
// Every segment reads the same — alphanumeric runs joined by single hyphens —
// so a hyphenated top-level section is as legal as a hyphenated nested one,
// while a segment of nothing but punctuation is legal nowhere.
const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ROUTE = new RegExp('^/' + SEGMENT + '(?:/' + SEGMENT + '){0,2}$');

/** The renderer-local preference a host value names, or null if unrecognized. */
export function readFramePreference(value) {
  return typeof value === 'string' && Object.hasOwn(PREFERENCES, value) ? PREFERENCES[value] : null;
}

/** A recognized section route, or null. Bounded before the pattern runs. */
export function readFrameRoute(value) {
  return typeof value === 'string' && value.length <= 64 && ROUTE.test(value) ? value : null;
}

/** An opaque session nonce, or null. Never parsed — only compared. */
export function readFrameNonce(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null;
}

/** An exact http(s) origin, or null. A value carrying a path, a query or a
 *  trailing slash is not an origin and is refused rather than repaired. */
export function readFrameOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value ? value : null;
}

/** The host section route this entity's component names, or null. */
export function frameRouteFor(entity) {
  return readFrameRoute(entity?.comp?.portos?.route);
}

/** Window, origin and version together — the authorization boundary. A sender
 *  that is merely first, merely referred or merely asking is none of these. */
export function acceptsFrameMessage(event, { source, origin } = {}) {
  const data = event?.data;
  return Boolean(source && origin && event?.source === source && event?.origin === origin
    && data && typeof data === 'object' && !Array.isArray(data)
    && data.version === FRAME_VERSION);
}
