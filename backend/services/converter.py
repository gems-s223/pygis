import json

import geopandas as gpd

FEATURE_LIMIT = 10_000


def to_geojson(gdf: gpd.GeoDataFrame) -> dict:
    gdf = _ensure_wgs84(gdf)
    gdf = _simplify_if_needed(gdf)
    return json.loads(gdf.to_json())


def _ensure_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        return gdf.set_crs("EPSG:4326")
    if gdf.crs.to_epsg() != 4326:
        return gdf.to_crs("EPSG:4326")
    return gdf


def _simplify_if_needed(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if len(gdf) <= FEATURE_LIMIT:
        return gdf
    bounds = gdf.total_bounds  # [minx, miny, maxx, maxy]
    tolerance = max(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 1000
    gdf = gdf.copy()
    gdf["geometry"] = gdf.geometry.simplify(tolerance, preserve_topology=True)
    return gdf
