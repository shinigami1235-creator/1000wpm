# Models

Every place in the game where a 3D model goes. Each slot already has a code-built stand-in, so the game is complete without the models. A generated model replaces its stand-in by dropping a file at the path below and switching the slot on in code. Laid out on 25 Nov 2026, before any of the models are made.

## Rules for every model

- **Format:** GLB, Y up, metres, facing +Z, origin on the floor under the centre of the model.
- **Textures:** baked into the GLB, 2048 px at most (1024 for anything that shows small), WebP where the exporter allows it.
- **Size on the page:** the full model for what the player looks at, plus a `-lite` copy at about a third of the triangles for crowds. The male operator is 868 KB full and 373 KB lite; aim for that.
- **Checks before a model goes in:** joint-check on every pose (elbows forward, knees back, feet on the floor), matched before-and-after screenshots at 1440 px and 390 px, and the fight's frame time against the stand-in.

## Operators (js/app/operator3d.js)

One skeleton for both bodies, with Mixamo-style bone names: Hips, Spine, Spine1, Spine2, Neck, Head, Left/Right Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot. Bodies come in A-pose and get rigged with the pipeline in `/home/claude/opmodel/work` (proxy auto-weights, then fixglb.py). The animations stay in code (idle, walk, typing, victory, defeat, cast, hit), so a new body needs no new clips.

| Slot | File | Height | Stand-in now | Shows in |
|---|---|---|---|---|
| Male body (headless, cut at the neck) | `assets/operators/male.glb`, `male-lite.glb` | 1.80 m | the generated male body from 24 Nov, with head | World Boss, duels, party, Operator page |
| Female body | `assets/operators/female.glb`, `female-lite.glb` | 1.72 m | code-built female base | same |
| Heads | `assets/operators/heads/<id>.glb` | fits the Neck bone | the body's own head | same |
| Hair | `assets/operators/hair/<id>.glb` | on the Head bone | code-built short and shag | same; hidden under headgear |

### Editors that work on any generated body

These change the model without bending or stretching it, so a new body gets them for free once its mask is painted (`tools/avatar/operator-masks.py`, run with Blender's bpy: R skin, G eyes, B outfit, saved as `assets/operators/<base>-mask.png`).

- **Outfit tint:** a colour and a strength up to 60%, laid over the outfit while keeping the texture's light and shade. Skin is left alone.
- **Glow:** the cyan glowing details (shirt print, wrist screen, visor) take the Glow colour, the theme colour by default.
- **Height** ±4% and **Build** ±6% across the chest and shoulders.
- **Shop gear** that isn't part of the outfit (the face mask) sits on the model's Head bone (`MODEL_FIT` in operator3d.js).

**Eye colour and skin tone** wait for the separate heads. The male body's texture gives the whole face about 50 px, so an eye is 2 or 3 px and a tint there would smear across the lids. A head generated on its own, with its own 1024 px texture, has eyes big enough to mask, and each head carries its own skin tone. Eye glow (cyber implants) comes with the same heads.

### Gear (bought in the shop, worn on bones)

Each piece is a solid mesh parented to one bone, so it needs no rigging. Its origin sits on that bone's joint.

| Slot | Shop id | Bone | Stand-in now | Premium versions later |
|---|---|---|---|---|
| Beanie | `op-beanie` | Head | knit cap, hides hair | `assets/operators/gear/beanie-<id>.glb` |
| Visor | `op-visor` | Head | glowing band | `gear/visor-<id>.glb` |
| Face mask | `op-mask` | Head | half-face wrap | `gear/mask-<id>.glb` |
| Scarf | `op-scarf` | Neck | ring scarf | `gear/scarf-<id>.glb` |
| Wrist device | `op-wrist` | LeftForeArm | screen on the wrist | `gear/wrist-<id>.glb` |
| Belt pouches | `op-pouches` | Hips | two pouches | `gear/pouches-<id>.glb` |
| Harness | `op-harness` | Spine2 | chest straps | `gear/harness-<id>.glb` |

### Virtual keyboards (the operator's weapon)

Code-built glowing keyboards: Slab (free), Split, Arc and Compact (shop ids `kb-split`, `kb-arc`, `kb-compact`). They float in front of the operator while typing. Premium keyboards later: `assets/operators/keyboards/<id>.glb`, about 0.45 m wide, keys as separate meshes named `key_<n>` so they can light up when pressed.

## Bosses (js/app/bosskit.js)

A boss is a set of solid parts on BossKit's bones, not a skinned mesh, so it keeps the code poses and attacks. A generated boss gets cut in Blender into one part per bone, named `part_<bone>` with its origin on that bone's joint: hips, spine, chest, neck, head, shL, shR, armL, armR, foreL, foreR, handL, handR (clawL, clawR for Syntax Error), and thighL, thighR, shinL, shinR, footL, footR for bosses with legs. Glowing lines go in their own material named `glow` so the theme colour and the hit flash still work.

| Boss | File | Height | Stand-in now | Shows in |
|---|---|---|---|---|
| Syntax Error | `assets/bosses/syntax.glb` | 17 m, floats 5.9 m up, shard tail, no legs | BossKit `syntax` | World Boss, Boss Rush boss 12, the cover art |
| Siege Titan | `assets/bosses/siege.glb` | 15 m | BossKit `siege` | Boss Rush boss 2 |
| Firewall Warden | `assets/bosses/warden.glb` | 18 m | BossKit `warden` | Boss Rush boss 4 |
| Data Colossus | `assets/bosses/colossus.glb` | 16 m, floats 5.2 m up | BossKit `colossus` | Boss Rush boss 6 |
| Kernel King | `assets/bosses/king.glb` | 15 m | BossKit `king` | Boss Rush boss 8 |
| Half-Compiled | `assets/bosses/half.glb` | 16 m | BossKit `half` | Boss Rush boss 10 |
| Overclocked Brute | `assets/bosses/brute.glb` | 14 m | BossKit `brute` | Boss Rush boss 11 |

The five Breach bosses in Boss Rush (The Spam, The Signboard, The Announcer, The Press, The Correction) and the party creatures (Spam Hydra, Cache Wraith, Null Conductor, Patch and Kiln Golem, Syntax and Echo) are drawn in glowing lines on purpose and stay code-built. The Superboss's Kernel Hydra, The Compiler and Packet Leviathan are code-built too; they're the next bosses worth models, after the seven above.

## Shop items

- **Operator gear** is the first shop category (`REWARDS.shop.gear`): the face mask and the Compact, Split and Arc keyboards for now. Everything else on the Gemini sheets is free. The Operator page (#/lab) lets you try gear on before buying, and `Operator.mine()` leaves off gear you don't own.
- **Room items** (51 in `js/room/items.js`, plus the gifts in `gift-items.js`) are code-built and stay that way.
- **Premium items** are the generated props, outfits and gear, priced at 25,000 coins or more so the shop marks them Premium (`REWARDS.shop.premiumFrom`). A premium room prop goes in `assets/room/<id>.glb` with a shop entry that has `model: 'assets/room/<id>.glb'`; premium gear uses the gear paths above.

## Order

1. Syntax Error, since it's the World Boss and on the cover.
2. The male body from the A-pose sheet, then the female, then two or three heads and hair each.
3. Gear and keyboards for the shop, one premium piece per slot to start.
4. The six titans.
5. Premium room props.
