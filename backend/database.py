import sqlite3
import json
import os
import uuid
import time
from typing import List, Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "marsway.db")


def get_db_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes tables for saved rover missions, targets, and landmarks."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS saved_missions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at REAL NOT NULL,
        start_lat REAL NOT NULL,
        start_lon REAL NOT NULL,
        goal_lat REAL NOT NULL,
        goal_lon REAL NOT NULL,
        risk_weight REAL NOT NULL,
        max_risk REAL NOT NULL,
        elev_weight REAL NOT NULL,
        distance_km REAL NOT NULL,
        waypoints_count INTEGER NOT NULL,
        mean_risk REAL NOT NULL,
        max_risk_val REAL NOT NULL,
        risk_reduction_pct REAL,
        distance_delta_km REAL,
        waypoints_json TEXT NOT NULL,
        comparison_json TEXT,
        ai_explanation_json TEXT,
        operator_notes TEXT
    )
    """)

    conn.commit()
    conn.close()


def save_mission(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    mission_id = data.get("id") or f"mission-{uuid.uuid4().hex[:8]}"
    created_at = data.get("created_at") or time.time()
    title = data.get("title") or f"Traverse to ({data.get('goal_lat'):.2f}N, {data.get('goal_lon'):.2f}E)"

    cursor.execute("""
    INSERT OR REPLACE INTO saved_missions (
        id, title, created_at, start_lat, start_lon, goal_lat, goal_lon,
        risk_weight, max_risk, elev_weight, distance_km, waypoints_count,
        mean_risk, max_risk_val, risk_reduction_pct, distance_delta_km,
        waypoints_json, comparison_json, ai_explanation_json, operator_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        mission_id,
        title,
        created_at,
        float(data.get("start_lat", 0.0)),
        float(data.get("start_lon", 0.0)),
        float(data.get("goal_lat", 0.0)),
        float(data.get("goal_lon", 0.0)),
        float(data.get("risk_weight", 1.5)),
        float(data.get("max_risk", 50.0)),
        float(data.get("elev_weight", 0.0)),
        float(data.get("distance_km", 0.0)),
        int(data.get("waypoints_count", 0)),
        float(data.get("mean_risk", 0.0)),
        float(data.get("max_risk_val", 0.0)),
        data.get("risk_reduction_pct"),
        data.get("distance_delta_km"),
        json.dumps(data.get("waypoints", [])),
        json.dumps(data.get("comparison")) if data.get("comparison") is not None else None,
        json.dumps(data.get("ai_explanation")) if data.get("ai_explanation") is not None else None,
        data.get("operator_notes", ""),
    ))

    conn.commit()
    conn.close()

    return get_saved_mission(mission_id)  # type: ignore


def get_saved_missions(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT id, title, created_at, start_lat, start_lon, goal_lat, goal_lon,
           distance_km, waypoints_count, mean_risk, max_risk_val,
           risk_reduction_pct, distance_delta_km, operator_notes
    FROM saved_missions
    ORDER BY created_at DESC
    LIMIT ?
    """, (limit,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_saved_mission(mission_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM saved_missions WHERE id = ?", (mission_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    item = dict(row)
    item["waypoints"] = json.loads(item.pop("waypoints_json", "[]"))
    comp_json = item.pop("comparison_json", None)
    item["comparison"] = json.loads(comp_json) if comp_json and comp_json != "null" else None
    ai_json = item.pop("ai_explanation_json", None)
    item["ai_explanation"] = json.loads(ai_json) if ai_json and ai_json != "null" else None
    return item



def delete_saved_mission(mission_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM saved_missions WHERE id = ?", (mission_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return deleted
