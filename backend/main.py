from backend.route_engine import find_route
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

terrain = np.load("data/processed/jezero_terrain.npz")

elevation = terrain["elevation"]
slope = terrain["slope"]
risk = terrain["risk"]

app = FastAPI(title="MARSWAY API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "MARSWAY backend is running"}


@app.get("/terrain")
def terrain_info():
    return {
        "name": "Jezero Crater",
        "width": int(elevation.shape[1]),
        "height": int(elevation.shape[0]),
        "elevation_min": float(elevation.min()),
        "elevation_max": float(elevation.max()),
        "slope_max": float(slope.max()),
        "risk_mean": float(risk.mean()),
    }

@app.get("/route")
def route():
    walkable = risk < 50

    start = (250, 250)
    goal = (300, 300)

    path = find_route(walkable, risk, start, goal)
    route_risks = [float(risk[row, col]) for row, col in path]

    return {
        "start": start,
        "goal": goal,
        "route": path,
        "route_length": len(path),
        "mean_risk": float(np.mean(route_risks)) if route_risks else None,
        "max_risk": float(np.max(route_risks)) if route_risks else None,
    }

