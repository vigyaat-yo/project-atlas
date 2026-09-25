import numpy as np

terrain = np.load("data/processed/jezero_terrain.npz")

elevation = terrain["elevation"]
slope = terrain["slope"]
risk = terrain["risk"]

walkable = risk < 50

print("Terrain loaded successfully")
print("Grid:", elevation.shape)
print("Walkable cells:", int(walkable.sum()))
print("Blocked cells:", int((~walkable).sum()))