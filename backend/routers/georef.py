from fastapi import APIRouter, HTTPException

from backend.models.georef import GeoreferenceRequest, GeoreferenceResponse
from backend.services.georef import apply_georeference

router = APIRouter()


@router.post("/georeference", response_model=GeoreferenceResponse)
def georeference(req: GeoreferenceRequest):
    if len(req.control_points) < 3:
        raise HTTPException(status_code=400, detail="Minimum 3 control points required")
    try:
        image_url, bounds = apply_georeference(req.image_b64, req.control_points)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Georeferencing failed: {str(e)}")
    return GeoreferenceResponse(image_url=image_url, bounds=bounds)
