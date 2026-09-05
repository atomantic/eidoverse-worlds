# Large landscape meshes

The runtime advertises `largeWorldColliders: 1` from `/version`. Hosts can use
this to gate kilometre-scale authored landscape assets for older installations.

Collider footprints above 4,096 grid cells are indexed once in an oversized
set. Walking, radius, and camera queries still test their existing exact BVHs;
removal, movement, and reset retire the same index entry. Small objects continue
using the local spatial grid. This avoids allocating millions of cell buckets
for a single ocean/island mesh.

The fallback SkyMesh spans ten kilometres and follows the camera, so walking
beyond the original town footprint never exposes the outside of the sky cube.
This supports bounded authored scenery; it does not add terrain streaming or
swimming physics. Verify collision behavior with `bun tools/collider-test.ts`.
