from pydantic import BaseModel


class ControlPoint(BaseModel):
    pixel: list[float]   # [col, row]
    coords: list[float]  # [lon, lat]


class GeoreferenceRequest(BaseModel):
    image_b64: str
    control_points: list[ControlPoint]


class GeoreferenceResponse(BaseModel):
    image_url: str
    bounds: list[list[float]]  # [[lat_sw, lon_sw], [lat_ne, lon_ne]]
