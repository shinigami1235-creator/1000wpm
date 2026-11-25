# Avatar assets: sources and licences

`avatar.glb` holds the smooth head and bust (with UVs), the eyes, the slider morph targets (two per slider, plus the always-on `base+` shape), the lashes, and in its meta the landmarks, presets and styles the site builds the brows from. Each hairstyle, facial hair, outfit and accessory is its own file in `items/`, loaded the first time someone wears it. `tex/` holds every texture.

## MakeHuman base mesh and targets (CC0 1.0)

- Base mesh `hm08` (`src/mpfb/data/3dobjs/base.obj`, including its UV layout) and the `.target` files under `src/mpfb/data/targets/` (head, chin, cheek, eyebrows, eyes, nose, mouth, ears, neck and the macro gender targets).
- Source: MPFB 2 by the MakeHuman Community, https://github.com/makehumancommunity/mpfb2, commit `9de0707` (12 Nov 2026).
- Licence: CC0 1.0 Universal. The repository's `LICENSE.ASSETS.md` and the header of `base.obj` state that the base mesh, targets and proxies were released as CC0 in September 2020 by Data Collection AB, Joel Palmius and Jonas Hauquier.
- The head was cut from the base mesh, its eyelids, nose and lips subdivided once, and its UV islands repacked so the face gets most of the texture.

## Face (CC0 1.0)

The skin, eyes and lashes come from MakeHuman assets released as CC0, built by `tools/avatar/face_src.py` (proxies read by `tools/avatar/mhclo.py`). The MakeHuman system assets carry the same CC0 notice as the base mesh (Data Collection AB, Joel Palmius and Jonas Hauquier, September 2020); the community packs list `"license": "CC0"` for every asset in their `packs/*.json`. Sources, from the MakeHuman asset downloads (makehumancommunity.org):

- Skins, baked from the hm08 UVs into the head's UV layout and tinted between for the ten skin tones (`tex/skin_light.webp`, `skin_medium.webp`, `skin_dark.webp`):
  - light: system asset `skins/young_caucasian_female2` (`young_lightskinned_female_diffuse2.png`);
  - medium: `skins01` pack, `callharvey3d_midtoned_female` by callharvey3d;
  - dark: system asset `skins/young_african_female` (`young_darkskinned_female_diffuse.png`).
- Pores and roughness detail (`tex/skin_nrm.webp`, the G channel of `tex/skin_orm.webp`): the fine detail (blurred copy subtracted) of the normal and specular maps of `skins02` pack, `mindfront_skin_male_african_middleage` by Mindfront. The T-zone, lips and ambient occlusion in `skin_orm.webp` are generated.
- Eyes: system asset `eyes/high-poly` (eyeball and cornea mesh, `.mhclo` fitted to the head). One eye texture for every colour (`tex/eye_iris.webp`) in a polar layout: the sclera resampled from system `eyes/materials/blue_eye`, the grey iris fibres high-passed from `grey_eye` with generated radial streaks and collarette. The eye shader colours the fibres and draws the pupil and limbal ring.
- Brows: no third-party assets. `js/app/avatar-brows.js` lays the brow cards on the head by rule, and `tools/avatar/brows.py` paints the hairs in `tex/brow_atlas.webp`.
- Lashes: system assets `eyelashes/eyelashes01` (shortened, for men) and `eyelashes02` (cards and textures, in `tex/eye_lash.webp`).
- Face shape: the always-on base shape, the lip shape sliders (`lipU`, `lipL`, `lipBow`, `lipCorner`) and the rest of the face sliders are MakeHuman `.target` files from MPFB 2 (see above), listed in `tools/avatar/morphs.py`.

## Hair

Every hairstyle in `items/hair-*.glb` (with its texture `tex/hair-*.webp`) is built by `tools/avatar/hair_build.py` from the sources below. Changes made to all of them: fitted to our head (MakeHuman hair through its `.mhclo` binding, Sketchfab hair warped from the head or cap it was made on), pushed clear of the skin, ears and clothes, cut at the bust line, given a scalp layer, baked occlusion and shading normals, and the texture turned into grey strand detail that the chosen hair colour tints. Some are trimmed, flattened or given extra volume, as noted.

CC0 1.0 (MakeHuman system assets carry the CC0 notice of Data Collection AB, Joel Palmius and Jonas Hauquier, September 2020; community packs list `"license": "CC0"` in `packs/*.json`):

