import os
import json
import math
import numpy as np
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error


def extract_route_metrics(
    route: List[List[int]],
    elevation: np.ndarray,
    slope: np.ndarray,
    risk: np.ndarray,
    cell_km: float = 0.463,
) -> Dict[str, Any]:
    """Extracts ground-truth scientific and physical metrics along the traverse path."""
    if not route:
        return {}

    elevations = [float(elevation[r, c]) for r, c in route]
    slopes = [float(slope[r, c]) for r, c in route]
    risks = [float(risk[r, c]) for r, c in route]

    # Calculate cumulative ascent and descent
    cumulative_climb_m = 0.0
    cumulative_descent_m = 0.0
    for i in range(1, len(elevations)):
        diff = elevations[i] - elevations[i - 1]
        if diff > 0:
            cumulative_climb_m += diff
        else:
            cumulative_descent_m += abs(diff)

    # Hazard classification distribution
    total_pts = len(route)
    safe_pts = sum(1 for r in risks if r < 20.0)
    moderate_pts = sum(1 for r in risks if 20.0 <= r < 35.0)
    elevated_pts = sum(1 for r in risks if 35.0 <= r <= 50.0)
    steep_pts = sum(1 for s in slopes if s >= 12.0)

    return {
        "waypoints_count": total_pts,
        "approx_distance_km": round(len(route) * cell_km, 2),
        "elevation_start_m": round(elevations[0], 1),
        "elevation_end_m": round(elevations[-1], 1),
        "elevation_min_m": round(min(elevations), 1),
        "elevation_max_m": round(max(elevations), 1),
        "net_elevation_change_m": round(elevations[-1] - elevations[0], 1),
        "cumulative_climb_m": round(cumulative_climb_m, 1),
        "cumulative_descent_m": round(cumulative_descent_m, 1),
        "slope_mean_deg": round(float(np.mean(slopes)), 2),
        "slope_max_deg": round(float(np.max(slopes)), 2),
        "steep_waypoints_count": steep_pts,
        "risk_mean": round(float(np.mean(risks)), 2),
        "risk_max": round(float(np.max(risks)), 2),
        "safe_fraction_pct": round((safe_pts / total_pts) * 100.0, 1),
        "moderate_fraction_pct": round((moderate_pts / total_pts) * 100.0, 1),
        "elevated_fraction_pct": round((elevated_pts / total_pts) * 100.0, 1),
    }


def synthesize_deterministic_explanation(
    metrics: Dict[str, Any],
    comparison: Optional[Dict[str, Any]],
    start_coords: Dict[str, float],
    goal_coords: Dict[str, float],
    risk_weight: float,
    max_risk: float,
) -> Dict[str, Any]:
    """
    Synthesizes a fact-grounded mission briefing based strictly on
    verified physical measurements without inventing data.
    """
    dist_km = metrics.get("approx_distance_km", 0.0)
    start_lat = start_coords.get("lat", 0.0)
    start_lon = start_coords.get("lon", 0.0)
    goal_lat = goal_coords.get("lat", 0.0)
    goal_lon = goal_coords.get("lon", 0.0)

    # 1. Executive Summary
    summary = (
        f"Planned a {dist_km:.1f} km autonomous traverse from ({start_lat:.4f}°N, {start_lon:.4f}°E) "
        f"to target ({goal_lat:.4f}°N, {goal_lon:.4f}°E) across Jezero Crater. "
        f"The route maintains an average terrain hazard score of {metrics.get('risk_mean', 0.0):.1f} / 100 "
        f"and keeps peak hazards under {metrics.get('risk_max', 0.0):.1f} (configured threshold: {max_risk:.1f})."
    )

    # 2. Route Rationale & Direct Comparison
    if comparison and comparison.get("direct_distance_km"):
        detour_km = comparison.get("distance_delta_km", 0.0)
        risk_red = comparison.get("risk_reduction_pct", 0.0)
        direct_max = comparison.get("direct_max_risk", 0.0)
        rationale = (
            f"The 8-way A* engine with risk weight {risk_weight:.1f} diverted around impassable delta scarps "
            f"and rough boulder fields. While the unconstrained direct path is shorter "
            f"({comparison.get('direct_distance_km', 0.0):.1f} km), it encounters high-risk obstacles "
            f"reaching a peak hazard of {direct_max:.1f}. "
            f"By taking a +{detour_km:.2f} km detour, the safe traverse achieves a {risk_red:.1f}% reduction in peak terrain risk."
        )
    else:
        rationale = (
            f"The route was planned using 8-directional A* pathfinding with a risk penalty factor of {risk_weight:.1f}. "
            f"Diagonal corner-cutting was strictly prevented to ensure the rover chassis does not clip "
            f"diagonal obstacle margins."
        )

    # 3. Terrain & Hazard Breakdown
    net_elev = metrics.get("net_elevation_change_m", 0.0)
    elev_direction = "an ascent" if net_elev > 0 else "a descent" if net_elev < 0 else "neutral elevation"
    hazard_breakdown = (
        f"Traverse encounters {metrics.get('safe_fraction_pct', 0.0):.1f}% low-hazard terrain, "
        f"{metrics.get('moderate_fraction_pct', 0.0):.1f}% moderate terrain, and "
        f"{metrics.get('elevated_fraction_pct', 0.0):.1f}% elevated terrain. "
        f"Average slope is {metrics.get('slope_mean_deg', 0.0):.1f}° (maximum: {metrics.get('slope_max_deg', 0.0):.1f}°). "
        f"The traverse experiences {elev_direction} with a net elevation delta of {abs(net_elev):.1f} m "
        f"(cumulative climb: {metrics.get('cumulative_climb_m', 0.0):.1f} m, cumulative descent: {metrics.get('cumulative_descent_m', 0.0):.1f} m)."
    )

    # 4. Tactical Recommendations for Rover Ops
    recs = [
        f"Recommend maximum drive segment length of ~150-200 meters per Martian Sol to allow HazCam slip verification.",
        f"Caution on segments with slope exceeding 12° ({metrics.get('steep_waypoints_count', 0)} waypoints detected); engage wheel-torque telemetry checks to prevent wheel slippage in loose drift sand.",
        f"Prioritize scientific multispectral imaging (Mastcam-Z) and proximity contact science during scheduled mid-traverse recharge halts.",
    ]

    # 5. Scientific Limitations & Data Resolution (Mandatory Phase 9 requirement)
    limitations = (
        "Orbital MOLA MEGDR topographic raster data is sampled at 128 pixels/degree (~463 meters per pixel). "
        "Meter-scale boulders, small impact craters (<100m diameter), sand ripples (mega-ripples), and rover wheel-scale "
        "bedrock fractures cannot be resolved from this dataset. Rover tactical operations must rely on onboard "
        "AutoNav computer vision and HazCam stereoscopic proximity sensors during autonomous drive execution."
    )

    return {
        "executive_summary": summary,
        "route_rationale": rationale,
        "hazard_breakdown": hazard_breakdown,
        "tactical_recommendations": recs,
        "limitations_and_uncertainties": limitations,
        "source": "deterministic_synthesizer",
    }


