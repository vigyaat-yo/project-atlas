from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple, Dict, Any


class Coordinates(BaseModel):
    lat: float = Field(..., description="Latitude in degrees North")
    lon: float = Field(..., description="Longitude in degrees East")


class HealthResponse(BaseModel):
    status: str = Field("healthy", description="Backend service status")
    version: str = Field("2.0.0", description="API version")
    grid_loaded: bool = Field(True, description="Indicates if Jezero terrain raster is resident in memory")
    grid_shape: Tuple[int, int] = Field(..., description="(height, width) of terrain raster")
    timestamp: float = Field(..., description="Unix epoch timestamp")


class TerrainInfoResponse(BaseModel):
    name: str = Field(..., description="Region quadrangle name")
    width: int = Field(..., description="Raster width in grid cells")
    height: int = Field(..., description="Raster height in grid cells")
    elevation_min: float = Field(..., description="Minimum elevation in meters")
    elevation_max: float = Field(..., description="Maximum elevation in meters")
    slope_max: float = Field(..., description="Maximum slope in degrees")
    risk_mean: float = Field(..., description="Mean terrain hazard score across grid")
    lat_start: float = Field(..., description="North-west corner latitude")
    lon_start: float = Field(..., description="North-west corner longitude")
    grid_step: float = Field(..., description="Degrees per grid cell")
    cell_km: float = Field(..., description="Approximate kilometers per grid cell")


class ScienceTargetResponse(BaseModel):
    id: str = Field(..., description="Unique slug identifier")
    name: str = Field(..., description="Scientific target title")
    lat: float = Field(..., description="Target latitude (°N)")
    lon: float = Field(..., description="Target longitude (°E)")
    type: str = Field(..., description="Geological or astrobiological classification")
    elevation_m: float = Field(..., description="Estimated elevation in meters")
    description: str = Field(..., description="Detailed scientific description")
    scientific_priority: str = Field(..., description="Exploration priority (PRIMARY, HIGH, MODERATE)")


class PerseveranceLandmarkResponse(BaseModel):
    id: str = Field(..., description="Unique landmark identifier")
    name: str = Field(..., description="Milestone or landmark name")
    lat: float = Field(..., description="Latitude (°N)")
    lon: float = Field(..., description="Longitude (°E)")
    sol: int = Field(..., description="Martian solar day of achievement")
    date: str = Field(..., description="Earth calendar date")
    elevation_m: float = Field(..., description="Elevation at milestone location")
    description: str = Field(..., description="Historical context and achievement details")


class RouteComparison(BaseModel):
    direct_route: List[List[int]] = Field(..., description="Unconstrained shortest baseline path")
    direct_distance_km: float = Field(..., description="Traverse distance of direct baseline in km")
    direct_length: int = Field(..., description="Waypoints count for direct baseline")
    direct_mean_risk: float = Field(..., description="Mean hazard score of direct baseline")
    direct_max_risk: float = Field(..., description="Peak hazard score of direct baseline")
    distance_delta_km: float = Field(..., description="Additional km traveled to detour around hazards")
    risk_reduction_pct: float = Field(..., description="Percentage peak hazard reduction")


class RouteResponse(BaseModel):
    start: Tuple[int, int] = Field(..., description="Start cell indices (row, col)")
    goal: Tuple[int, int] = Field(..., description="Goal cell indices (row, col)")
    start_coords: Coordinates = Field(..., description="Start geographic coordinates")
    goal_coords: Coordinates = Field(..., description="Goal geographic coordinates")
    route: List[List[int]] = Field(..., description="Ordered list of (row, col) traverse waypoints")
    route_length: int = Field(..., description="Total cell waypoints in traverse")
    approx_distance_km: float = Field(..., description="Total traverse distance in kilometers")
    mean_risk: float = Field(..., description="Mean terrain hazard score along chosen traverse")
    max_risk: float = Field(..., description="Maximum hazard score encountered on chosen traverse")
    risk_weight: float = Field(..., description="Risk-aversion weight used in cost calculation")
    comparison: Optional[RouteComparison] = Field(None, description="Direct baseline comparison metrics")


class RouteRequest(BaseModel):
    start_lat: float = Field(..., ge=16.44, le=20.45, description="Start latitude within Jezero grid")
    start_lon: float = Field(..., ge=75.44, le=79.45, description="Start longitude within Jezero grid")
    goal_lat: float = Field(..., ge=16.44, le=20.45, description="Goal latitude within Jezero grid")
    goal_lon: float = Field(..., ge=75.44, le=79.45, description="Goal longitude within Jezero grid")
    risk_weight: float = Field(1.5, ge=0.0, le=10.0, description="Multiplier for risk penalty")
    max_risk: float = Field(50.0, ge=10.0, le=100.0, description="Max walkable risk threshold")
    elev_weight: float = Field(0.0, ge=0.0, le=5.0, description="Elevation ascent penalty")
    compare: bool = Field(True, description="Compute direct baseline comparison")


# ----------------------------------------------------------------
# PHASE 8 & 9: DATA STORAGE & AI MISSION EXPLANATION SCHEMAS
# ----------------------------------------------------------------