- Buzz: the scalp layer alone; its small texture is resized from system asset `hair/short01`.
- Slicked back: system asset `hair/short04`.
- Long straight: system asset `hair/long01`, with more volume at the crown.
- Ponytail: system asset `hair/ponytail01`.
- Bob: `toigo_blunt_bob` by MargaretToigo, http://www.makehumancommunity.org/node/1669.
- Bun: `rehmanpolanski_hair_bun_brown` by RehmanPolanski, http://www.makehumancommunity.org/node/2477.

CC BY (credit required), all by Elvaerwyn from the MakeHuman community `hair02` pack:

- Wavy bob: "elvs_wavy_bob", http://www.makehumancommunity.org/node/1551.
- Curtain bangs: "elvs_short_daisy_hair", http://www.makehumancommunity.org/node/1860.
- Long layered: "elvs_daisy_hair", http://www.makehumancommunity.org/node/1859.
- Long wavy: "elvs_adrienne_hair", http://www.makehumancommunity.org/node/1862, its long side mirrored so it falls on both sides.
- Wavy ends: "elvs_that_80s_babe_hair", http://www.makehumancommunity.org/node/2174.
- Braids: "elvs_braided_rows", http://www.makehumancommunity.org/node/1659.
- Updo: "elvs_50s_updo", http://www.makehumancommunity.org/node/2001.
- Long, half up: "elvs_keylth_hair", http://www.makehumancommunity.org/node/2173.

CC BY 4.0 (credit required), from Sketchfab, converted by `tools/avatar/hair_sketchfab.py`:

- Textured crop, Messy, Side swept, Undercut and the hood's short fringe: "FREE Male Fashion Hair collection 01 lowpoly" by VincentFreelance, https://sketchfab.com/models/2735370f6f764078a18f5d80651050a2. Four of its fourteen hairstyles (textured crop, messy, swept-up side, quiff), each cut out of the collection, decimated, warped onto our head, given strand UVs and a generated strand texture (the model has none), with our men's hairline and clipper sides as scalp layers. The hood keeps only the crop's fringe, pressed flat.
- Mohawk: "Male Fashion Hair collection 08 lowpoly haircard" by VincentFreelance, https://sketchfab.com/models/a60076ccce524d30867ac88fe994870c. Its mohawk crest, made taller, with our clipper sides.
- Afro: "Black Short Curl Hairs 06" by MotionStudioArts, https://sketchfab.com/models/0f77a56bc72a404abba7914af3ab6c0e. About a quarter of its curls kept, each moved whole into a round dome, none over the ears or face; its curl texture resized.
- Curly: "Curly Hair 1 (Beatrice) - Character Hair (Free)" by continuumreed, https://sketchfab.com/models/89ed2c07a0d9418d9d6b231bedf2772a. Fitted through its hair cap, 70% of its curl cards kept, texture resized.

The generated textures (`tex/hair-scalp.webp` and the strand texture of the VincentFreelance styles) come from `hair_build.py`.


## Clothing

Every outfit in `items/fit-*.glb` and every piece of jewellery and glasses in `items/acc-*.glb` is built by `tools/avatar/cloth_build.py` from the MakeHuman clothes below, with textures in `tex/cloth_*.webp`. Changes made to all of them: fitted to our body through the MakeHuman `.mhclo` binding, cut at the bust line, subdivided once, pushed clear of the skin and of the layer under them, given baked occlusion, and their textures cut to the part of the atlas the bust uses, with the colour taken out so the outfit colour tints them. The stripes, the open shirt front, the hoodie's cords, the shoulder plates, the chain links, the pendant, the choker, the studs and the tiling fabric normals (`tex/cloth_detail_*.webp`) are generated by the build.

CC0 1.0 (MakeHuman system assets carry the CC0 notice of Data Collection AB, Joel Palmius and Jonas Hauquier, September 2020; community packs list `"license": "CC0"` in `packs/*.json`):

- Tee (also the tee under the open shirt, the leather jacket and the shoulder plates): the T-shirt of system asset `clothes/male_casualsuit06`, its normal and occlusion maps; the logo in its colour map is not used.
- Open shirt over a tee: the shirt of system asset `clothes/male_casualsuit03` and its normal map, split down the front and opened; the stripes in its colour map are not used.
- Leather jacket: the jacket of system asset `clothes/male_casualsuit05` and its normal map, with a generated leather grain.
- Tank top: "toigo_camisole_top" by MargaretToigo, http://www.makehumancommunity.org/node/1726 (shape only; its print is not used).
- Polo shirt: "namuhekam_male_polo_shirt" by namuhekam, http://www.makehumancommunity.org/node/2909 (colour, normal and roughness maps).
- Sweater: "toigo_fisherman_sweater" by MargaretToigo, http://www.makehumancommunity.org/node/1187.
- Chain and pendant necklaces: their path round the neck follows "toigo_pearl_necklace" by MargaretToigo, http://www.makehumancommunity.org/node/1028.
- Hoop earrings: "ews_hoop_earrings" by EWS, http://www.makehumancommunity.org/node/1242, made smaller.
- Stud earrings: placed where "toigo_pearl_earrings" by MargaretToigo sits, http://www.makehumancommunity.org/node/1029.
- Rectangle glasses: "kwnet_at_optical_glasses" by kwnet_at, http://www.makehumancommunity.org/node/928.
- Round glasses: "toigo_round_glasses_leopard" by MargaretToigo, http://www.makehumancommunity.org/node/1070, in gold instead of its leopard print.

