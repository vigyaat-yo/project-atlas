from backend.route_engine import find_route
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

terrain = np.load("data/processed/jezero_terrain.npz")

elevation = terrain["elevation"]
slope = terrain["slope"]
risk = terrain["risk"]

# Jezero terrain grid parameters (matching the regional MOLA tile)
GRID_LAT_START = 20.4453125
GRID_LON_START = 75.4453125
GRID_STEP = 0.0078125  # 1/128 degree

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
        "lat_start": GRID_LAT_START,
        "lon_start": GRID_LON_START,
        "grid_step": GRID_STEP,
    }


@app.get("/route")
def route(
    start_lat: float = Query(None, description="Start latitude (degrees)"),
    start_lon: float = Query(None, description="Start longitude (degrees)"),
    goal_lat: float = Query(None, description="Goal latitude (degrees)"),
    goal_lon: float = Query(None, description="Goal longitude (degrees)"),
):
    grid_h, grid_w = elevation.shape

    # Convert lat/lon to grid coordinates, or fall back to defaults
    if start_lat is not None and start_lon is not None:
        start_row = int(round((GRID_LAT_START - start_lat) / GRID_STEP))
        start_col = int(round((start_lon - GRID_LON_START) / GRID_STEP))
    else:
        start_row, start_col = 250, 250

    if goal_lat is not None and goal_lon is not None:
        goal_row = int(round((GRID_LAT_START - goal_lat) / GRID_STEP))
        goal_col = int(round((goal_lon - GRID_LON_START) / GRID_STEP))
    else:
        goal_row, goal_col = 300, 300

    # Validate bounds
    lat_min = round(GRID_LAT_START - (grid_h - 1) * GRID_STEP, 2)
    lat_max = round(GRID_LAT_START, 2)
    lon_min = round(GRID_LON_START, 2)
    lon_max = round(GRID_LON_START + (grid_w - 1) * GRID_STEP, 2)
    bounds_msg = f"Valid area: {lat_min}°–{lat_max}°N, {lon_min}°–{lon_max}°E"

    if not (0 <= start_row < grid_h and 0 <= start_col < grid_w):
        raise HTTPException(
            status_code=400,
            detail=f"Start point is outside the Jezero terrain grid. {bounds_msg}",
        )

    if not (0 <= goal_row < grid_h and 0 <= goal_col < grid_w):
        raise HTTPException(
            status_code=400,
            detail=f"Destination is outside the Jezero terrain grid. {bounds_msg}",
        )

    walkable = risk < 50

    if not walkable[start_row, start_col]:
        raise HTTPException(
            status_code=400,
            detail=f"Start point is in a high-risk zone (risk={float(risk[start_row, start_col]):.1f}). Choose a safer location.",
        )

    if not walkable[goal_row, goal_col]:
        raise HTTPException(
            status_code=400,
            detail=f"Destination is in a high-risk zone (risk={float(risk[goal_row, goal_col]):.1f}). Choose a safer location.",
        )

    start = (start_row, start_col)
    goal = (goal_row, goal_col)

    path = find_route(walkable, risk, start, goal)

    if not path:
        raise HTTPException(
            status_code=404,
            detail="No valid route found between the selected points.",
        )

    route_risks = [float(risk[r, c]) for r, c in path]

    # Approximate distance: each grid cell ≈ 463 m at Jezero latitude
    cell_km = 3396.0 * (3.14159265 / 180.0) * GRID_STEP
    approx_km = round(len(path) * cell_km, 2)

    return {
        "start": start,
        "goal": goal,
        "start_coords": {
            "lat": round(GRID_LAT_START - start_row * GRID_STEP, 6),
            "lon": round(GRID_LON_START + start_col * GRID_STEP, 6),
        },
        "goal_coords": {
            "lat": round(GRID_LAT_START - goal_row * GRID_STEP, 6),
            "lon": round(GRID_LON_START + goal_col * GRID_STEP, 6),
        },
        "route": path,
        "route_length": len(path),
        "approx_distance_km": approx_km,
        "mean_risk": float(np.mean(route_risks)),
        "max_risk": float(np.max(route_risks)),
    }
