import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routers import upload, layers, georef, project

app = FastAPI(title="PyGIS", description="Lightweight web-based GIS for reservoir engineers")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(layers.router)
app.include_router(georef.router)
app.include_router(project.router)

# Serve data files
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(os.path.join(DATA_DIR, "georef"), exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, "uploads"), exist_ok=True)
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
