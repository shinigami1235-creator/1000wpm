"""Brows, lashes and beard fringes as props bound to the head. MakeHuman decimetres:
Y up, +Z front, +X the character's left. The lashes are MakeHuman CC0 cards, and facial hair
is painted on the face texture; both live in face_src.py. The site builds the brows itself."""
from geom import Part
import face_src


def build(K):
    # the brows are built by the site from the meta's 'brow' entry (face_src.brow_atlas)
    for pid, part in face_src.lash_parts(K, Part, K.neu).items():
        K.prop(pid, part)
    # facial hair is painted (face_src.fh_masks, avatar-face.js); the full beard adds a fringe
    # of short strand cards where it turns under the jaw
    K.prop('fh-beard', face_src.beard_fringe(K, Part, 0.07, 0.024, 6), face_src.beard_fringe(K, Part, 0.045, 0.03, 7))
