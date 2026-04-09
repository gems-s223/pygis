# PyGIS

Lightweight web-based GIS application for reservoir engineers.

Upload CSV, GeoJSON, or Shapefile data — visualize it on an interactive Leaflet map, manage layers, and georeference images.

## Overview

PyGIS is a lightweight, web-based Geographic Information System (GIS) application designed specifically for reservoir engineers. Built with a client-server architecture using FastAPI (backend) and Vanilla JavaScript with Leaflet (frontend), it enables users to upload geospatial data, visualize it on interactive maps, perform georeferencing, and export results in multiple formats.

## System Architecture

### High-Level Design
```
┌─────────────────────┐          ┌─────────────────────┐
│   Frontend Layer    │          │   Backend Layer     │
│  (Vanilla JS+       │  ◄────►  │   (FastAPI +        │
│   Leaflet)          │  REST    │    GeoPandas)       │
│                     │  API     │                     │
└─────────────────────┘          └─────────────────────┘
        │                                  │
        │ Static Files                     │ SQLite DB
        └──────────────────┬───────────────┘
                           │
                 ┌─────────┴─────────┐
                 │  Data Storage     │
                 │  - Georef Images  │
                 │  - Rasters        │
                 │  - Maps DB        │
                 └───────────────────┘
```

### Communication Flow
- **Frontend → Backend**: REST API calls with JWT Bearer tokens
- **Backend → Frontend**: JSON responses (GeoJSON for spatial data)
- **External**: SMTP for email (password reset, verification)

## Features

- **Upload:** CSV (with x/y or lon/lat columns), GeoJSON, Shapefile (.zip)
- **Layer management:** toggle visibility, adjust opacity, reorder, remove
- **Georeferencing:** upload an image, pick 3+ control points, align to map
- **Export:** PNG, JPEG, PDF, GeoPackage

## Local Development

### Prerequisites

- Python 3.11+
- GDAL system libraries (required by GeoPandas/Fiona/Rasterio)

**Ubuntu/Debian:**
```bash
sudo apt-get install libgdal-dev gdal-bin libgeos-dev libproj-dev
```

**macOS (Homebrew):**
```bash
brew install gdal geos proj
```

### Setup

```bash
pip install -r requirements.txt
```

### Run

```bash
uvicorn backend.main:app --reload
```

Open **http://localhost:8000** in your browser.

API docs available at **http://localhost:8000/docs**.

## Docker

```bash
# Build
docker build -t pygis -f docker/Dockerfile .

# Run
docker run -p 8000:8000 pygis
```

Open **http://localhost:8000**.

## Project Structure

```
pygis/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic (parsing, conversion, georef)
│   ├── utils/               # Storage, ID generation
│   └── models/              # Pydantic models
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/                  # map.js, layers.js, upload.js, georef.js
├── data/georef/             # Saved georeferenced images
├── docker/Dockerfile
└── requirements.txt
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload vector file → returns `{layer_id, geojson}` |
| GET | `/layers` | List all layers |
| GET | `/layers/{layer_id}` | Get layer GeoJSON |
| DELETE | `/layers/{layer_id}` | Remove layer |
| POST | `/georeference` | Georeference image → returns `{image_url, bounds}` |

## Workflows

### Upload & Visualize Vector Data
```
1. User clicks "Browse" → Selects CSV/GeoJSON/Shapefile
2. Frontend: FormData upload to POST /upload with Bearer token
3. Backend parser.py: Detect format, parse to GeoDataFrame
4. Backend converter.py: Transform to WGS84, create GeoJSON
5. Backend storage.py: Store in-memory with layer_id
6. Frontend: Receive GeoJSON, render with Leaflet
7. UI: Layer appears in sidebar with controls
```

### Georeference Image
```
1. User uploads image (PNG/TIF) in Georef section
2. Frontend: Display on canvas, prompt for control points
3. User: Click image pixels and provide WGS84 coordinates
4. Frontend: Collect min 3 ControlPoint objects
5. Frontend: POST /georeference with control_points + image_b64
6. Backend georef.py: Solve least-squares affine transformation
7. Backend: Save georeferenced image, calculate bounds
8. Frontend: Add as raster layer to map with bounds
```

### Save & Export Map
```
1. User configures map (layers, settings, project info)
2. User clicks "Save Map DB" → POST /api/save_map
3. Backend: Create SQLite DB with metadata table
4. Backend: Enforce per-user quota (default 10 files)
5. User later: Click "Saved Maps" to list or download

OR

1. User clicks "Export GPKG" → POST /api/export_gpkg
2. Backend: Read each layer from file storage
3. Backend: Add vector layers to GeoPackage
4. Backend: Store raster attachments in SQLite
5. Return GPKG file URL for download
```

---
