# Assignment 1: voxel terrain

## Requirement map

| Requirement | Implementation / evidence |
| --- | --- |
| Different tab | Noise field and Voxel terrain navigation in `src/App.tsx` |
| Different density shapes | Sphere, box, torus, capsule, noise terrain and 3D caves in `src/utils/voxel.ts` |
| Sequential CSG | Ordered, editable union/subtract/intersect operations; order tests in `voxel.test.ts` |
| Size, performance and chunking | Adjustable resolution/chunk size, live array memory and CPU timings; experiment below |
| Meshing | Indexed marching cubes and exposed voxel faces |
| Alternative meshing techniques | Comparison below and field notes in the UI |
| Structure optimization | Bounded density buffers, spatial chunk cache, shared edge vertices, view culling and cooperative build scheduling |

## Density and sequential CSG

The solid is `d(x,y,z) < 0`; its boundary is `d = 0`. Each primitive is evaluated at `p = worldPosition − center`:

| Shape | Density function (r = size control) |
| --- | --- |
| Sphere | `length(p) − r` |
| Box | `length(max(q,0)) + min(max(q.x,q.y,q.z),0)`, where `q = abs(p) − r` |
| Torus around Y | `length(vec2(length(p.xz) − r, p.y)) − 0.35r` |
| Vertical capsule | `length(vec3(p.x, p.y − clamp(p.y,−r,r), p.z)) − r` |
| Noise terrain | `p.y − amplitude × fBm(p.x,p.z)` |
| Caves | Subtract a thin band around a 3D noise zero set from noise terrain |

For negative-inside fields, union is `min(A,B)`, intersection is `max(A,B)`, and subtraction is `max(A,−B)`. The stack is a left fold: each step changes the result of all previous steps. Union alone is commutative, but mixed operations are not. For example, `(A subtract B) union C` can refill a cavity; `(A union C) subtract B` removes anything C added inside B.

Primitives are signed distance functions. Noise fields and the final CSG result need not preserve exact Euclidean distance. Intermediate fields are clamped to a two-cell band around zero. This retains signs and bounds how far union/subtraction can influence interpolation and normals. It can affect interpolated geometry at coarse resolutions. The volume is clipped to a box one cell inside its outer boundary to give terrain a closed underside and sides. Consequently the visible volume margin changes with resolution.

## Marching cubes and borders

Each cell reads eight density samples and classifies their signs. The resulting 8-bit mask selects triangles from a 256-case table. Edge crossings are linearly interpolated at `t = dA / (dA − dB)`. A per-chunk edge map shares vertices between neighboring cells. Zero-area triangles are omitted. Normals are interpolated from central-difference density gradients.

Each chunk owns a disjoint set of cells; neighboring chunks sample the same global integer lattice at shared boundaries. One extra sample on either side provides gradient/neighbor data. A full `c³` chunk temporarily allocates `(c+3)³` Float32 samples. Shared borders reproduce both positions and normals; tests compare chunked and monolithic triangles for both mesh modes and verify matching boundary normals.

