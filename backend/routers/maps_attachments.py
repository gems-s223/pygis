import os
import sqlite3
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
MAPS_DIR = os.path.join(DATA_DIR, "maps")
os.makedirs(MAPS_DIR, exist_ok=True)


@router.get('/api/maps/{filename}/attachments')
def list_attachments(filename: str):
    path = os.path.join(MAPS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail='Map not found')
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute('SELECT id, filename, length(data) FROM attachments')
        rows = cur.fetchall()
        conn.close()
        return {"attachments": [{"id": r[0], "filename": r[1], "size": r[2]} for r in rows]}
    except Exception:
        return {"attachments": []}


@router.get('/api/maps/{filename}/attachments/{att_id}')
def download_attachment(filename: str, att_id: int):
    path = os.path.join(MAPS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail='Map not found')
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute('SELECT filename, mime, data FROM attachments WHERE id = ?', (att_id,))
        r = cur.fetchone()
        conn.close()
        if not r:
            raise HTTPException(status_code=404, detail='Attachment not found')
        fname, mime, blob = r[0], r[1], r[2]
        mime = mime or 'application/octet-stream'
        return StreamingResponse(
            iter([blob]),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail='Failed to serve attachment')
