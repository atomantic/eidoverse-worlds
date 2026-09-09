/** A primary use affordance, independent of label visibility and host URLs. */
export function interactionAction(entity, hosted = false) {
  const comp = entity?.comp;
  if (hosted && comp?.portos?.action === 'visit' && comp.portos.route === '/eidoverse') {
    const name = typeof comp.label?.name === 'string' ? comp.label.name.slice(0, 80) : 'Teleport pod';
    return { travel: true, label: `${name} · Teleport as guest` };
  }
  const declared = comp?.interaction;
  const reactions = comp?.reactions;
  const keys = reactions && typeof reactions === 'object' ? Object.keys(reactions) : [];
  const action = declared?.action ?? (keys.length === 1 ? keys[0] : null);
  if (typeof action !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(action)) return null;
  const label = typeof declared?.label === 'string' && declared.label.trim()
    ? declared.label.trim().slice(0, 100) : action;
  return { action, label, travel: false };
}
