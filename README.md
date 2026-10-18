# PROJECT ATLAS · MARSWAY
### Autonomous Mars Rover Navigation & Planetary Terrain Analysis Platform
**Jezero Crater Exploration System for NASA Mars 2020 Perseverance Mission**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-3776ab.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Node.js 18+](https://img.shields.io/badge/node-18+-339933.svg?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-Mars%203D%20Globe-68a063.svg?style=flat)](https://cesium.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-2.0.0-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🚀 Overview

**MARSWAY (Project Atlas)** is an end-to-end planetary navigation and terrain analysis platform designed for Mars surface missions. Built on orbital topography from NASA's Mars Global Surveyor (MGS) Mars Orbiter Laser Altimeter (MOLA), MARSWAY renders an interactive 3D digital elevation model of Mars and Jezero Crater, computes risk-weighted 8-directional autonomous traverse routes, and synthesizes mission explanations grounded strictly in real terrain physics.

---

## 🌟 Key Capabilities

1. **High-Resolution 3D Planetary Visualization**:
   - Interactive Cesium 3D globe configured on the **IAU 2000 Mars Spheroid** ($R_e = 3396.19\text{ km}$).
   - Regional terrain mesh covering the **Jezero Crater quadrangle** ($513 \times 513$ grid cells, $\approx 463.1\text{ meters/pixel}$).
   - Default oblique perspective ($50^\circ$ pitch) highlighting crater walls, river delta channels, and remnant buttes.

2. **Scientific GIS Terrain Analysis Layers**:
   - **Elevation (Topography)**: MOLA laser altimetry mapped relative to the Mars Areoid ($0\text{ m}$ datum).
   - **Slope (Gradient)**: 2D central-difference surface inclination ($\theta^\circ$). Flags areas exceeding the rover's $15^\circ$ pitch threshold.
   - **Terrain Hazard Index ($0\text{--}100$)**: Composite cost metric weighting steep slopes and local surface roughness. Values $\ge 50$ represent impassable barriers.
   - **Interactive Overlays**: Curated Jezero science targets (Midway Delta Front, Séítah, Three Forks) and verified Mars 2020 Perseverance mission milestones (Landing site, Ingenuity Flight 1, Sample Depot).

3. **8-Way A\* Pathfinding Engine**:
   - 8-connected grid search ($\Delta d = 1.0$ orthogonal, $\sqrt{2} \approx 1.414$ diagonal).
   - **Admissible Octile Distance Heuristic**: Guarantees path optimality.
   - **Strict Corner-Cutting Prevention**: Blocks diagonal moves if either adjacent orthogonal neighbor is an obstacle, ensuring rover chassis clearance.
   - **Configurable Strategies**: `🛡️ Safe` (heavy slope/hazard avoidance), `⚖️ Balanced` (optimal mission trade-off), and `⚡ Direct` (shortest distance baseline).

4. **Quantitative Risk vs. Distance Comparison**:
   - Compares the chosen safe route against an unconstrained direct baseline.
   - Reports exact trade-offs: $+X.XX\text{ km}$ detour overhead vs. $Y.Y\%$ peak hazard reduction.

5. **AI-Assisted Mission Briefings (Phase 9)**:
   - Ground-truth metric extraction: net elevation change, cumulative ascent/descent, mean & peak slope, and % hazard distribution.
   - Synthesizes structured narrative reports (executive summary, pathfinding rationale, tactical rover guidelines, and physical stats).
   - **Honest Limitations Callout**: Explicitly notes that 463m orbital DEM resolution leaves meter-scale obstacles unmapped, requiring Perseverance's onboard autonomous HazCam AutoNav during drive execution.
   - Deterministic NASA flight-ops narrator with optional Google Gemini enhancement (`GEMINI_API_KEY`).

6. **Dual-Tier Planetary Data Storage (Phase 8)**:
   - **Tier 1 (In-Memory Raster Cache)**: Microsecond numpy array indexing for real-time pathfinding across 263,169 grid cells.
   - **Tier 2 (Embedded SQLite Persistence)**: Stores planned missions, waypoints, and briefings in `data/marsway.db`.
   - **PostGIS Enterprise Schema**: Production DDL script (`data/schema_postgis.sql`) with GiST spatial indexing for enterprise GIS scaling.

---

## 🛠️ System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Python**: `3.10` or higher (`3.11` / `3.12` / `3.14` supported)
- **Node.js**: `18.0.0` or higher (Node 20+ recommended)
- **WebGL**: Hardware-accelerated browser (Chrome, Edge, Firefox, or Safari)

---

## ⚡ Quick Start Guide (Windows Setup)

### 1. Clone the Repository
```powershell
git clone https://github.com/vigyaat-yo/project-atlas.git
cd project-atlas
```

### 2. Backend Setup & Startup
Open a PowerShell terminal in the repository root:

```powershell
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install backend dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# Start the FastAPI server on port 8000
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

*The backend API will be available at:*
- Health Check: `http://127.0.0.1:8000/health`
- Interactive OpenAPI / Swagger Docs: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup & Startup
Open a second PowerShell terminal in the repository root:

```powershell
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
```

*Open your browser and navigate to:*
👉 **`http://127.0.0.1:5173`**

---

## 🧪 Automated Test Suite

MARSWAY includes a comprehensive test suite with 14 unit and integration tests verifying the routing engine, API schemas, and mission persistence.

To execute all tests:
```powershell
.\.venv\Scripts\python -m unittest discover -s backend/tests -v
```

### Test Coverage Highlights:
- `test_octile_heuristic`: Verifies admissible Octile distance calculation.
- `test_direct_8_way_diagonal`: Validates 8-way diagonal shortest path.
- `test_corner_cutting_prevention`: Ensures the rover cannot clip obstacle corners.
- `test_risk_avoidance_detour`: Validates safe routing around hazardous terrain.
- `test_unreachable_goal`: Tests graceful handling when target is completely surrounded by hazards.
- `test_health_endpoint`: Validates terrain raster memory residency.
- `test_route_out_of_bounds_returns_400`: Checks geographical bounding box validation.
- `test_explain_route_endpoint`: Tests ground-truth AI mission explanation generation.
- `test_missions_crud_lifecycle`: Validates SQLite mission save, read, list, and delete workflow.

---

## 🎬 Hackathon Demonstration Walkthrough

1. **Launch the Application**: Navigate to `http://127.0.0.1:5173`. The topbar will indicate `BACKEND ONLINE`.
2. **Execute Demo Scenario**: Click the **`🎬 Demo Scenario`** button in the topbar.
   - Start point automatically sets to **Octavia E. Butler Landing Site** (`18.4447°N, 77.4508°E`).
   - Destination sets to **Three Forks Delta Contact** (`18.4700°N, 77.4200°E`).
   - Camera flies to an oblique 3D view of the western Jezero delta.
   - The cyan A* safe route and orange dashed direct baseline are rendered on the 3D globe.
   - Metrics card reports: **4.1 km traverse distance**, with **34.2% peak hazard reduction**.
3. **Inspect AI Mission Briefing**: Click **`🤖 AI Mission Briefing`** to view the executive summary, route rationale, physical slope/ascent grid, and tactical rover guidelines.
4. **Save Mission**: Click **`💾 Save Mission`**, enter notes, and confirm. Open the **`💾 SAVED`** tab to view your mission library.
5. **Explore Planetary GIS Layers**: Open the **`🗺️ LAYERS`** tab and toggle between **Elevation**, **Slope**, and **Terrain Hazards**.
6. **Inspect Tech Pipeline**: Click **`🔬 Tech Pipeline`** in the topbar to review the MOLA $\to$ Slope $\to$ Hazard $\to$ 8-Way A* mathematical pipeline.

---

## 🛰️ Planetary Data Sources & Provenance

| Dataset | Instrument / Mission | Source |
| :--- | :--- | :--- |
| **Global Mars Topography** | Mars Orbiter Laser Altimeter (MOLA) | [NASA PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) |
| **Jezero Regional DEM** | MOLA MEGDR Tile `megr_e_128` (128 px/deg) | NASA Planetary Data System / USGS |
| **Science Targets** | Mars 2020 Perseverance Science Team | NASA JPL-Caltech / MSSS / Mars 2020 Mission Archive |
| **Mission Milestones** | Perseverance & Ingenuity Traverse Logs | NASA JPL-Caltech Flight Operations |

*For full details on coordinate reference frames, units, resolution limits, and licensing, refer to [`DATA_PROVENANCE.md`](DATA_PROVENANCE.md).*

### Downloading Raw NASA Data (Optional):
The repository includes pre-processed terrain assets (`data/processed/jezero_terrain.npz` and `data/processed/mars_global_terrain.json`) for immediate out-of-the-box operation. To re-download or process fresh raw MOLA data from NASA PDS:
```powershell
python scripts/download_mola.py
python scripts/load_terrain.py
```

---

## 📂 Project Architecture

```
nasa/
├── backend/
│   ├── database.py              # SQLite persistence layer (Phase 8)
│   ├── main.py                  # FastAPI application & REST endpoints
│   ├── mission_explainer.py     # AI & deterministic mission briefing engine (Phase 9)
│   ├── route_engine.py          # 8-way A* engine with corner-cutting prevention (Phase 4)
│   ├── schemas.py               # Strict Pydantic models & validation schemas (Phase 7)
│   └── tests/
│       ├── test_api.py          # FastAPI endpoint integration test suite
│       └── test_route_engine.py # A* algorithm unit test suite
├── data/
│   ├── processed/
│   │   ├── jezero_terrain.npz   # 513x513 MOLA Jezero elevation, slope, risk raster
│   │   ├── jezero_terrain_mesh.json # Localized 3D surface mesh
│   │   └── mars_global_terrain.json # Global Mars topographic relief mesh
│   ├── schema_postgis.sql       # Enterprise PostgreSQL/PostGIS DDL schema (Phase 8)
│   └── marsway.db               # Embedded SQLite mission database (auto-generated)
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main application HUD & state orchestrator
│   │   ├── components/
│   │   │   ├── GlobeErrorBoundary.tsx # WebGL error boundary
│   │   │   ├── LegendPanel.tsx        # Scientific legends with units
│   │   │   └── MarsGlobe.tsx          # CesiumJS 3D Mars globe & shader logic
│   │   ├── index.css            # Base typography & layout
│   │   └── mars.css             # High-tech NASA mission control design system
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── download_mola.py         # NASA PDS MOLA MEGDR downloader
│   ├── export_global_terrain.py # Global mesh exporter
│   ├── export_terrain_mesh.py   # Regional Jezero mesh exporter
│   ├── load_terrain.py          # NumPy raster loader & hazard model
│   └── route_planner.py         # Standalone route calculation & preview
├── DATA_PROVENANCE.md           # Formal planetary data provenance & ADR
├── requirements.txt             # Backend Python dependencies
├── LICENSE                      # MIT License
└── README.md                    # Project documentation
```

---

## 📜 Definition of Done Verification

- [x] **Mars globe displays global MOLA-derived terrain**: Implemented via Cesium custom Mars ellipsoid and global topographic vertices.
- [x] **User can switch between elevation, slope, and terrain-hazard visualizations**: 3 mutually exclusive scientific layers selectable with custom color ramps.
- [x] **Visualized layers use actual processed terrain data**: Computed directly from MOLA MEGDR elevation and central-difference slope.
- [x] **Science targets and Perseverance context toggled independently**: Independent overlays with point-of-interest fly-to cards.
- [x] **User can choose start and destination**: Interactive click-on-globe picking and manual coordinate inputs with bounds checking.
- [x] **Backend calculates route using configured A\* cost model**: 8-way A* with Octile heuristic, corner-cutting checks, and risk weighting.
- [x] **Route appears correctly on the globe**: Cyan traverse polyline and orange dashed direct baseline rendered cleanly.
- [x] **UI explains route length and terrain risk**: Real-time HUD displaying distance (km), cell count, mean risk, peak hazard, and reduction %.
- [x] **User can understand why route was selected**: AI Mission Briefing explains hazard avoidance, detour trade-offs, and slope elevation profile.
- [x] **Frontend and backend start reliably using documented commands**: Verified on Windows PowerShell.
- [x] **Clear README, license, data attribution, and Git history**: MIT License, NASA citations, and 8+ clean Git commits.

---

## 📄 License & Attribution

This project is open-source software licensed under the **[MIT License](LICENSE)**.

**Scientific Data Attribution**:
- NASA Planetary Data System (PDS) Geosciences Node at Washington University in St. Louis.
- Mars Global Surveyor (MGS) MOLA Science Team (NASA/GSFC).
- Mars 2020 Perseverance Rover Science & Flight Operations Teams (NASA/JPL-Caltech).
