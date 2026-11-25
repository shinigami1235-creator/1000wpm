# Faceted avatar creator (archived 25 Nov 2026)

This is the 3D avatar creator Stormtyper used before the operator models replaced it. It's kept here, out of the site, so it can go into another project: a game character creator, a clinic face preview, or anything else that needs a customisable 3D head. Nothing on the site loads these files any more.

The last commit where it ran inside the site is `da294b5`, kept as the branch `avatar-creator-final` on GitHub. Check that branch out and open `#/profile/avatar` to see it working.

## What it does

- A smooth 3D head and bust from the MakeHuman base mesh, turned by dragging.
- Face sliders on morph targets: face shape, forehead, cheekbones, jaw (narrower at the back for men), chin, eyes, nose, lips with separate upper and lower lip, and presets.
- Rule-based brows placed from facial landmarks, with guides you can drag (the brows-and-hairline rules).
- A sculpt tool: click a point and push or pull it, with a "fix point" lock, mirror and brush size.
- Undo, redo and reset per tab.
- Skin tones, eye colour with a brightness setting, makeup painted into the face texture (shadow, liner, lips, blush).
- Hairstyles as alpha cards with a scalp layer, outfits and jewellery from MakeHuman clothes, each loaded only when worn.
- Prices and try-on for the shop, and a seeded generator that makes a look from a name for simulated players.

## Files

| Folder | What's in it |
|---|---|
| `js/avatar-creator.js` | The editor page: tabs, sliders, option grids, sculpt and brow tools, undo |
| `js/avatar3d.js` | The three.js renderer, morphs, face texture and thumbnails (ES module) |
| `js/avatar-data.js` | The catalogue: sliders, skin tones, eyes, brows, makeup, hair, outfits, prices, the name-seeded generator |
| `js/avatar-face.js`, `avatar-makeup.js`, `avatar-hair.js`, `avatar-cloth.js`, `avatar-brows.js`, `avatar-sculpt.js` | Skin and eye shaders, makeup layers, hair, clothes, brows and sculpt points |
| `assets/avatar/` | `avatar.glb` (head, morphs, landmarks), `items/` (one file per hairstyle, outfit and accessory), `tex/` (textures), `LICENSES.md` |
| `tools/` | The Blender (`bpy`) and Node scripts that build `assets/avatar` from MakeHuman sources |
| `css/avatar.css` | The creator's styles, copied from the site |

## Putting it in another project

1. Copy `js/`, `assets/` and `css/` into the project, keeping `js/` and `assets/` side by side, since `avatar3d.js` loads `../assets/avatar/`.
2. Add an import map for `three` and `three/addons/` (three.js r170 was used).
3. Give it the small site helpers it calls, or swap them for the project's own: `UI.esc`, `UI.fmt`, `UI.coin`, `UI.icon`, `TT.click` (a key sound), `Theme.hex` and `Theme.num` (colours), and `WPM.coins`, `WPM.owns`, `WPM.buy`, `WPM.on`, `WPM.levelInfo`, `WPM.setProfile` (coins, owned items and the saved look). A project with no shop can make every part free in `avatar-data.js`.
4. Load `avatar-data.js` first, then mount `AvatarCreator.mount(element)`.

## Rebuilding the assets

`tools/build_assets.py` runs with Blender's Python (`bpy`) on a head made by `tools/build_head.py`, then `node tools/pack_all.mjs assets/avatar` compresses the GLBs. MakeHuman sources come from MPFB 2 and the MakeHuman asset packs. `assets/avatar/LICENSES.md` lists every source and licence. Most are CC0, and a few Sketchfab hairstyles need credit, so keep that file with the assets wherever they go.
