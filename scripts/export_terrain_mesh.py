import json
import numpy as np

terrain = np.load("data/processed/jezero_terrain.npz")
elevation = terrain["elevation"]

# Downsample 513x513 → 65x65 for browser rendering
step = 8
sampled = elevation[::step, ::step]

mesh = {
    "width": int(sampled.shape[1]),
    "height": int(sampled.shape[0]),
    "elevation": sampled.astype(float).tolist(),
}

with open("data/processed/jezero_terrain_mesh.json", "w") as f:
    json.dump(mesh, f)

print(
    f"Exported terrain mesh: "
    f"{mesh['width']} x {mesh['height']} "
    f"({mesh['width'] * mesh['height']} points)"
)