def call_ai_llm_if_available(prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
    """
    Attempts to call Google Gemini API if GEMINI_API_KEY is configured in environment.
    Falls back gracefully if key is absent or network call fails.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{system_prompt}\n\nTask:\n{prompt}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        }
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            parsed["source"] = "gemini_ai_assisted"
            return parsed
    except Exception:
        # Fall back gracefully to deterministic synthesizer
        return None


def generate_mission_explanation(
    route: List[List[int]],
    comparison: Optional[Dict[str, Any]],
    start_coords: Dict[str, float],
    goal_coords: Dict[str, float],
    risk_weight: float,
    max_risk: float,
    elevation: np.ndarray,
    slope: np.ndarray,
    risk: np.ndarray,
    cell_km: float = 0.463,
) -> Dict[str, Any]:
    """
    Primary Phase 9 entrypoint: calculates physical metrics and constructs
    authoritative mission explanations grounded in real terrain data.
    """
    metrics = extract_route_metrics(route, elevation, slope, risk, cell_km)
    base_explanation = synthesize_deterministic_explanation(
        metrics, comparison, start_coords, goal_coords, risk_weight, max_risk
    )

    # Check for optional AI enhancement
    system_prompt = (
        "You are a NASA Mars Rover Mission Specialist and Planetary Geologist for the Perseverance mission in Jezero Crater. "
        "You are given exact, verified measurements for an autonomous traverse. "
        "CRITICAL RULES:\n"
        "1. DO NOT invent or alter any numbers, coordinates, distances, or risk scores.\n"
        "2. Ground all commentary strictly in the provided metrics.\n"
        "3. Emphasize why the risk-weighted route was chosen over the direct baseline.\n"
        "4. Always mention the ~463m MOLA orbital resolution limit and the need for onboard HazCam AutoNav.\n"
        "Output strictly valid JSON with keys: executive_summary (string), route_rationale (string), "
        "hazard_breakdown (string), tactical_recommendations (array of strings), limitations_and_uncertainties (string)."
    )

    prompt = json.dumps({
        "metrics": metrics,
        "comparison": comparison,
        "start_coords": start_coords,
        "goal_coords": goal_coords,
        "risk_weight": risk_weight,
        "max_risk": max_risk,
    }, indent=2)

    ai_result = call_ai_llm_if_available(prompt, system_prompt)
    if ai_result:
        ai_result["metrics"] = metrics
        return ai_result

    base_explanation["metrics"] = metrics
    return base_explanation