Classic marching cubes has ambiguous configurations. This implementation uses the classic table, without an asymptotic decider / MC33 topology resolver. Matching chunk samples does not imply that every possible ambiguous field is manifold. Thin features below the cell spacing can disappear. No mixed-resolution LOD boundaries are implemented. See [Paul Bourke's polygonisation reference](https://paulbourke.net/geometry/polygonise/) for the underlying method.

## Why chunking is necessary

A dense volume grows cubically: an N-cell edge requires `(N+1)³` corner samples and visits `N³` cells. Doubling N multiplies the cell count by eight.

| Cell resolution | Cells | Dense Float32 corner field |
| --- | ---: | ---: |
| 32³ | 32,768 | 140.4 KiB |
| 64³ | 262,144 | 1.05 MiB |
| 128³ | 2,097,152 | 8.19 MiB |
| 256³ | 16,777,216 | 64.75 MiB |
| 512³ | 134,217,728 | 515.01 MiB |

These figures exclude all mesh data, colors, GPU copies, JS arrays, maps and allocator overhead. A mesh can require much more memory than its scalar field. The UI intentionally caps the experiment at 64³ cells and eight CSG operations.

Chunks let us sample only one small density buffer at a time, cache unchanged meshes, and let Three.js cull off-screen chunk meshes. Local union/subtraction invalidates chunks intersecting conservative primitive bounds plus a four-cell margin for the two-cell density band, gradients, and block-center neighbors. Ordered operation signatures detect edits, disabling, removal and reordering. Intersections affect the world outside their primitive and therefore invalidate all chunks. Global settings also trigger full rebuilds.

Small chunks trade shorter rebuilds for more draw calls and duplicated sample halos. Chunking alone does **not** reduce total cell count, and sampling all chunks can cost more than one monolithic pass. All chunk meshes remain resident here; this is a finite-volume demo, not an infinite streaming world. CPU density buffers are released after each chunk, but peak process memory can include garbage not yet collected, old/new mesh arrays and temporary JS structures. The UI's **Peak density buffer** measures only the largest individual density allocation.

## Measured size experiment

One local Node run on 2026-09-17 used the default carved terrain, marching cubes, 16-cell chunk edges, and increasing resolution:

| Resolution | Chunks | Triangles | Mesh arrays (bytes) | Largest density buffer (bytes) | CPU build (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16³ | 1 | 1,672 | 40,176 | 27,436 | 16.7 |
| 32³ | 8 | 8,232 | 206,688 | 27,436 | 72.4 |
| 64³ | 64 | 36,116 | 913,392 | 27,436 | 420.2 |

Mesh arrays count positions, normals and Uint32 indices, excluding rendering colors. These are observations from one sequential run, not a hardware-independent benchmark: JIT warmup, garbage collection, field complexity and runtime affect time. Browser UI times sum CPU sampling/meshing/cache lookup work across chunks, excluding the slider debounce, inter-chunk waits, GPU upload and rendering. Reproduce counts and collect your own timings with `npm run benchmark:voxel`.

The largest single density buffer stayed constant while mesh storage and processing grew. Surface triangle counts need not grow by eight when resolution doubles; they depend on the boundary's area and complexity. To study local rebuilds, choose 64³ resolution and 8-cell chunks, use a small sphere, and move it slightly. Record rebuilt/reused counts, then compare 16- and 32-cell chunks. A very large primitive or intersection can legitimately rebuild every chunk.

## Alternative meshing techniques

| Method | Strengths | Tradeoffs | In this app |
| --- | --- | --- | --- |
| Exposed voxel faces | Simple; emits only solid-to-air faces | Block appearance; many coplanar faces | Implemented, samples cell centers |
| Greedy meshing | Merges matching coplanar faces into rectangles | Block appearance; merging must respect material/lighting boundaries | Documented |
| Marching cubes | Interpolated surfaces, supports caves/overhangs | Lookup tables, ambiguous cases, rounded sharp features | Implemented |
| Marching tetrahedra | Smaller case set using tetrahedral subdivision | Usually more triangles; subdivision may introduce directional bias | Documented |
| Dual contouring | Uses Hermite intersections/normals to retain sharp features; supports adaptive grids | More complicated vertex fitting and connectivity | Documented |

Block face culling and greedy meshing are described in [Mikola Lysenko's meshing comparison](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/). The method for preserving sharp features with Hermite data is described in [Ju et al., Dual Contouring of Hermite Data](https://www.cs.rice.edu/~jwarren/papers/dualcontour.pdf). These alternatives are distinct methods; choosing block mode does not run greedy meshing.

## Optimizations and next steps

Implemented: typed density/mesh arrays; per-chunk shared edge indices; empty-case and zero-area-triangle skipping; no meshes for empty chunks; temporary chunk-local density buffers; spatially bounded cache invalidation; GPU geometry reuse; view-frustum culling; 100 ms slider debounce; cancellable builds that yield between chunks; renderer and geometry disposal when changing workspaces.

The entire volume is still visited on full builds, and even empty chunks must be sampled before being classified. Rendering continues while idle for damped orbit controls. A large individual chunk can block the main thread until it completes. Useful extensions are worker-based meshing with transferable buffers, a frame-time work budget, sparse voxel/octree storage, streamed chunk eviction, LOD with compatible transition meshes, greedy block meshing, and a robust marching-cubes ambiguity resolver. These are proposals, not implemented features.

## Verification

Run `CI=true npm test -- --watchAll=false --runInBand` and `npm run build`. Tests cover density signs, CSG order/disable behavior, chunk partitioning, chunk-vs-monolithic mesh equivalence, winding, finite normals, seam normals, local cache validity, empty surfaces, UI operation reordering, mode switching, reset, and cancelling an obsolete build. The existing noise/erosion tests remain in the suite.
