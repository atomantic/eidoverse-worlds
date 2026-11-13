// portos-rename-test.ts — /name under a PortOS host (fork-only, docs/portos-frame.md identityRenameRequest), through the
// REAL /name handler (commands/handlers.js, commands/registry.js). The frame bridge is a controllable stand-in; every
// other client module the handler imports is a no-op stub derived from its import list. shared/ is real.
//   BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun tools/portos-rename-test.ts
import { strict as assert } from 'node:assert';
import { mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const base = resolve(import.meta.dir, '../client/lib') + sep;
const REAL = new Set(['commands/handlers.js', 'commands/registry.js']);
const chat: string[] = [];
const staged: string[] = [];
const host = { session: false, renames: false };
const CONFIG: any = { name: 'resident', guest: false };
const overrides: Record<string, Record<string, unknown>> = {
  'base.js': { CONFIG, bus: { on() {}, emit() {} }, report() {} },
  'chat.js': { logChat: (_who: string, s: string) => { chat.push(String(s)); } },
  'portosframe.js': {
    portosSession: () => host.session,
    requestIdentityRename: (n: string) => { if (!host.session || !host.renames) return false; staged.push(n); return true; },
  },
};
const wanted = new Map<string, Set<string>>();
for (const file of REAL) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const src = readFileSync(base + file, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*'(\.\.?\/[\w./]+\.js)'/g)) {
    const abs = resolve(base, dir, m[4]);
    if (!abs.startsWith(base)) continue;   // shared/: real
    const target = relative(base, abs).split(sep).join('/');
    const names = wanted.get(target) ?? new Set<string>();
    for (const part of (m[2] ?? '').split(',')) { const n = part.trim().split(/\s+as\s+/)[0]; if (n) names.add(n); }
    if (m[1]) names.add('default');
    wanted.set(target, names);
  }
}
for (const [file, names] of wanted) {
  if (REAL.has(file)) continue;
  const exports: Record<string, unknown> = {};
  for (const n of names) exports[n] = () => undefined;
  Object.assign(exports, overrides[file] ?? {});
  mock.module(resolve(base, file), () => exports);
}
await import('../client/lib/commands/handlers.js');
const { dispatch, COMMANDS } = await import('../client/lib/commands/registry.js');
const last = () => chat.at(-1) ?? '';

// standalone: the current protocol's own answer, nothing crosses a frame
dispatch('rename', 'Example');
assert.match(last(), /isn't supported yet/);
assert.deepEqual(staged, []);

// hosted, the host advertises renames: a bounded draft is staged
host.session = true; host.renames = true;
dispatch('rename', '  Example Visitor  ');
assert.deepEqual(staged, ['Example Visitor']);
assert.match(last(), /staged in World Design/);
dispatch('rename', 'x'.repeat(65));
assert.match(last(), /usage: \/name/, 'an oversized name never crosses');
dispatch('rename', 'line\nbreak');
assert.match(last(), /usage: \/name/, 'a control character never crosses');
assert.equal(staged.length, 1);

// hosted, the host doesn't take renames: says so, sends nothing
host.renames = false;
dispatch('rename', 'Example Two');
assert.match(last(), /cannot change your identity/);
assert.equal(staged.length, 1);

// a guest visit with no host session keeps the name it was admitted with
host.session = false; CONFIG.guest = true;
dispatch('rename', 'Example Three');
assert.match(last(), /guest visit keeps the name/);
assert.equal(staged.length, 1);

assert.match(COMMANDS.find((c: any) => c.name === 'name').help, /PortOS host/);
console.log('/name: standalone, hosted staging, bounds, unsupported host and guest visit passed');
process.exit(0);
