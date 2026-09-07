// Attach to an authored light and give that entity this component:
// comp {id: "example-lamp", type: "interaction",
//       data: {action: "toggle", label: "Toggle lamp"}}
// The renderer's E/button action sends use; this behavior supplies the effect.
world.on('use', (event) => {
  if (event.entity !== world.self || event.action !== 'toggle') return;
  const light = world.entity(world.self);
  if (!light) return;
  const on = !(world.kv.get('on') ?? true);
  world.emit('light', {
    id: world.self, pos: light.pos,
    color: world.knobs.color ?? '#ffe0a0',
    intensity: on ? (world.knobs.intensity ?? 2) : 0,
    range: world.knobs.range ?? 8,
  });
  world.kv.set('on', on);
});
