from pydantic import BaseModel, Field
from typing import List, Optional, Tuple


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