CC BY (credit required), from the MakeHuman community `shirts02` pack:

- Hoodie: "elvs_hooded_sweat_jacket1" by Elvaerwyn, http://www.makehumancommunity.org/node/1450, CC BY. The hood lying behind the neck is hidden when the Hood up hairstyle is on.
- High collar: "Knitted_Sweater_01" (`mindfront_knitted_sweater_01`) by Mindfront, http://www.makehumancommunity.org/node/660, CC BY 4.0.

## Made for this site

Everything else is original work generated by the scripts in `tools/avatar/` for 10000WPM, with no third-party art in it:

- the makeup masks and the facial hair masks (`fh_masks.webp`, painted from a map of 3D positions on the head), the beard fringe strands (`fh_strands.webp`), the lash line, lid crease, lip shading, scalp and neck clean-up added to the skins, the eyeball lid shadow, the beard strand texture and the knit, weave and leather fabrics;
- facial hair and the cyber gear (visor, goggles, respirator, headset, cyber eye, cap and bandana); hairstyles: see Hair; outfits, jewellery and glasses: see Clothing.

The MakeHuman face assets used are listed under Face; the packs were unzipped to `/home/claude/mhpacks` for the build.

## Code

- three.js 0.170.0 and its `GLTFLoader`, `LineSegments2`, `RoomEnvironment` and `meshopt_decoder.module.js` load from the jsDelivr CDN through the import map. MIT licence.
- The GLB files are packed with EXT_meshopt_compression and KHR_mesh_quantization using the meshoptimizer encoder 1.3.0 (MIT, Arseny Kapoulkine) at build time only.

## Rebuilding

The scripts in `tools/avatar/` run with Python 3, numpy, Pillow and Blender 5.3 as the `bpy` module, plus Node for the packing step. They expect an MPFB 2 checkout at `/home/claude/mh/mpfb2`; change `MH` in `mhlib.py` to point somewhere else.

1. `python3 macro.py` mixes the gender macro targets into the neutral, male and female meshes (with the eyes opened a little).
2. `python3 build_head.py out/head` cuts the head and bust, subdivides the eyelids, nose and lips and repacks the UVs (about 23,700 triangles). `head.npz` keeps the hm08 UVs too (`uv_mh`), for baking MakeHuman textures across.
3. `python3 build_assets.py out/head.npz assets/avatar` builds the textures, the morph targets and every part. Add a comma list (`base`, `tex`, `items` or item ids) to rebuild only those.
4. `node pack_all.mjs assets/avatar` compresses every `*.glb.raw` into its `.glb`, after `npm install meshoptimizer@1.3.0` next to the script.
5. `python3 hair_build.py out/head.npz neu.npy assets/avatar` builds every hairstyle (add a comma list of ids to rebuild some), then pack again. It reads the MakeHuman hair packs from `/home/claude/mhpacks` (`MH_PACKS`). `build_assets.py` skips the `hair-*` items: the shells in `parts_hair.py` are only what `parts_gear.py` sizes the hats to. The Sketchfab styles read `.npz` files made by `hair_sketchfab.py` from the GLBs exported out of Blender (`SF_HAIR`, default `/home/claude/hairwork/sf2/src`): `hair_sketchfab.py slot vf_male_coll01.glb c01_N.npz vf01 N` for N = 1, 2, 3 and 11, `slot vf_male_coll08.glb c08_0.npz vf08 0`, `single msa_black_short_curl06.glb afro_msa.npz` and `single curly_beatrice_continuumreed.glb curly_bea.npz`.
6. `python3 cloth_build.py out/head.npz neu.npy assets/avatar` builds every outfit, jewellery piece and pair of glasses (add a comma list of ids such as `fit-polo,acc-chain` to rebuild some, or `acc` for all jewellery), then pack again. It reads the MakeHuman clothes packs from `/home/claude/mhpacks` (`MH_PACKS`). `build_assets.py` makes no outfits or jewellery any more, so it never overwrites these.
