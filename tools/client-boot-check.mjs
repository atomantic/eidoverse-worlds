// Walk the client module graph the way the BROWSER does (client/ is the web
// root, so ../../shared/x.js from client/lib/realize/ is /shared/x.js) and
// parse every module. Catches duplicate top-level bindings — the break a bad
// merge makes that no unit test sees, because nothing imports main.js.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
const ROOT = process.cwd(), WEB = resolve(ROOT, 'client');
const seen = new Set(); let bad = 0, n = 0;
function resolveSpec(spec, fromFile) {
  if (!spec.startsWith('.')) return null;                  // bare: node_modules
  let p = resolve(dirname(fromFile), spec);
  if (!existsSync(p)) {                                    // browser: client/ is /
    const asWebRoot = resolve(WEB, relative(WEB, p).replace(/^(\.\.\/)+/, ''));
    if (existsSync(asWebRoot)) p = asWebRoot;
    else { const alt = resolve(ROOT, relative(WEB, p).replace(/^(\.\.\/)+/, '')); if (existsSync(alt)) p = alt; }
  }
  return existsSync(p) ? p : null;
}
function walk(file) {
  if (seen.has(file)) return; seen.add(file); n++;
  const src = readFileSync(file, 'utf8');
  const bindings = new Map();
  const flat = src.replace(/import\s*\{[^}]*\}\s*from/gs, m => m.replace(/\n/g, ' '));
  let lineNo = 0;
  for (const raw of flat.split('\n')) {
    lineNo++;
    const im = raw.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/);
    const names = [];
    if (im) {
      const br = im[1].match(/\{([^}]*)\}/);
      if (br) for (const t of br[1].split(',').map(s => s.trim()).filter(Boolean))
        names.push(t.includes(' as ') ? t.split(/\s+as\s+/)[1].trim() : t);
      const def = im[1].replace(/\{[^}]*\}/, '').replace(/(^\s*,)|(,\s*$)/g, '').trim();
      if (def && !def.startsWith('*')) names.push(def);
      const ns = im[1].match(/\*\s+as\s+(\w+)/); if (ns) names.push(ns[1]);
      const dep = resolveSpec(im[2], file);
      if (dep && /\.(js|ts|mjs)$/.test(dep)) walk(dep);
    } else {
      const d = raw.match(/^(?:export\s+)?(?:const|let|var|function\*?|class)\s+(\w+)/);
      if (d) names.push(d[1]);
    }
    for (const name of names) {
      if (bindings.has(name)) {
        console.log(`${relative(ROOT, file)}: duplicate '${name}' (also line ${bindings.get(name)})`);
        bad++;
      } else bindings.set(name, lineNo);
    }
  }
}
walk(resolve(ROOT, process.argv[2] ?? 'client/main.js'));
console.log(bad ? `\n${bad} duplicate binding(s) across ${n} modules` : `clean: ${n} client modules, no duplicate top-level bindings`);
process.exit(bad ? 1 : 0);
