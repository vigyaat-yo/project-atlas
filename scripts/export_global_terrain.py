import json
import numpy as np

IMG = "data/raw/mars_global_mola_16ppd.img"
OUT = "data/processed/mars_global_terrain.json"

rows = 2880
cols = 5760

data = np.fromfile(IMG, dtype=">i2").reshape(rows, cols)

# 2-degree sampling from the 0.0625-degree source.
step = 8

sampled = data[::step, ::step]

terrain = {
    "width": int(sampled.shape[1]),
    "height": int(sampled.shape[0]),
    "lat_start": 90.0,
    "lon_start": 0.0,
    "step": 0.5,
    "elevation": sampled.astype(float).tolist(),
}

with open(OUT, "w") as f:
    json.dump(terrain, f)

print(
    f"Exported global MOLA terrain: "
    f"{terrain['width']} x {terrain['height']} "
    f"({terrain['width'] * terrain['height']} points)"
)
