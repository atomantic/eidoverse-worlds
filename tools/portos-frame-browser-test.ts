// Frame-contract V1 in a REAL parent/iframe pair: a disposable sequencer, two
// throwaway host origins, and an actual browser doing the handshake. The
// policy half is tools/portos-frame-test.ts; what only a browser can prove is
// here — window/origin/nonce/version rejection, the keyboard and touch action,
// preference application, reconnection, and that none of it writes a world.
//
//   bun tools/portos-frame-browser-test.ts
import type {Frame, Page} from 'playwright';
import {ownedWorld, launchBrowser} from './probe-harness.mjs';

/** Everything only these test pages define. Declaring it once is what keeps
 *  every page.evaluate() below readable instead of a wall of casts. */
type FrameMessage = {
  type: string; version?: number; nonce?: string;
  capabilities?: Record<string, number>; entityId?: string; route?: string;
};
declare global {
  interface Window {
    received: {origin: string; data: FrameMessage}[];
    mount(src: string): Promise<boolean>;
    post(msg: unknown): void;
    readyFor(nonce: string): {origin: string; data: FrameMessage} | null;
    navigates(): (FrameMessage & {origin: string})[];
    mountInner(msg: unknown): Promise<boolean>;
    labelTick(now: number): void;
    sent: string[];
  }
}

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A message crossing a frame boundary lands on its own schedule, so poll for
// the state it should reach. Returning false rather than throwing is the
// point: one slow expectation must not cost every result after it.
const until = async (want: () => Promise<boolean>, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await want()) return true;
    await sleep(50);
  }
  return false;
};

// The embedding host is a REAL origin, not an intercepted one: a second
// loopback port is a different origin to the browser in exactly the way a
// different machine is, and nothing here depends on route trickery.
const PARENT = `<!doctype html><html><head><meta charset="utf-8"><title>embedding host</title></head>
<body style="margin:0">
<iframe id="f" style="width:100vw;height:100vh;border:0" title="renderer"></iframe>
<script>
window.received = [];
addEventListener('message', e => { received.push({origin: e.origin, data: e.data}); });
window.rendererOrigin = new URLSearchParams(location.search).get('world') || '';
window.mount = src => new Promise(r => {
  const f = document.getElementById('f');
  f.addEventListener('load', () => r(true), {once: true});
  f.src = src;
});
window.post = msg => document.getElementById('f').contentWindow.postMessage(msg, rendererOrigin);
window.readyFor = n => received.find(m => m.data && m.data.type === 'eidoverse:ready' && m.data.nonce === n) || null;
window.navigates = () => received.filter(m => m.data && m.data.type === 'eidoverse:navigate').map(m => ({origin: m.origin, ...m.data}));
// A SAME-ORIGIN sibling frame: right origin, wrong window. The renderer's
// parent is the top document, so this must be heard by nobody.
window.mountInner = msg => new Promise(r => {
  const i = document.createElement('iframe');
  i.style.cssText = 'width:0;height:0;border:0';
  i.addEventListener('load', () => r(true), {once: true});
  i.src = '/inner?world=' + encodeURIComponent(rendererOrigin) + '&msg=' + encodeURIComponent(JSON.stringify(msg));
  document.body.appendChild(i);
});
</script></body></html>`;
const INNER = `<!doctype html><meta charset="utf-8"><title>inner</title><script>
const p = new URLSearchParams(location.search);
top.frames[0].postMessage(JSON.parse(p.get('msg')), p.get('world'));
</script>`;

const serveHost = () => Bun.serve({
  port: 0,
  fetch(req) {
    const body = new URL(req.url).pathname === '/inner' ? INNER : PARENT;
    return new Response(body, {headers: {'content-type': 'text/html; charset=utf-8'}});
  },
});

const host = serveHost();          // the configured, trusted embedder
const impostor = serveHost();      // byte-identical, and never trusted
const hostOrigin = `http://127.0.0.1:${host.port}`;
const impostorOrigin = `http://127.0.0.1:${impostor.port}`;

// Two sequencers: one configured to be embedded by `host`, one configured for
// nobody — the default posture every standalone deployment keeps.
const world = await ownedWorld({key: 'portos-frame', env: {EMBED_PARENT_ORIGIN: hostOrigin}});
const bare = await ownedWorld({key: 'portos-frame'});
const CLIENT = (w: {origin: string}) => `${w.origin}/?spectate&key=portos-frame&world=frames`;
// The host page is told which renderer origin to address; the impostor page
// below is the same document served from an origin nobody configured.
const embedding = (origin: string, w: {origin: string}) => `${origin}/?world=${encodeURIComponent(w.origin)}`;

