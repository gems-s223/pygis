import os
import tempfile
import uuid
from pathlib import Path

import rasterio
import rasterio.warp

RASTER_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "rasters")


def process_raster(filename: str, content: bytes) -> dict:
    """
    Save raster file and detect whether it has valid georeferencing.
    Returns a dict with layer_type, file_url, and bounds (or None).
    """
    os.makedirs(RASTER_DIR, exist_ok=True)
    ext = Path(filename).suffix.lower()
    file_id = str(uuid.uuid4())
    save_name = f"{file_id}{ext}"
    save_path = os.path.join(RASTER_DIR, save_name)

    # Write the file to disk first (rasterio needs a seekable path)
    with open(save_path, "wb") as f:
        f.write(content)

    try:
        is_georef, bounds = _detect_georef(save_path)
    except Exception as e:
        # Unreadable as raster — clean up and raise
        os.unlink(save_path)
        raise ValueError(f"Cannot read raster file: {e}")

    file_url = f"/data/rasters/{save_name}"

    if is_georef:
        return {
            "layer_type": "raster_georef",
            "file_url": file_url,
            "bounds": bounds,
        }
    else:
        return {
            "layer_type": "raster_raw",
            "file_url": file_url,
            "bounds": None,
        }


def _detect_georef(path: str) -> tuple[bool, list | None]:
    """
    Returns (is_georeferenced, bounds_or_None).
    bounds format: [[lat_sw, lon_sw], [lat_ne, lon_ne]]
    """
    with rasterio.open(path) as ds:
        # Primary check: CRS must be set
        if ds.crs is None:
            return False, None

        # Secondary check: transform must not be the pixel-identity
        t = ds.transform
        is_identity = (
            t.a == 1.0
            and t.b == 0.0
            and t.c == 0.0
            and t.d == 0.0
            and t.e == 1.0
            and t.f == 0.0
        )
        if is_identity:
            return False, None

        # Reproject bounds to WGS84
        west, south, east, north = rasterio.warp.transform_bounds(
            ds.crs, "EPSG:4326", ds.bounds.left, ds.bounds.bottom,
            ds.bounds.right, ds.bounds.top
        )
        bounds = [[south, west], [north, east]]
        return True, bounds
