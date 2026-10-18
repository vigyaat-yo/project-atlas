# MARSWAY Planetary Data Provenance & Architecture Specification

## 1. Data Provenance & Sources

All topographic, elevation, and hazard datasets utilized in the MARSWAY autonomous pathfinding platform originate from verified NASA planetary science missions:

| Dataset | Mission / Instrument | Processing Level | Source / Repository |
| :--- | :--- | :--- | :--- |
| **Global Mars Altimetry** | Mars Global Surveyor (MGS) — Mars Orbiter Laser Altimeter (MOLA) | MEGDR (Mission Experiment Gridded Data Record) | [NASA PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) |
| **Jezero Regional Quadrangle** | MGS MOLA MEGDR Tile `megr_e_128` | 128 pixels/degree Digital Elevation Model (DEM) | NASA Planetary Data System (PDS) / USGS Astrogeology |
| **Science Targets** | Mars 2020 Perseverance Science Team Publications | Curated Peer-Reviewed Geological Sites | NASA JPL-Caltech / MSSS / Mars 2020 Mission Archive |
| **Mission Landmarks** | Mars 2020 Perseverance & Ingenuity Traverse Logs | Verified Milestones (Landing, Flight 1, Sample Cache) | NASA JPL-Caltech Mars 2020 Flight Operations |

---

## 2. Coordinate Reference System (CRS) & Geodetic Parameters

MARSWAY operates strictly within standard planetary science reference frames:

- **Reference Spheroid**: IAU 2000 Mars Spheroid
- **Equatorial Radius ($R_e$)**: `3396.19 km`
- **Polar Radius ($R_p$)**: `3376.20 km`
- **Mean Mars Volumetric Radius ($R_{mean}$)**: `3389.50 km`
- **Longitude Convention**: Planetocentric coordinates, East-positive ($0^\circ$ to $360^\circ$ East, mapped into $[-180^\circ, +180^\circ]$ for WebGL/Cesium compatibility).
- **Elevation Datum**: Mars Areoid (geoid equivalent defined by the 6.1 mbar atmospheric pressure level / gravity field $GMM-2B$).

### Jezero Crater Spatial Extents:
- **North Bound**: `20.4453125° N`
- **South Bound**: `16.4453125° N`
- **West Bound**: `75.4453125° E`
- **East Bound**: `79.4453125° E`
- **Raster Dimensions**: $513 \times 513$ grid cells
- **Grid Resolution**: $\frac{1}{128}^\circ$ per cell ($\approx 0.0078125^\circ$)
- **Spatial Resolution**: $\approx 463.1 \text{ meters/pixel}$ at $18.4^\circ \text{ N}$

---

## 3. Physical Units & Derived Terrain Metrics

| Metric | Unit | Calculation Method / Physical Meaning |
| :--- | :--- | :--- |
| **Elevation ($z$)** | Meters ($\text{m}$) | MOLA laser altimetry relative to the Mars Areoid datum. Range: $-2800\text{m}$ to $-1400\text{m}$ in Jezero. |
| **Slope ($\theta$)** | Degrees ($^\circ$) | 2D gradient magnitude via central difference: $\theta = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right) \times \frac{180}{\pi}$ |
| **Terrain Roughness** | Standard Deviation ($\text{m}$) | Localized elevation variation within a $3 \times 3$ kernel window. |
| **Hazard Index ($H$)** | Normalized $[0, 100]$ | Composite cost function: $H = \min\left(100, \frac{\theta}{25.0} \times 60 + \frac{\text{roughness}}{15.0} \times 40\right)$. |
| **Traverse Distance** | Kilometers ($\text{km}$) | True 8-connected Euclidean path distance with diagonal scaling ($\Delta d = 1.0$ for orthogonal, $\sqrt{2} \approx 1.4142$ for diagonal). |

---

## 4. Phase 8 Architectural Decision Record (ADR): Storage Strategy

### Decision: Dual-Tier Storage Architecture
1. **Tier 1 (High-Speed In-Memory Raster Layer)**:
   - **Engine**: NumPy zero-copy arrays in host memory (`np.load("jezero_terrain.npz")`).
   - **Rationale**: Real-time 8-way A* pathfinding evaluates up to 263,169 raster cells per request. Routing directly against in-memory contiguous memory buffers completes in $< 20\text{ms}$. Storing raw raster rasters in a relational database or PostGIS `ST_Value` queries would introduce orders of magnitude higher latency ($>2000\text{ms}$) and unnecessary infrastructure baggage for the prototype.
2. **Tier 2 (Relational Persistence Layer for Missions & Metadata)**:
   - **Prototype Engine**: Embedded SQLite database (`backend/database.py`) requiring zero setup or cloud credentials. Persists saved traverse missions, scientific objectives, and rover notes.
   - **Production Scale-Out (PostGIS)**: A turnkey PostgreSQL + PostGIS DDL schema (`data/schema_postgis.sql`) is provided with spatial geometry columns (`GEOMETRY(Point, 4326)` and `GEOMETRY(LineString, 4326)`) and GiST spatial indices for enterprise geospatial pipelines and multi-quadrangle expansion.

---

## 5. Licensing & Data Rights

- **NASA / PDS Open Data Policy**: Planetary Data System datasets are in the public domain and freely available for scientific research, educational usage, and public exploration under U.S. government open data directives.
- **Attribution**: "MOLA MEGDR Data provided courtesy of NASA/JPL/GSFC and Washington University in St. Louis PDS Geosciences Node."
