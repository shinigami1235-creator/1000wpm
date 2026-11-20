# Avatar assets: sources and licences

`avatar.glb` holds the faceted head and bust, its 42 morph targets (the face sliders) and every hair, facial hair, gear and outfit part. It was built from the MakeHuman base mesh and targets, then cut, reduced and reshaped for this site.

## MakeHuman base mesh and targets (CC0 1.0)

- Base mesh `hm08` (`src/mpfb/data/3dobjs/base.obj`) and the `.target` files under `src/mpfb/data/targets/` (head, chin, cheek, eyebrows, eyes, nose, mouth, ears, neck and the macro gender targets).
- Source: MPFB 2 by the MakeHuman Community, https://github.com/makehumancommunity/mpfb2, commit `9de0707` (12 Nov 2026).
- Licence: CC0 1.0 Universal. The repository's `LICENSE.ASSETS.md` and the header of `base.obj` state that the base mesh, targets and proxies were released as CC0 in September 2020 by Data Collection AB, Joel Palmius and Jonas Hauquier.
- The rig weight groups (`weights.default.json`, also CC0) were read to place parts and are not shipped.

## Made for this site

The low-poly head, the caps over the cuts, the brows, lashes, glow lines and every prop (hair, facial hair, gear, outfits) were built for 10000WPM by the scripts in `tools/avatar/`. They are original work with no third-party assets in them.

## Code

- three.js 0.170.0 and its `GLTFLoader`, `LineSegments2` and `meshopt_decoder.module.js` load from the jsDelivr CDN through the import map. MIT licence.
- `avatar.glb` is packed with EXT_meshopt_compression using the meshoptimizer encoder 1.3.0 (MIT, Arseny Kapoulkine) at build time only.

## Rebuilding

The scripts in `tools/avatar/` run with Python 3, numpy and Blender 5.3 as the `bpy` module, plus Node for the packing step. They expect an MPFB 2 checkout at `/home/claude/mh/mpfb2`; change `MH` in `mhlib.py` to point somewhere else.

1. `python3 macro.py` mixes the gender macro targets into the neutral, male and female meshes.
2. `python3 build_head.py out/head 0.22` cuts and reduces the head (about 2,100 triangles).
3. `python3 build_assets.py out/head.npz out/avatar.glb` adds the morph targets, lines and props.
4. `node meshopt_pack.mjs out/avatar.glb assets/avatar/avatar.glb` compresses it after `npm install meshoptimizer@1.3.0`.