class MissionExplanationMetrics(BaseModel):
    waypoints_count: int = Field(..., description="Total cell waypoints")
    approx_distance_km: float = Field(..., description="True Euclidean traverse distance in km")
    elevation_start_m: float = Field(..., description="Start elevation in meters")
    elevation_end_m: float = Field(..., description="Target elevation in meters")
    elevation_min_m: float = Field(..., description="Lowest elevation on path")
    elevation_max_m: float = Field(..., description="Highest elevation on path")
    net_elevation_change_m: float = Field(..., description="Net elevation gain or drop")
    cumulative_climb_m: float = Field(..., description="Total ascent in meters")
    cumulative_descent_m: float = Field(..., description="Total descent in meters")
    slope_mean_deg: float = Field(..., description="Average slope angle in degrees")
    slope_max_deg: float = Field(..., description="Peak slope angle in degrees")
    steep_waypoints_count: int = Field(..., description="Waypoints with slope >= 12 degrees")
    risk_mean: float = Field(..., description="Mean hazard score along traverse")
    risk_max: float = Field(..., description="Peak hazard score along traverse")
    safe_fraction_pct: float = Field(..., description="Percentage of traverse in safe zone (risk < 20)")
    moderate_fraction_pct: float = Field(..., description="Percentage of traverse in moderate zone (20 <= risk < 35)")
    elevated_fraction_pct: float = Field(..., description="Percentage of traverse in elevated zone (35 <= risk <= 50)")


class MissionExplanationResponse(BaseModel):
    executive_summary: str = Field(..., description="High-level mission traverse summary")
    route_rationale: str = Field(..., description="A* algorithm path decision rationale")
    hazard_breakdown: str = Field(..., description="Detailed terrain hazards breakdown")
    tactical_recommendations: List[str] = Field(..., description="Actionable rover operational guidelines")
    limitations_and_uncertainties: str = Field(..., description="MOLA resolution limits and rover HazCam note")
    source: str = Field(..., description="Explanation engine ('gemini_ai_assisted' or 'deterministic_synthesizer')")
    metrics: Optional[MissionExplanationMetrics] = Field(None, description="Physical terrain metrics along traverse")


class ExplainRouteRequest(BaseModel):
    route: List[List[int]] = Field(..., description="Traverse waypoints (row, col)")
    start_coords: Coordinates = Field(..., description="Start coordinates")
    goal_coords: Coordinates = Field(..., description="Goal coordinates")
    risk_weight: float = Field(1.5, description="Risk weight")
    max_risk: float = Field(50.0, description="Max risk threshold")
    comparison: Optional[RouteComparison] = Field(None, description="Direct baseline comparison")


class SaveMissionRequest(BaseModel):
    title: str = Field(..., description="Mission operational title")
    start_lat: float = Field(..., description="Start latitude")
    start_lon: float = Field(..., description="Start longitude")
    goal_lat: float = Field(..., description="Goal latitude")
    goal_lon: float = Field(..., description="Goal longitude")
    risk_weight: float = Field(1.5, description="Risk weight")
    max_risk: float = Field(50.0, description="Max risk threshold")
    elev_weight: float = Field(0.0, description="Elevation weight")
    distance_km: float = Field(..., description="Distance in km")
    waypoints_count: int = Field(..., description="Number of waypoints")
    mean_risk: float = Field(..., description="Mean risk score")
    max_risk_val: float = Field(..., description="Peak risk score")
    risk_reduction_pct: Optional[float] = Field(None, description="Risk reduction vs direct baseline")
    distance_delta_km: Optional[float] = Field(None, description="Detour km vs direct baseline")
    waypoints: List[List[int]] = Field(..., description="Traverse cell coordinates")
    comparison: Optional[Dict[str, Any]] = Field(None, description="Direct comparison metrics")
    ai_explanation: Optional[Dict[str, Any]] = Field(None, description="AI mission explanation")
    operator_notes: Optional[str] = Field("", description="Operator field notes")


class SavedMissionSummary(BaseModel):
    id: str = Field(..., description="Unique mission ID")
    title: str = Field(..., description="Mission operational title")
    created_at: float = Field(..., description="Unix epoch creation timestamp")
    start_lat: float = Field(..., description="Start latitude")
    start_lon: float = Field(..., description="Start longitude")
    goal_lat: float = Field(..., description="Goal latitude")
    goal_lon: float = Field(..., description="Goal longitude")
    distance_km: float = Field(..., description="Distance in km")
    waypoints_count: int = Field(..., description="Number of waypoints")
    mean_risk: float = Field(..., description="Mean risk score")
    max_risk_val: float = Field(..., description="Peak risk score")
    risk_reduction_pct: Optional[float] = Field(None, description="Risk reduction pct")
    distance_delta_km: Optional[float] = Field(None, description="Detour km")
    operator_notes: Optional[str] = Field(None, description="Operator notes")


class SavedMissionDetail(SavedMissionSummary):
    risk_weight: float = Field(..., description="Risk weight used")
    max_risk: float = Field(..., description="Max risk threshold used")
    elev_weight: float = Field(..., description="Elevation weight used")
    waypoints: List[List[int]] = Field(..., description="Traverse waypoints")
    comparison: Optional[Dict[str, Any]] = Field(default=None, description="Direct comparison metrics")
    ai_explanation: Optional[Dict[str, Any]] = Field(default=None, description="AI explanation")


