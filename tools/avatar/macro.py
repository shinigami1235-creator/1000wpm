"""Mix the MakeHuman macro targets (CC0) into the neutral, male and female meshes the other scripts read."""
import os, sys; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from mhlib import *
import numpy as np
V,F,G=load_obj(); n=len(V)
T=lambda r: load_target(r,n)
Um=T('macrodetails/universal-male-young-averagemuscle-averageweight'); Uf=T('macrodetails/universal-female-young-averagemuscle-averageweight')
E={f'{e}-{g}':T(f'macrodetails/{e}-{g}-young') for e in ['african','asian','caucasian'] for g in ['male','female']}
male=V+Um+sum(E[f'{e}-male'] for e in ['african','asian','caucasian'])/3
fem=V+Uf+sum(E[f'{e}-female'] for e in ['african','asian','caucasian'])/3
neu=(male+fem)/2
np.save(os.path.join(HERE, 'neu.npy'), neu); np.save(os.path.join(HERE, 'male.npy'), male); np.save(os.path.join(HERE, 'fem.npy'), fem)
def joint(name, X):
    fs=[f for f,g in zip(F,G) if g==name]; idx=np.unique([i for f in fs for i in f]); return X[idx].mean(0)
for j in ['joint-head','joint-head-2','joint-neck','joint-l-clavicle','joint-l-shoulder','joint-l-eye','joint-r-eye','joint-mouth','joint-jaw','joint-l-scapula','joint-spine-1','joint-spine-2','joint-spine-3']:
    print(j, np.round(joint(j,neu),3), np.round(joint(j,male),3), np.round(joint(j,fem),3))
