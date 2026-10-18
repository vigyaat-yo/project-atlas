from backend.route_engine import find_route, SQRT2
from backend.schemas import (
    HealthResponse,
    TerrainInfoResponse,
    ScienceTargetResponse,
    PerseveranceLandmarkResponse,
    RouteResponse,
    RouteRequest,
    RouteComparison,
    Coordinates,
    MissionExplanationResponse,
    ExplainRouteRequest,
    SaveMissionRequest,
    SavedMissionSummary,
    SavedMissionDetail,
)
from backend.database import (
    init_db,
    save_mission,
    get_saved_missions,
    get_saved_mission,
    delete_saved_mission,
)
from backend.mission_explainer import generate_mission_explanation
from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional

import numpy as np
import math
import time

# Module-level terrain loading (efficient single-load cache)
terrain = np.load("data/processed/jezero_terrain.npz")
elevation = terrain["elevation"]
slope = terrain["slope"]
risk = terrain["risk"]

# Jezero terrain grid parameters (matching the regional MOLA tile)
GRID_LAT_START = 20.4453125
GRID_LON_START = 75.4453125
GRID_STEP = 0.0078125  # 1/128 degree
CELL_KM = 3396.0 * (math.pi / 180.0) * GRID_STEP  # ~463 meters per cell

START_TIME = time.time()

