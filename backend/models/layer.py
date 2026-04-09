from pydantic import BaseModel


class LayerRecord(BaseModel):
    layer_id: str
    name: str
    geojson: dict
