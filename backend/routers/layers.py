from fastapi import APIRouter, HTTPException

from backend.utils import storage

router = APIRouter()


@router.get("/layers")
def list_layers():
    return [
        {"layer_id": lid, "name": rec["name"]}
        for lid, rec in storage.list_layers().items()
    ]


@router.get("/layers/{layer_id}")
def get_layer(layer_id: str):
    record = storage.get_layer(layer_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} not found")
    return record["geojson"]


@router.delete("/layers/{layer_id}")
def delete_layer(layer_id: str):
    if not storage.delete_layer(layer_id):
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} not found")
    return {"deleted": layer_id}
