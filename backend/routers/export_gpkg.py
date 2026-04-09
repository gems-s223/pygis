import os
import sqlite3
import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
import geopandas as gpd

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
MAPS_DIR = os.path.join(DATA_DIR, "maps")
os.makedirs(MAPS_DIR, exist_ok=True)


@router.post('/api/export_gpkg')
async def export_gpkg(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid JSON payload')

    name = payload.get('project', {}).get('projectName') or payload.get('project', {}).get('name') or 'pygis'
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    safe_name = ''.join(c for c in name if c.isalnum() or c in (' ', '_', '-')).rstrip()
    filename = f"{safe_name.replace(' ', '_')}_{timestamp}.gpkg"
    gpkg_path = os.path.join(MAPS_DIR, filename)

    layers = payload.get('layers', []) or []
    added = []
    data_root = Path(DATA_DIR).resolve()

    for layer in layers:
        url = layer.get('url') or ''
        if not url:
            continue
        if url.startswith('/data/') or url.startswith('data/'):
            rel = url.split('/data/', 1)[-1]
            local_path = (data_root / rel).resolve()
            if not str(local_path).startswith(str(data_root)):
                continue
            local_path = str(local_path)
            if not os.path.exists(local_path):
                continue
            try:
                gdf = gpd.read_file(local_path)
                layer_name = layer.get('name') or os.path.splitext(os.path.basename(local_path))[0]
                gdf.to_file(gpkg_path, layer=layer_name, driver='GPKG')
                added.append(layer_name)
            except Exception:
                try:
                    open(gpkg_path, 'a').close()
                    with open(local_path, 'rb') as rf:
                        data = rf.read()
                    if 'attachments' not in payload:
                        payload['attachments'] = []
                    payload['attachments'].append({'filename': os.path.basename(local_path), 'data_path': local_path})
                except Exception:
                    continue

    try:
        conn = sqlite3.connect(gpkg_path)
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            created_at TEXT,
            payload TEXT
        )''')
        cur.execute('''CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            mime TEXT,
            data BLOB
        )''')
        for a in payload.get('attachments', []):
            try:
                with open(a['data_path'], 'rb') as rf:
                    blob = rf.read()
                cur.execute('INSERT INTO attachments (filename, mime, data) VALUES (?, ?, ?)',
                            (a.get('filename'), None, blob))
            except Exception:
                continue
        cur.execute('INSERT INTO metadata (name, created_at, payload) VALUES (?, ?, ?)',
                    (name, datetime.utcnow().isoformat(), json.dumps(payload)))
        conn.commit()
        conn.close()
    except Exception as e:
        try:
            if os.path.exists(gpkg_path):
                os.remove(gpkg_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail='Failed to write GeoPackage: ' + str(e))

    return {"filename": filename, "download_url": f"/data/maps/{filename}", "layers_added": added}
