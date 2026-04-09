import json
from pathlib import Path
from typing import List

import geopandas as gpd
from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.services.converter import to_geojson
from backend.services.parser import parse_upload
from backend.services.raster import process_raster
from backend.utils.id_gen import new_layer_id
from backend.utils import storage

router = APIRouter()

RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}

DATA_DIR = Path(__file__).parent.parent.parent / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _save_geojson(stem: str, geojson: dict) -> str:
    """Save GeoJSON to uploads dir for project reload. Returns relative filepath."""
    safe = ''.join(c for c in stem if c.isalnum() or c in ('_', '-')).rstrip() or 'layer'
    dest = UPLOADS_DIR / f"{safe}.geojson"
    counter = 1
    while dest.exists():
        dest = UPLOADS_DIR / f"{safe}_{counter}.geojson"
        counter += 1
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(geojson, f)
    return f"data/uploads/{dest.name}"


@router.post("/upload")
async def upload_file(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail='No files provided')

    # Save all uploaded files to the persistent uploads directory
    saved: list[Path] = []
    for f in files:
        content = await f.read()
        dest = UPLOADS_DIR / Path(f.filename).name
        dest.write_bytes(content)
        saved.append(dest)

    # ── Shapefile ──────────────────────────────────────────────
    shp_files = [p for p in saved if p.suffix.lower() == '.shp']
    if shp_files:
        shp_path = shp_files[0]
        stem = shp_path.stem

        # Companion files must exist in the uploads directory
        missing = [
            ext for ext in ('.shx', '.dbf')
            if not (UPLOADS_DIR / f"{stem}{ext}").exists()
        ]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing companion file(s): {', '.join(stem + e for e in missing)}. "
                       f"Upload them alongside the .shp file."
            )

        try:
            gdf = gpd.read_file(str(shp_path))
            if gdf.crs is None:
                gdf = gdf.set_crs("EPSG:4326")
            elif gdf.crs.to_epsg() != 4326:
                gdf = gdf.to_crs("EPSG:4326")
            geojson = to_geojson(gdf)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Shapefile processing error: {str(e)}")

        filepath = _save_geojson(stem, geojson)
        layer_id = new_layer_id()
        storage.store_layer(layer_id, {"name": stem, "layer_type": "vector", "geojson": geojson, "filepath": filepath})
        return {"layer_id": layer_id, "name": stem, "layer_type": "vector", "geojson": geojson, "filepath": filepath}

    # ── Single file (raster / CSV / GeoJSON) ───────────────────
    if len(saved) != 1:
        raise HTTPException(status_code=400, detail='Upload a single file or a shapefile group (.shp + .shx + .dbf)')

    path = saved[0]
    ext = path.suffix.lower()
    content = path.read_bytes()

    if ext in RASTER_EXTENSIONS:
        try:
            result = process_raster(path.name, content)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Raster processing error: {str(e)}")

        layer_id = new_layer_id()
        filepath = result["file_url"].lstrip('/')
        storage.store_layer(layer_id, {
            "name": path.name,
            "layer_type": result["layer_type"],
            "file_url": result["file_url"],
            "filepath": filepath,
        })
        return {
            "layer_id": layer_id,
            "name": path.name,
            "layer_type": result["layer_type"],
            "file_url": result["file_url"],
            "filepath": filepath,
            "bounds": result.get("bounds"),
        }

    else:
        try:
            gdf = parse_upload(path.name, content)
            geojson = to_geojson(gdf)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

        filepath = _save_geojson(path.stem, geojson)
        layer_id = new_layer_id()
        storage.store_layer(layer_id, {"name": path.name, "layer_type": "vector", "geojson": geojson, "filepath": filepath})
        return {"layer_id": layer_id, "name": path.name, "layer_type": "vector", "geojson": geojson, "filepath": filepath}
