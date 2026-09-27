// Original procedural illustration. Separate from humanoid avatar/puppet/force registries.
import { THREE, scene } from './core.js';
import { bus } from './base.js';
const bodies = new Map();
let patch = null;
function dispose(root) {
  root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  scene.remove(root);
}
function ellipsoid(root, color, size, position) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  mesh.scale.set(...size); mesh.position.set(...position); root.add(mesh); return mesh;
}
function makeFly() {
  const root = new THREE.Group();
  root.name = 'Managed fly illustration (engineered; nonhumanoid)';
  ellipsoid(root, 0x665149, [0.055, 0.045, 0.1], [0, 0, 0]);
  ellipsoid(root, 0x433833, [0.045, 0.04, 0.04], [0, 0.01, 0.1]);
  for (const side of [-1, 1]) {
    ellipsoid(root, 0xbb3344, [0.022, 0.028, 0.022], [side * 0.032, 0.025, 0.12]);
    ellipsoid(root, 0xcbdcd8, [0.08, 0.005, 0.065], [side * 0.075, 0.03, -0.01]);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), new THREE.MeshStandardMaterial({ color: 0x44352d }));
      leg.position.set(side * 0.05, -0.035, (i - 1) * 0.05); leg.rotation.z = side * 0.8; root.add(leg);
    }
  }
  scene.add(root); return root;
}
bus.on('managed-flies', packet => {
  if (packet.version !== 1 || !Array.isArray(packet.visitors)) return;
  const alive = new Set();
  for (const visitor of packet.visitors) {
    if (visitor.body !== 'fly-v1' || !visitor.pose || !Object.values(visitor.pose).every(Number.isFinite)) continue;
    alive.add(visitor.sessionId);
    let root = bodies.get(visitor.sessionId);
    if (!root) { root = makeFly(); bodies.set(visitor.sessionId, root); }
    root.userData.expiresAt = visitor.expiresAt;
    root.name = `Managed fly ${visitor.individualId} (${visitor.status}; procedural illustration)`;
    root.position.set(visitor.pose.x, 0.3, visitor.pose.z); root.rotation.y = visitor.pose.yaw;
  }
  for (const [id, root] of bodies) if (!alive.has(id)) { dispose(root); bodies.delete(id); }
  if (alive.size && !patch) {
    patch = new THREE.Group(); patch.name = 'Gentle managed visitor patch (engineered spatial proxy)';
    for (const flower of packet.patch?.flowers ?? []) {
      const color = new THREE.Color(...flower.rgb.map(c => c / 255));
      ellipsoid(patch, color, [0.14, 0.035, 0.14], [flower.x, 0.21, flower.z]);
      ellipsoid(patch, 0x618449, [0.025, 0.1, 0.025], [flower.x, 0.1, flower.z]);
    }
    scene.add(patch);
  }
  if (!alive.size && patch) { dispose(patch); patch = null; }
});
bus.on('net', state => {
  if (state.status === 'live') return;
  for (const root of bodies.values()) dispose(root);
  bodies.clear(); if (patch) { dispose(patch); patch = null; }
});

// Runs on the existing render scheduler, never a separate timer/physics owner.
export function updateManagedFlies(time = Date.now()) {
  for (const [id, root] of bodies) if (!Number.isSafeInteger(root.userData.expiresAt) || time >= root.userData.expiresAt) {
    dispose(root); bodies.delete(id);
  }
  if (!bodies.size && patch) { dispose(patch); patch = null; }
}
