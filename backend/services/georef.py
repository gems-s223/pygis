import base64
import io
import os
import uuid

import numpy as np
from PIL import Image

from backend.models.georef import ControlPoint

GEOREF_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "georef")


def apply_georeference(image_b64: str, control_points: list[ControlPoint]) -> tuple[str, list]:
    # Decode image
    image_bytes = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(image_bytes))
    width, height = img.size

    # Build least-squares affine system
    # lon = a*px + b*py + c
    # lat = d*px + e*py + f
    A = np.array([[cp.pixel[0], cp.pixel[1], 1.0] for cp in control_points])
    b_lon = np.array([cp.coords[0] for cp in control_points])
    b_lat = np.array([cp.coords[1] for cp in control_points])

    coeffs_lon, _, _, _ = np.linalg.lstsq(A, b_lon, rcond=None)
    coeffs_lat, _, _, _ = np.linalg.lstsq(A, b_lat, rcond=None)

    # Transform four corners to geographic coords
    corners = [(0, 0), (width, 0), (width, height), (0, height)]
    lons = [coeffs_lon[0] * px + coeffs_lon[1] * py + coeffs_lon[2] for px, py in corners]
    lats = [coeffs_lat[0] * px + coeffs_lat[1] * py + coeffs_lat[2] for px, py in corners]

    bounds = [[min(lats), min(lons)], [max(lats), max(lons)]]

    # Save image to disk
    os.makedirs(GEOREF_DIR, exist_ok=True)
    image_id = str(uuid.uuid4())
    out_path = os.path.join(GEOREF_DIR, f"{image_id}.png")
    img.save(out_path, format="PNG")

    image_url = f"/data/georef/{image_id}.png"
    return image_url, bounds
