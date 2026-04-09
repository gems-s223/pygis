import io
import json
import tempfile
import os
from pathlib import Path

import geopandas as gpd
import pandas as pd


def parse_upload(filename: str, content: bytes) -> gpd.GeoDataFrame:
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        return _parse_csv(content)
    elif ext in (".geojson", ".json"):
        return _parse_geojson(content)
    elif ext == ".zip":
        return _parse_shapefile_zip(content)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: .csv, .geojson, .json")



def _parse_csv(content: bytes) -> gpd.GeoDataFrame:
    df = pd.read_csv(io.BytesIO(content))
    cols_lower = {c.lower(): c for c in df.columns}

    x_col = None
    y_col = None

    for x_candidate in ("x", "lon", "longitude", "long"):
        if x_candidate in cols_lower:
            x_col = cols_lower[x_candidate]
            break

    for y_candidate in ("y", "lat", "latitude"):
        if y_candidate in cols_lower:
            y_col = cols_lower[y_candidate]
            break

    if x_col is None or y_col is None:
        raise ValueError(
            f"CSV must contain coordinate columns. "
            f"Expected x/lon/longitude and y/lat/latitude. "
            f"Found columns: {list(df.columns)}"
        )

    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df[x_col], df[y_col]),
        crs="EPSG:4326",
    )
    return gdf


def _parse_geojson(content: bytes) -> gpd.GeoDataFrame:
    data = json.loads(content)
    if data.get("type") == "FeatureCollection":
        gdf = gpd.GeoDataFrame.from_features(data["features"])
    elif data.get("type") == "Feature":
        gdf = gpd.GeoDataFrame.from_features([data])
    else:
        raise ValueError("GeoJSON must be a FeatureCollection or Feature")

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    return gdf


def _parse_shapefile_zip(content: bytes) -> gpd.GeoDataFrame:
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        gdf = gpd.read_file(f"/vsizip/{tmp.name}")
    finally:
        os.unlink(tmp.name)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs("EPSG:4326")
    return gdf
