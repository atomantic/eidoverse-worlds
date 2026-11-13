# Large landscape meshes (PortOS fork)

The runtime advertises `largeWorldColliders: 1` among the frame bridge's
`/version` capabilities (the frame bridge override, docs/FORK.md). Hosts can
use this to gate kilometre-scale authored landscape assets for older
installations.

Collider footprints above 4,096 grid cells are indexed once in an oversized
set (`client/lib/colliders.js`). Walking, radius, and camera queries still test
their existing exact BVHs; removal, movement, and reset retire the same index
entry. Small objects continue using the local spatial grid. This avoids
allocating millions of cell buckets for a single ocean/island mesh. Upstream
refuses such a footprint outright (its guard against a misread scale OOMing
the process); the fork refuses only a footprint that isn't finite, since an
oversized entry costs one Set entry, never a cell loop.

The fallback SkyMesh spans ten kilometres and follows the camera, so walking
beyond the original town footprint never exposes the outside of the sky cube;
its corners stay inside the camera's 20 km far plane. This supports bounded
authored scenery; it does not add terrain streaming. Verify collision behavior
with `bun tools/collider-test.ts`.
