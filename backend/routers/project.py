import json
from pathlib import Path

import geopandas as gpd
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

DATA_DIR = (Path(__file__).parent.parent.parent / "data").resolve()


@router.post("/project/load")
async def load_project(request: Request):
    try:
        project = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    layers_in = project.get("layers", [])
    layers_out = []

    for layer in layers_in:
        filepath = (layer.get("filepath") or "").strip()
        layer_type = layer.get("type", "vector")

        if not filepath:
            continue

        # Resolve and validate path stays inside DATA_DIR
        rel = filepath.lstrip("/")
        if rel.startswith("data/"):
            rel = rel[len("data/"):]
        abs_path = (DATA_DIR / rel).resolve()
        if not str(abs_path).startswith(str(DATA_DIR)):
            continue
        if not abs_path.is_file():
            layers_out.append({**layer, "error": "File not found on server"})
            continue

        if layer_type in ("raster_georef", "image"):
            layers_out.append({**layer, "file_url": f"/data/{rel}"})

        elif layer_type == "vector":
            try:
                gdf = gpd.read_file(str(abs_path))
                if gdf.crs is None:
                    gdf = gdf.set_crs("EPSG:4326")
                elif gdf.crs.to_epsg() != 4326:
                    gdf = gdf.to_crs("EPSG:4326")
                geojson = json.loads(gdf.to_json())
                layers_out.append({**layer, "geojson": geojson})
            except Exception as e:
                layers_out.append({**layer, "error": str(e)})

    return {
        "project": project.get("project", {}),
        "map_settings": project.get("map_settings", {}),
        "georef": project.get("georef", []),
        "layers": layers_out,
    }