let browser;
try {
  const launched = await launchBrowser({args: ['--enable-unsafe-webgpu']});
  browser = launched.browser;
  // Narrow and touch-capable: the action has to be reachable by thumb.
  const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true});
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Slow initialization: hold the configuration answer well past the load
  // event, so the host's connect necessarily arrives before the renderer can
  // possibly know who to trust. It must be held and answered, not dropped.
  let heldConfig = 0;
  await context.route(`${world.origin}/embed-config`, async (route) => {
    heldConfig++;
    await sleep(1200);
    await route.continue();
  });

  const panelIn = (frame: Frame) => frame.locator('details').filter({hasText: 'Inspect objects'});
  const frameIn = (p: Page, origin: string) => p.frames().find((fr) => fr.url().startsWith(origin));
  const renderer = () => {
    const f = frameIn(page, world.origin);
    if (!f) throw new Error('renderer frame is gone');
    return f;
  };
  const panel = () => panelIn(renderer());
  // The scene lives in the IFRAME, never in the host document. A slow boot is
  // a failed check here, not an aborted run.
  const sceneUp = async (p: Page, origin: string) => {
    const frame = frameIn(p, origin);
    if (!frame) return false;
    try { await panelIn(frame).waitFor({timeout: 60000}); return true; } catch { return false; }
  };

  console.log('\n— A. capability report —');
  const version = await (await fetch(`${world.origin}/version`)).json();
  check('GET /version advertises the three V1 capabilities',
    JSON.stringify(version.capabilities) === JSON.stringify({objectLabels: 1, portosNavigation: 1, labelPreferences: 1}),
    JSON.stringify(version.capabilities));
  const config = await (await fetch(`${world.origin}/embed-config`)).json();
  check('GET /embed-config names the configured parent origin exactly',
    config.parentOrigin === hostOrigin, JSON.stringify(config));
  const bareConfig = await (await fetch(`${bare.origin}/embed-config`)).json();
  check('an unconfigured sequencer names no embedder', bareConfig.parentOrigin === null, JSON.stringify(bareConfig));

  console.log('\n— B. the handshake, with the connect racing initialization —');
  await page.goto(embedding(hostOrigin, world));
  await page.evaluate((src) => window.mount(src), CLIENT(world));
  await page.evaluate(() => window.post({
    type: 'portos:connect', version: 1, nonce: 'session-one',
    capabilities: {portosNavigation: 1, labelPreferences: 1}, labelVisibility: 'nearby',
  }));
  await until(async () => Boolean(await page.evaluate(() => window.readyFor('session-one'))), 30000);
  const ready = await page.evaluate(() => window.readyFor('session-one'));
  check('eidoverse:ready echoes version and nonce from the renderer origin',
    ready?.origin === world.origin && ready?.data.version === 1 && ready?.data.nonce === 'session-one',
    JSON.stringify(ready));
  check('ready advertises the capabilities the build implements',
    JSON.stringify(ready?.data.capabilities) === JSON.stringify({objectLabels: 1, portosNavigation: 1, labelPreferences: 1}),
    JSON.stringify(ready?.data.capabilities));
  check('the connect really did beat the configuration fetch', heldConfig > 0, `held ${heldConfig}`);
  await context.unroute(`${world.origin}/embed-config`);

  console.log('\n— C. a scene, and the action it offers —');
  await panel().waitFor({timeout: 60000});
  await renderer().evaluate(async () => {
    const [{state, hydrate}, {entities}, {THREE, camera, scene}, {tickObjectLabels}] = await Promise.all([
      import('/lib/state.js'), import('/lib/world.js'), import('/lib/core.js'), import('/lib/objectlabels.js')]);
    camera.position.set(0, 2, 8); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const snapshot = structuredClone(state.st); snapshot.entities = {};
    const seed = {
      // A projected object: an authored plaque beside the host's own component.
      pin: {label: {name: 'Goals', visibility: 'always'}, portos: {route: '/goals/list', resource: 'goals'}},
      // Everything a component could carry that must NOT become a destination.
      url: {label: {name: 'Elsewhere', visibility: 'always'}, portos: {route: 'https://evil.example/goals/list'}},
      query: {label: {name: 'Queried', visibility: 'always'}, portos: {route: '/goals/list?steal=1'}},
      // An ordinary labeled object with no host component at all.
      plain: {label: {name: 'Bench', visibility: 'always'}},
    };
    for (const [id, comp] of Object.entries(seed)) snapshot.entities[id] = {id, lib: 'missing.glb', pos: [0, 0, 0], comp};
    hydrate(snapshot);
    let n = 0;
    for (const id of Object.keys(seed)) {
      const obj = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshBasicMaterial());
      obj.position.set((n++ - 1.5) * 0.5, 0, 0); scene.add(obj); obj.updateMatrixWorld();
      entities.set(id, obj);
    }
    tickObjectLabels(performance.now() + 1000);
    window.labelTick = tickObjectLabels;
    // Read-only means read-only: watch the wire for the rest of the run.
    const send = WebSocket.prototype.send;
    window.sent = [];
    WebSocket.prototype.send = function (data) { window.sent.push(String(data)); return send.call(this, data); };
  });
  await panel().getByText('Inspect objects', {exact: true}).click();
  const open = panel().getByRole('button', {name: 'Open in PortOS'});
  const select = (id: string) => panel().getByLabel('Choose object to inspect').selectOption(id);
  await select('pin');
  check('a projected object offers Open in PortOS', await open.count() === 1);
  for (const id of ['url', 'query', 'plain']) {
    await select(id);
    check(`"${id}" offers no action — its component names no recognized route`, await open.count() === 0);
  }

  console.log('\n— D. navigation is a user action, and says only what it may —');
  await select('pin');
  await open.focus();
  await page.keyboard.press('Enter');
  await until(async () => (await page.evaluate(() => window.navigates().length)) === 1);
  const [nav] = await page.evaluate(() => window.navigates());
  check('keyboard Enter emits eidoverse:navigate to the host origin',
    nav?.origin === world.origin && nav?.version === 1 && nav?.nonce === 'session-one'
    && nav?.entityId === 'pin' && nav?.route === '/goals/list', JSON.stringify(nav));
  check('the message carries nothing but version, nonce, entity and route',
    JSON.stringify(Object.keys(nav ?? {}).filter((k) => k !== 'origin').sort())
      === JSON.stringify(['entityId', 'nonce', 'route', 'type', 'version']), JSON.stringify(Object.keys(nav ?? {})));
  await open.tap();
  check('the same action is reachable by touch on a narrow viewport',
    await until(async () => (await page.evaluate(() => window.navigates().length)) === 2),
    String(await page.evaluate(() => window.navigates().length)));

  console.log('\n— E. preferences arrive from the host, and only from the session —');
  const preference = () => panel().getByLabel('Object labels', {exact: true}).inputValue();
  const send = (msg: Record<string, unknown>) => page.evaluate((m) => window.post(m), msg);
  // Other UI shares the `body > div > span` shape, so the plaque pool's own
  // absolute positioning is what tells its members apart from the rest.
  const plaques = () => renderer().evaluate(() => [...document.querySelectorAll<HTMLElement>('body > div > span')]
    .filter((el) => el.style.position === 'absolute' && el.style.display !== 'none').length);
  await renderer().evaluate(() => window.labelTick(performance.now() + 2000));
  check('nearby shows the authored plaques', await plaques() > 0, String(await plaques()));
  await send({type: 'portos:label-preference', version: 1, nonce: 'wrong-nonce', labelVisibility: 'off'});
  await send({type: 'portos:label-preference', version: 2, nonce: 'session-one', labelVisibility: 'off'});
  await send({type: 'portos:label-preference', version: 1, nonce: 'session-one', labelVisibility: 'everything'});
  await sleep(400);
  check('a wrong nonce, a wrong version and an unknown value all change nothing',
    await preference() === 'nearby', await preference());
  await send({type: 'portos:label-preference', version: 1, nonce: 'session-one', labelVisibility: 'all-nearby'});
  check('all-nearby maps onto the renderer\'s own all',
    await until(async () => await preference() === 'all'), await preference());
  await send({type: 'portos:label-preference', version: 1, nonce: 'session-one', labelVisibility: 'off'});
  const wentOff = await until(async () => await preference() === 'off');
  await renderer().evaluate(() => window.labelTick(performance.now() + 4000));
  check('off hides every floating plaque', wentOff && await plaques() === 0,
    `${await preference()} / ${await plaques()} plaques`);
  await select('pin');
  check('off still leaves selected-object details readable',
    /Entity: pin/.test(await panel().innerText()) && await open.count() === 1);

  console.log('\n— F. the boundary: wrong window, wrong origin, no configured host —');
  await page.evaluate(() => window.mountInner({
    type: 'portos:connect', version: 1, nonce: 'sibling-frame', capabilities: {}, labelVisibility: 'off',
  }));
  await sleep(600);
  check('a same-origin SIBLING frame is not the parent window and gets no reply',
    !await page.evaluate(() => window.readyFor('sibling-frame')));

  const impostorPage = await context.newPage();
  const impostorErrors: string[] = [];
  impostorPage.on('pageerror', (e) => impostorErrors.push(e.message));
  await impostorPage.goto(embedding(impostorOrigin, world));
  await impostorPage.evaluate((src) => window.mount(src), CLIENT(world));
  await impostorPage.evaluate(() => window.post({
    type: 'portos:connect', version: 1, nonce: 'impostor', capabilities: {}, labelVisibility: 'off',
  }));
  await sleep(2500);
  check('an untrusted origin framing the same renderer gets no reply',
    !await impostorPage.evaluate(() => window.readyFor('impostor')));
  check('and that renderer still has a working scene', await sceneUp(impostorPage, world.origin));
  await impostorPage.close();

  const barePage = await context.newPage();
  await barePage.goto(embedding(hostOrigin, bare));
  await barePage.evaluate((src) => window.mount(src), CLIENT(bare));
  await barePage.evaluate(() => window.post({
    type: 'portos:connect', version: 1, nonce: 'unconfigured', capabilities: {}, labelVisibility: 'off',
  }));
  await sleep(2500);
  check('a sequencer with no configured embedder never answers anyone',
    !await barePage.evaluate(() => window.readyFor('unconfigured')));
  check('an unembedded renderer keeps a functional scene', await sceneUp(barePage, bare.origin));
  await barePage.close();

  console.log('\n— G. reload retires the session; reconnect restores it —');
  const framesSeen = await renderer().evaluate(() => window.sent.length);
  check('nothing the bridge did put a verb or a lease on the wire',
    await renderer().evaluate(() => !window.sent.some((s) => {
      try { const m = JSON.parse(s); return m.type === 'verb' || m.type === 'lease'; } catch { return false; }
    })), `${framesSeen} frames seen`);

  check('the whole embedded run to this point raised no page error', errors.length === 0, errors.join(' | '));
  await page.evaluate((src) => window.mount(src), CLIENT(world));
  await panel().waitFor({timeout: 60000});
  await send({type: 'portos:label-preference', version: 1, nonce: 'session-one', labelVisibility: 'all-nearby'});
  await sleep(600);
  // Exactly 'off': the reload restored the browser-local preference the host
  // last set, so anything else would mean the retired nonce still moved it —
  // or that the panel never came back, which `!== 'all'` would also excuse.
  check('the reloaded renderer ignores the retired session\'s nonce',
    await preference() === 'off', await preference());
  await page.evaluate(() => window.post({
    type: 'portos:connect', version: 1, nonce: 'session-two',
    capabilities: {portosNavigation: 1, labelPreferences: 1}, labelVisibility: 'all-nearby',
  }));
  check('the reloaded renderer completes a fresh handshake',
    await until(async () => Boolean(await page.evaluate(() => window.readyFor('session-two'))), 15000));
  check('and applies the preference that connect carried',
    await until(async () => await preference() === 'all'), await preference());
  await send({type: 'portos:label-preference', version: 1, nonce: 'session-one', labelVisibility: 'off'});
  await sleep(400);
  check('the superseded nonce stays dead after the replacement',
    await preference() === 'all', await preference());

  // Discarding the iframe destroys its WebGPU device, and Chromium reports
  // that teardown as a page error belonging to the reload. Everything before
  // the remount is held to zero above; only that class is excused here.
  const teardown = /popErrorScope|GPUDevice|device is lost|WebGPU/i;
  const real = [...errors, ...impostorErrors].filter((m) => !teardown.test(m));
  check('the reload and the untrusted page raised no error of their own',
    real.length === 0, real.join(' | '));
} finally {
  await browser?.close();
  await world.close();
  await bare.close();
  host.stop(true);
  impostor.stop(true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
