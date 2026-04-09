import os
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
MAPS_DIR = os.path.join(DATA_DIR, "maps")
os.makedirs(MAPS_DIR, exist_ok=True)


@router.get('/api/maps/list')
def list_maps():
    files = []
    for fname in sorted(os.listdir(MAPS_DIR), reverse=True):
        if not (fname.endswith('.json') or fname.endswith('.gpkg')):
            continue
        path = os.path.join(MAPS_DIR, fname)
        size = os.path.getsize(path)
        created = datetime.utcfromtimestamp(os.path.getctime(path)).isoformat()
        metadata = None
        if fname.endswith('.json'):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            except Exception:
                metadata = None
        files.append({
            "filename": fname,
            "size": size,
            "created": created,
            "metadata": metadata,
            "url": f"/data/maps/{fname}",
        })
    return {"files": files}
