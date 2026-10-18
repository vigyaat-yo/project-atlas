-- ============================================================================
-- MARSWAY Planetary Navigation & Geospatial System
-- PostgreSQL / PostGIS Spatial Database Schema (Phase 8 Production Scale-Out)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------------------------
-- 1. TERRAIN QUADRANGLES & RASTER METADATA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS terrain_regions (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lat_min DOUBLE PRECISION NOT NULL,
    lat_max DOUBLE PRECISION NOT NULL,
    lon_min DOUBLE PRECISION NOT NULL,
    lon_max DOUBLE PRECISION NOT NULL,
    width_cells INT NOT NULL,
    height_cells INT NOT NULL,
    cell_km DOUBLE PRECISION NOT NULL,
    crs VARCHAR(64) DEFAULT 'IAU2000:Mars / Spherical',
    geom GEOMETRY(Polygon, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_terrain_regions_geom ON terrain_regions USING GIST (geom);

-- ----------------------------------------------------------------------------
-- 2. CURATED SCIENTIFIC TARGETS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS science_targets (
    id VARCHAR(64) PRIMARY KEY,
    region_id VARCHAR(64) REFERENCES terrain_regions(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    geological_type VARCHAR(128) NOT NULL,
    scientific_priority VARCHAR(32) NOT NULL CHECK (scientific_priority IN ('PRIMARY', 'HIGH', 'MODERATE', 'LOW')),
    elevation_m DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_science_targets_geom ON science_targets USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_science_targets_priority ON science_targets (scientific_priority);

-- ----------------------------------------------------------------------------
-- 3. MISSION MILESTONES & LANDMARKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_landmarks (
    id VARCHAR(64) PRIMARY KEY,
    region_id VARCHAR(64) REFERENCES terrain_regions(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    sol INT NOT NULL,
    earth_date VARCHAR(64) NOT NULL,
    elevation_m DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_landmarks_geom ON mission_landmarks USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_mission_landmarks_sol ON mission_landmarks (sol);

-- ----------------------------------------------------------------------------
-- 4. SAVED ROVER TRAVERSES & MISSION PLANS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_missions (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    start_lat DOUBLE PRECISION NOT NULL,
    start_lon DOUBLE PRECISION NOT NULL,
    goal_lat DOUBLE PRECISION NOT NULL,
    goal_lon DOUBLE PRECISION NOT NULL,
    risk_weight DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    max_risk DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    elev_weight DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    distance_km DOUBLE PRECISION NOT NULL,
    waypoints_count INT NOT NULL,
    mean_risk DOUBLE PRECISION NOT NULL,
    max_risk DOUBLE PRECISION NOT NULL,
    risk_reduction_pct DOUBLE PRECISION,
    distance_delta_km DOUBLE PRECISION,
    ai_summary TEXT,
    ai_hazard_notes TEXT,
    operator_notes TEXT,
    start_geom GEOMETRY(Point, 4326) NOT NULL,
    goal_geom GEOMETRY(Point, 4326) NOT NULL,
    traverse_geom GEOMETRY(LineString, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_missions_traverse ON saved_missions USING GIST (traverse_geom);
CREATE INDEX IF NOT EXISTS idx_saved_missions_created ON saved_missions (created_at DESC);
