// Scratch-only session used by the owned-process guest-entry integration test.
import { hnSessions } from '../../server/auth.ts';
hnSessions.set('a'.repeat(64), {
  sub: 'human:example:owner', name: 'ExampleOwner',
  scopes: ['worlds:join'], exp: Date.now() + 600_000,
});
