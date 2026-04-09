import os
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
MAPS_DIR = os.path.join(DATA_DIR, "maps")
os.makedirs(MAPS_DIR, exist_ok=True)


@router.post('/api/save_map')
async def save_map(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid JSON payload')

    name = payload.get('project', {}).get('projectName') or payload.get('project', {}).get('name') or 'pygis'
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    safe_name = ''.join(c for c in name if c.isalnum() or c in (' ', '_', '-')).rstrip()
    filename = f"{safe_name.replace(' ', '_')}_{timestamp}.json"
    file_path = os.path.join(MAPS_DIR, filename)

    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail='Failed to save map: ' + str(e))

    return {"filename": filename, "download_url": f"/data/maps/{filename}"}