app = FastAPI(
    title="MARSWAY API",
    description="Autonomous Mars Rover Navigation and Planetary Terrain Analysis API for Jezero Crater",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize embedded SQLite database for mission persistence
init_db()


# ----------------------------------------------------------------
# SCIENCE TARGETS & MISSION DATA (Phase 5 & 6)
# ----------------------------------------------------------------

SCIENCE_TARGETS = [
    {
        "id": "midway-delta",
        "name": "Midway (Delta Front)",
        "lat": 18.4500,
        "lon": 77.4400,
        "type": "Astrobiology & Sedimentology",
        "elevation_m": -2520.0,
        "description": "Ancient river delta sedimentary deposits rich in smectite clays and carbonates, prime candidate for preserving micro-fossil biosignatures.",
        "scientific_priority": "PRIMARY",
    },
    {
        "id": "seitah-south",
        "name": "Séítah (South)",
        "lat": 18.3800,
        "lon": 77.3700,
        "type": "Igneous Petrology",
        "elevation_m": -2590.0,
        "description": "Undulating sand ripples and layered cumulate olivine rock; reveals Jezero's ancient volcanic history and magma crystallization.",
        "scientific_priority": "HIGH",
    },
    {
        "id": "cffr",
        "name": "Crater Floor Fractured Rough",
        "lat": 18.4700,
        "lon": 77.5000,
        "type": "Basement Stratigraphy",
        "elevation_m": -2560.0,
        "description": "Oldest exposed bedrock on Jezero's floor, forming the pre-lake volcanic floor with extensive polygonal cooling fractures.",
        "scientific_priority": "MODERATE",
    },
    {
        "id": "three-forks",
        "name": "Three Forks Delta Contact",
        "lat": 18.4700,
        "lon": 77.4200,
        "type": "Delta Staging & Sample Depot",
        "elevation_m": -2490.0,
        "description": "Boundary zone where river delta enters crater lake; site of the Mars Sample Return (MSR) backup sample tube cache.",
        "scientific_priority": "HIGH",
    },
    {
        "id": "kodiak-butte",
        "name": "Kodiak Butte",
        "lat": 18.4100,
        "lon": 77.4100,
        "type": "Fluvial Geomorphology",
        "elevation_m": -2460.0,
        "description": "Erosional remnant butte showing Gilbert-type delta bottomset and foreset beds, proving Jezero was a deep perennial lake.",
        "scientific_priority": "PRIMARY",
    },
    {
        "id": "belva-crater",
        "name": "Belva Crater Rim",
        "lat": 18.5200,
        "lon": 77.3800,
        "type": "Impact Excavation",
        "elevation_m": -2430.0,
        "description": "1-km impact crater that excavated deep into the delta, exposing cross-sectional sedimentation sequences.",
        "scientific_priority": "HIGH",
    },
]

PERSEVERANCE_LANDMARKS = [
    {
        "id": "landing-site",
        "name": "Octavia E. Butler Landing Site",
        "lat": 18.4447,
        "lon": 77.4508,
        "sol": 0,
        "date": "18 February 2021",
        "elevation_m": -2574.0,
        "description": "Touchdown site of the Mars 2020 Perseverance Rover mission via Sky Crane maneuver.",
    },
    {
        "id": "ingenuity-field",
        "name": "Ingenuity Airfield (Wright Brothers Field)",
        "lat": 18.4340,
        "lon": 77.4511,
        "sol": 58,
        "date": "19 April 2021",
        "elevation_m": -2572.0,
        "description": "Location of humanity's first powered, controlled flight on another celestial body by the Ingenuity Mars Helicopter.",
    },
    {
        "id": "msr-depot",
        "name": "Three Forks Sample Depot",
        "lat": 18.4712,
        "lon": 77.4195,
        "sol": 665,
        "date": "December 2022",
        "elevation_m": -2488.0,
        "description": "First sample depot on another world: 10 hermetically sealed titanium sample tubes cached for future recovery.",
    },
]


# ----------------------------------------------------------------
# HEALTH & METADATA ENDPOINTS (Phase 7)
# ----------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["System Health"])
def health_check():
    """Returns system status, API version, and terrain raster memory state."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "grid_loaded": bool(elevation is not None and elevation.shape == (513, 513)),
        "grid_shape": (int(elevation.shape[0]), int(elevation.shape[1])),
        "timestamp": time.time(),
    }


@app.get("/terrain", response_model=TerrainInfoResponse, tags=["Terrain Analysis"])
def terrain_info():
    """Returns MOLA elevation, slope, and hazard grid dimensions and bounds."""
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
        "cell_km": round(CELL_KM, 4),
    }


@app.get("/science-targets", response_model=List[ScienceTargetResponse], tags=["Science & Mission Sites"])
def get_science_targets():
    """Returns curated Jezero Crater scientific points of interest with geological classifications."""
    return SCIENCE_TARGETS


@app.get("/perseverance-landmarks", response_model=List[PerseveranceLandmarkResponse], tags=["Science & Mission Sites"])
def get_perseverance_landmarks():
    """Returns verified Mars 2020 Perseverance mission milestones and landing sites."""
    return PERSEVERANCE_LANDMARKS


def compute_path_distance(path: List[List[int]]) -> float:
    """Calculates true Euclidean traverse distance in km taking 8-way diagonal steps into account."""
    if not path or len(path) < 2:
        return 0.0
    dist = 0.0
    for i in range(len(path) - 1):
        dr = abs(path[i + 1][0] - path[i][0])
        dc = abs(path[i + 1][1] - path[i][1])
        if dr != 0 and dc != 0:
            dist += SQRT2 * CELL_KM
        else:
            dist += CELL_KM
    return round(dist, 2)


def execute_routing(
    start_lat: Optional[float],
    start_lon: Optional[float],
    goal_lat: Optional[float],
    goal_lon: Optional[float],
    risk_weight: float = 1.5,
    max_risk: float = 50.0,
    elev_weight: float = 0.0,
    compare: bool = True,
) -> dict:
    """Core pathfinding business logic with comprehensive input validation."""
    grid_h, grid_w = elevation.shape

    # Convert geographic coordinates to discrete grid indices
    if start_lat is not None and start_lon is not None:
        start_row = int(round((GRID_LAT_START - start_lat) / GRID_STEP))
        start_col = int(round((start_lon - GRID_LON_START) / GRID_STEP))
    else:
        start_row, start_col = 256, 257  # Perseverance Landing Site default

    if goal_lat is not None and goal_lon is not None:
        goal_row = int(round((GRID_LAT_START - goal_lat) / GRID_STEP))
        goal_col = int(round((goal_lon - GRID_LON_START) / GRID_STEP))
    else:
        goal_row, goal_col = 255, 255  # Midway Delta Front default

    # Validate geographic bounding box
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

    walkable = risk < max_risk

    if not walkable[start_row, start_col]:
        raise HTTPException(
            status_code=400,
            detail=f"Start point is in a hazard zone (risk={float(risk[start_row, start_col]):.1f} ≥ {max_risk}). Choose a safer location.",
        )

    if not walkable[goal_row, goal_col]:
        raise HTTPException(
            status_code=400,
            detail=f"Destination is in a hazard zone (risk={float(risk[goal_row, goal_col]):.1f} ≥ {max_risk}). Choose a safer location.",
        )

    start = (start_row, start_col)
    goal = (goal_row, goal_col)

    # 1. Compute Primary Traverse Route
    path = find_route(
        walkable,
        risk,
        start,
        goal,
        risk_weight=risk_weight,
        elevation=elevation if elev_weight > 0 else None,
        elev_weight=elev_weight,
    )

    if not path:
        raise HTTPException(
            status_code=404,
            detail="No valid traversable route found between the selected coordinates.",
        )

    route_risks = [float(risk[r, c]) for r, c in path]
    approx_km = compute_path_distance(path)

    # 2. Optional: Compute Direct Baseline for Shortest vs Risk-Aware Comparison (Phase 4)
    comparison_data = None
    if compare and risk_weight > 0:
        direct_path = find_route(walkable, risk, start, goal, risk_weight=0.0)
        if direct_path:
            direct_risks = [float(risk[r, c]) for r, c in direct_path]
            direct_dist = compute_path_distance(direct_path)
            direct_max = float(np.max(direct_risks))
            safe_max = float(np.max(route_risks))
            risk_reduction = (
                round(((direct_max - safe_max) / max(0.01, direct_max)) * 100, 1)
                if direct_max > safe_max
                else 0.0
            )

            comparison_data = {
                "direct_route": direct_path,
                "direct_distance_km": direct_dist,
                "direct_length": len(direct_path),
                "direct_mean_risk": round(float(np.mean(direct_risks)), 2),
                "direct_max_risk": round(direct_max, 2),
                "distance_delta_km": round(approx_km - direct_dist, 2),
                "risk_reduction_pct": risk_reduction,
            }

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
        "risk_weight": risk_weight,
        "comparison": comparison_data,
    }


@app.get("/route", response_model=RouteResponse, tags=["Autonomous Navigation"])
def get_route(
    start_lat: Optional[float] = Query(None, description="Start latitude in degrees North"),
    start_lon: Optional[float] = Query(None, description="Start longitude in degrees East"),
    goal_lat: Optional[float] = Query(None, description="Goal latitude in degrees North"),
    goal_lon: Optional[float] = Query(None, description="Goal longitude in degrees East"),
    risk_weight: float = Query(1.5, ge=0.0, le=10.0, description="Multiplier for risk penalty"),
    max_risk: float = Query(50.0, ge=10.0, le=100.0, description="Max walkable risk threshold"),
    elev_weight: float = Query(0.0, ge=0.0, le=5.0, description="Elevation ascent penalty"),
    compare: bool = Query(True, description="Also compute shortest-path baseline for comparison"),
):
    """Calculates risk-weighted 8-way A* traverse route between two points."""
    return execute_routing(
        start_lat=start_lat,
        start_lon=start_lon,
        goal_lat=goal_lat,
        goal_lon=goal_lon,
        risk_weight=risk_weight,
        max_risk=max_risk,
        elev_weight=elev_weight,
        compare=compare,
    )


@app.post("/route", response_model=RouteResponse, tags=["Autonomous Navigation"])
def post_route(request: RouteRequest = Body(...)):
    """Calculates route from a JSON body payload (for programmatic clients)."""
    return execute_routing(
        start_lat=request.start_lat,
        start_lon=request.start_lon,
        goal_lat=request.goal_lat,
        goal_lon=request.goal_lon,
        risk_weight=request.risk_weight,
        max_risk=request.max_risk,
        elev_weight=request.elev_weight,
        compare=request.compare,
    )


# ----------------------------------------------------------------
# PHASE 9: AI-ASSISTED MISSION EXPLANATIONS
# ----------------------------------------------------------------

@app.post("/explain-route", response_model=MissionExplanationResponse, tags=["AI Mission Explanations"])
def explain_route_endpoint(request: ExplainRouteRequest = Body(...)):
    """
    Synthesizes real terrain metrics, hazard distributions, and an authoritative
    mission traverse explanation grounded strictly in verified MOLA data.
    """
    if not request.route:
        raise HTTPException(status_code=400, detail="Traverse route is empty")

    comp_dict = request.comparison.model_dump() if request.comparison else None
    return generate_mission_explanation(
        route=request.route,
        comparison=comp_dict,
        start_coords=request.start_coords.model_dump(),
        goal_coords=request.goal_coords.model_dump(),
        risk_weight=request.risk_weight,
        max_risk=request.max_risk,
        elevation=elevation,
        slope=slope,
        risk=risk,
        cell_km=CELL_KM,
    )


# ----------------------------------------------------------------
# PHASE 8: MISSION DATA PERSISTENCE & HISTORY
# ----------------------------------------------------------------

@app.post("/missions", response_model=SavedMissionDetail, tags=["Mission Persistence"])
def create_mission(mission: SaveMissionRequest = Body(...)):
    """Saves a planned traverse route, terrain metrics, and AI explanation to database."""
    saved = save_mission(mission.model_dump())
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save mission plan")
    return saved


@app.get("/missions", response_model=List[SavedMissionSummary], tags=["Mission Persistence"])
def list_missions(limit: int = Query(50, ge=1, le=100)):
    """Retrieves list of previously planned and persisted rover missions."""
    return get_saved_missions(limit=limit)


@app.get("/missions/{mission_id}", response_model=SavedMissionDetail, tags=["Mission Persistence"])
def read_mission(mission_id: str):
    """Retrieves full details, waypoints, and AI explanation for a saved mission."""
    mission = get_saved_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission plan '{mission_id}' not found")
    return mission


@app.delete("/missions/{mission_id}", tags=["Mission Persistence"])
def remove_mission(mission_id: str):
    """Deletes a saved mission plan."""
    success = delete_saved_mission(mission_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Mission plan '{mission_id}' not found")
    return {"deleted": True, "id": mission_id}

