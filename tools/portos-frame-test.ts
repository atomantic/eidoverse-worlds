// Frame-contract V1 policy, without a browser: what the renderer will accept
// from an embedding host and what it will say back. The live handshake, the
// DOM receiver and the use-prompt action are tools/portos-frame-dom-test.ts.
// Fork-only (docs/portos-frame.md).
import {strict as a} from 'node:assert';
import {FRAME_VERSION,FRAME_CAPABILITIES,PORTOS_COMPONENT,acceptsFrameMessage,frameRouteFor,portosAction,
  readFrameIdentityName,readFrameNonce,readFrameOrigin,readFrameRoute} from '../shared/portosframe.js';

// Capabilities are independently versioned and advertised only for what ships.
// Now: no label overlay ships (PR #168 closed), so objectLabels / labelPreferences are not claimed.
a.deepEqual(FRAME_CAPABILITIES,{portosNavigation:1,worldDeparture:1,objectInteraction:1,identityRenameRequest:1});
a.equal(Object.isFrozen(FRAME_CAPABILITIES),true);
// the current protocol refuses an unregistered bare component name: the host's component is a namespaced draft
a.equal(PORTOS_COMPONENT,'portos/link');

// Routes name a section of the host's interface. Everything that could carry a
// destination of its own — a URL, a query, an escape, a traversal — is refused.
for (const ok of ['/apps','/eidoverse','/cos/agents','/goals/list','/settings/features','/brain/memory','/a/b/c',
  // A hyphen reads the same in the first segment as in any later one.
  '/api-keys','/cos/voice-controls','/a-b/c-d/e-f'])
  a.equal(readFrameRoute(ok),ok,`route ${ok}`);
for (const bad of ['https://evil.example/apps','//evil.example/apps','/apps?x=1','/apps#x','/apps/','apps',
  '/','/../secret','/a/b/c/d','/Apps','/apps%2Fx','/apps x','/'+'a'.repeat(80),'',null,undefined,42,{route:'/apps'},
  // A hyphen JOINS runs; it never stands in for one.
  '/-','/-apps','/apps-','/a--b','/cos/-','/cos/a--b'])
  a.equal(readFrameRoute(bad as never),null,`route ${JSON.stringify(bad)}`);

// An entity carries its route in the host's own component; anything else there
// is data the fold stays blind to, and a missing component is simply no action.
// (Now: a thing's components are a flat bag, so the link is read off the bag itself.)
const link = (v: unknown) => ({[PORTOS_COMPONENT]: v});
a.equal(frameRouteFor(link({route:'/cos/health'})),'/cos/health');
a.equal(frameRouteFor(link({route:'https://evil.example'})),null);
a.equal(frameRouteFor(link({})),null);
a.equal(frameRouteFor(link(['/cos/health'])),null);
a.equal(frameRouteFor({label:'Library'}),null);
a.equal(frameRouteFor({portos:{route:'/cos/health'}}),null,'the old bare name is not read');
a.equal(frameRouteFor(null),null);

// The action a hosted visitor is offered: none without a live session; a pod
// only to the host's world launcher; any other recognized route is Open.
a.equal(portosAction(link({route:'/goals/list'}),false),null);
a.equal(portosAction(link({route:'/goals/list'}),true),'open');
a.equal(portosAction(link({route:'/eidoverse',action:'visit'}),true),'visit');
a.equal(portosAction(link({route:'/goals/list',action:'visit'}),true),null,'a pod names only the launcher');
a.equal(portosAction(link({route:'/eidoverse?x=1',action:'visit'}),true),null);
a.equal(portosAction({reactions:{ring:{kind:'play'}}},true),null);

// A nonce is compared, never parsed — but it is still bounded.
a.equal(readFrameNonce('abc123'),'abc123');
a.equal(readFrameNonce('n'.repeat(256)),'n'.repeat(256));
for (const bad of ['','x'.repeat(257),null,undefined,7,{},['a']]) a.equal(readFrameNonce(bad as never),null);

a.equal(readFrameIdentityName('  Example Visitor  '),'Example Visitor');
a.equal(readFrameIdentityName('n'.repeat(64)),'n'.repeat(64));
for (const bad of ['', ' ', 'n'.repeat(65), 'line\nbreak', null, undefined, 7, {}, ['name']])
  a.equal(readFrameIdentityName(bad as never),null,`identity ${JSON.stringify(bad)}`);

// An exact origin, refused rather than repaired: the browser compares with ===.
a.equal(readFrameOrigin('https://portos.example'),'https://portos.example');
a.equal(readFrameOrigin('http://127.0.0.1:5563'),'http://127.0.0.1:5563');
for (const bad of ['https://portos.example/','https://portos.example/embed','https://portos.example?a=1',
  'file:///etc/passwd','javascript:alert(1)','ftp://portos.example','portos.example','*','null','',null,undefined,{}])
  a.equal(readFrameOrigin(bad as never),null,`origin ${JSON.stringify(bad)}`);

// Window, origin and version together are the boundary. Each one alone is a
// claim the sender makes about itself, which is exactly what is not trusted.
const parent = {} as Window, origin = 'https://portos.example';
const event = (over: Record<string,unknown> = {}) => ({
  source: parent, origin, data: {type:'portos:connect',version:FRAME_VERSION,nonce:'n1'}, ...over,
}) as unknown as MessageEvent;
a.equal(acceptsFrameMessage(event(),{source:parent,origin}),true);
a.equal(acceptsFrameMessage(event({source:{} as Window}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({origin:'https://evil.example'}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({origin:'null'}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({data:{type:'portos:connect',version:2,nonce:'n1'}}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({data:{type:'portos:connect',nonce:'n1'}}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({data:'portos:connect'}),{source:parent,origin}),false);
a.equal(acceptsFrameMessage(event({data:null}),{source:parent,origin}),false);
// An array with a `version` property still is not a message object.
const arrayish = Object.assign([],{version:FRAME_VERSION});
a.equal(acceptsFrameMessage(event({data:arrayish}),{source:parent,origin}),false);
// No configured origin means no trusted sender, whatever the sender says.
a.equal(acceptsFrameMessage(event(),{source:parent,origin:null as unknown as string}),false);
a.equal(acceptsFrameMessage(event(),{source:null as unknown as Window,origin}),false);

console.log('frame-contract V1 policy: capabilities, preferences, routes, nonces, origins and the message boundary passed');
