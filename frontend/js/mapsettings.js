// ── Legend state ──────────────────────────────────────────────
let legendControl = null;
let legendVisible = true;
let legendPosition = 'topright';

// ── Legend control factory ────────────────────────────────────
function createLegendControl(position) {
  const ctrl = L.control({ position });
  ctrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-control-legend');
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    div.style.backgroundColor = 'rgba(255,255,255,0.95)';
    div.style.borderRadius = '5px';
    div.style.padding = '10px';
    div.style.fontSize = '12px';
    div.style.maxHeight = '300px';
    div.style.overflowY = 'auto';
    return div;
  };
  return ctrl;
}

// ── Render legend contents ────────────────────────────────────
function renderLegend() {
  if (!legendControl || !legendVisible) return;
  const container = legendControl.getContainer();
  if (!container) return;

  const ids = Object.keys(layerRegistry);
  if (ids.length === 0) {
    container.innerHTML = '<b style="font-size:13px">Legend</b><div style="font-size:11px;color:#999;margin-top:4px">No layers</div>';
    return;
  }

  let html = '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Legend</div>';
  ids.forEach(id => {
    const entry = layerRegistry[id];
    let swatchStyle = '';
    if (entry.type === 'image') {
      swatchStyle = 'background: repeating-linear-gradient(45deg,#666 0,#666 2px,transparent 2px,transparent 6px);';
    } else {
      swatchStyle = `background:${entry.color};`;
    }
    swatchStyle += 'width:14px;height:14px;border-radius:2px;flex-shrink:0;border:1px solid #ccc;';
    html += `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:2px 0">
        <span style="${swatchStyle}"></span>
        <span>${entry.name}</span>
      </div>`;
  });
  container.innerHTML = html;
}

// ── Show/hide legend ──────────────────────────────────────────
function toggleLegend(visible) {
  legendVisible = visible;
  if (visible) {
    if (!legendControl) legendControl = createLegendControl(legendPosition);
    legendControl.addTo(map);
    renderLegend();
  } else {
    if (legendControl) legendControl.remove();
  }
}

// ── Change legend position ────────────────────────────────────
function updateLegendPosition(pos) {
  legendPosition = pos;
  if (legendControl) legendControl.remove();
  legendControl = createLegendControl(pos);
  if (legendVisible) {
    legendControl.addTo(map);
    renderLegend();
  }
}

// ── Wire up legend toggle and position ────────────────────────
(function initLegendControls() {
  const legendToggle = document.getElementById('legend-toggle');
  const legendPositionSel = document.getElementById('legend-position');

  if (legendToggle) {
    legendToggle.checked = true;
    legendToggle.addEventListener('change', function () {
      toggleLegend(this.checked);
    });
  }

  if (legendPositionSel) {
    legendPositionSel.value = 'topright';
    legendPositionSel.addEventListener('change', function () {
      updateLegendPosition(this.value);
    });
  }
})();

// ── Map extent controls ───────────────────────────────────────
function applyExtent() {
  const n = parseFloat(document.getElementById('map-north').value);
  const s = parseFloat(document.getElementById('map-south').value);
  const e = parseFloat(document.getElementById('map-east').value);
  const w = parseFloat(document.getElementById('map-west').value);

  if (isNaN(n) || isNaN(s) || isNaN(e) || isNaN(w)) {
    alert('All four values are required.');
    return;
  }
  if (n <= s) {
    alert('North must be greater than South.');
    return;
  }
  if (e <= w) {
    alert('East must be greater than West.');
    return;
  }
  map.fitBounds([[s, w], [n, e]]);
}

function resetExtent() {
  const n = document.getElementById('map-north');
  const s = document.getElementById('map-south');
  const e = document.getElementById('map-east');
  const w = document.getElementById('map-west');

  const ids = Object.keys(layerRegistry);
  if (ids.length === 0) {
    map.setView([0, 0], 2);
    if (n) n.value = '85';
    if (s) s.value = '-85';
    if (e) e.value = '180';
    if (w) w.value = '-180';
    return;
  }

  let combined = null;
  ids.forEach(id => {
    const entry = layerRegistry[id];
    try {
      const b = entry.leafletLayer.getBounds ? entry.leafletLayer.getBounds() : null;
      if (b && b.isValid()) {
        combined = combined ? combined.extend(b) : b;
      }
    } catch (_) {}
  });

  if (combined && combined.isValid()) {
    map.fitBounds(combined);
    if (n) n.value = combined.getNorth().toFixed(4);
    if (s) s.value = combined.getSouth().toFixed(4);
    if (e) e.value = combined.getEast().toFixed(4);
    if (w) w.value = combined.getWest().toFixed(4);
  } else {
    map.setView([0, 0], 2);
    if (n) n.value = '85';
    if (s) s.value = '-85';
    if (e) e.value = '180';
    if (w) w.value = '-180';
  }
}

// ── Wire up the buttons ───────────────────────────────────────
(function initMapControls() {
  const applyBtn = document.getElementById('map-apply-btn');
  const resetBtn = document.getElementById('map-reset-btn');

  if (applyBtn) applyBtn.addEventListener('click', applyExtent);
  if (resetBtn) resetBtn.addEventListener('click', resetExtent);

  const n = document.getElementById('map-north');
  const s = document.getElementById('map-south');
  const e = document.getElementById('map-east');
  const w = document.getElementById('map-west');
  if (n && !n.value) n.value = '85';
  if (s && !s.value) s.value = '-85';
  if (e && !e.value) e.value = '180';
  if (w && !w.value) w.value = '-180';
})();

// ── Boundary drawing state ────────────────────────────────────
let boundaryDrawing = {
  active: false,
  startLat: null,
  startLng: null,
  rectangle: null,
  handles: []
};

// ── Draggable rectangle handles ────────────────────────────────
function addRectangleHandles() {
  removeRectangleHandles();
  if (!boundaryDrawing.rectangle) return;
  const b = boundaryDrawing.rectangle.getBounds();
  const corners = [
    [b.getNorth(), b.getWest()],
    [b.getNorth(), b.getEast()],
    [b.getSouth(), b.getEast()],
    [b.getSouth(), b.getWest()]
  ];

  boundaryDrawing.handles = corners.map((c) => {
    const m = L.marker(c, {
      draggable: true,
      icon: L.divIcon({ className: 'rect-handle', iconSize: [10, 10] }),
      zIndexOffset: 1000
    }).addTo(map);
    m.on('drag', () => updateBoundsFromHandles());
    m.on('dragend', () => {
      updateBoundsFromHandles();
      setDegreeInputsFromBounds(boundaryDrawing.rectangle.getBounds());
    });
    return m;
  });
}

function removeRectangleHandles() {
  if (!boundaryDrawing.handles) return;
  boundaryDrawing.handles.forEach(h => { try { map.removeLayer(h); } catch (_) {} });
  boundaryDrawing.handles = [];
}

function updateBoundsFromHandles() {
  if (!boundaryDrawing.handles || boundaryDrawing.handles.length < 4) return;
  const latlngs = boundaryDrawing.handles.map(h => h.getLatLng());
  const lats = latlngs.map(p => p.lat);
  const lngs = latlngs.map(p => p.lng);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const east = Math.max(...lngs);
  const west = Math.min(...lngs);
  const bounds = [[south, west], [north, east]];
  
  if (!boundaryDrawing.rectangle) {
    boundaryDrawing.rectangle = L.rectangle(bounds, {
      color: 'rgba(255, 107, 107, 0.8)',
      weight: 2,
      fillColor: 'rgba(255, 107, 107, 0.1)',
      fillOpacity: 0.2
    }).addTo(map);
  } else {
    boundaryDrawing.rectangle.setBounds(bounds);
  }
  
  document.getElementById('boundary-coords').textContent = 
    `N: ${north.toFixed(4)} | S: ${south.toFixed(4)} | E: ${east.toFixed(4)} | W: ${west.toFixed(4)}`;
}

// ── Draw boundary box on map ──────────────────────────────────
function startBoundaryDraw() {
  const drawBtn = document.getElementById('draw-boundary-btn');
  if (!drawBtn) {
    console.error('draw-boundary-btn not found');
    return;
  }
  
  // If already drawing, cancel and return (don't restart)
  if (boundaryDrawing.active) {
    cancelBoundaryDraw();
    return;
  }
  
  // Start fresh drawing mode
  boundaryDrawing.active = true;
  boundaryDrawing.startLat = null;
  boundaryDrawing.startLng = null;
  
  drawBtn.textContent = 'Drawing... (ESC to cancel)';
  drawBtn.classList.add('active');
  drawBtn.style.background = 'rgba(255, 107, 107, 0.3)';
  
  document.getElementById('boundary-status').textContent = 'Click and drag on the map to draw boundary box...';
  document.getElementById('map').style.cursor = 'crosshair';
  
  if (map.dragging) map.dragging.disable();
  if (map.doubleClickZoom) map.doubleClickZoom.disable();
  if (map.boxZoom) map.boxZoom.disable();
  if (map.touchZoom) map.touchZoom.disable();

  map.on('mousedown', handleBoundaryMouseDown);
  map.on('mousemove', handleBoundaryMouseMove);
  document.addEventListener('mouseup', handleBoundaryMouseUpGlobal);
  document.addEventListener('keydown', handleBoundaryKeyDown);
}

function cancelBoundaryDraw() {
  const drawBtn = document.getElementById('draw-boundary-btn');
  
  boundaryDrawing.active = false;
  if (boundaryDrawing.rectangle) {
    map.removeLayer(boundaryDrawing.rectangle);
    boundaryDrawing.rectangle = null;
  }
  removeRectangleHandles();
  
  drawBtn.textContent = 'Draw on Map';
  drawBtn.classList.remove('active');
  drawBtn.style.background = '';
  document.getElementById('map').style.cursor = '';
  
  document.getElementById('boundary-status').textContent = 'Click "Draw on Map" to start';
  document.getElementById('boundary-coords').textContent = '';
  
  map.off('mousedown', handleBoundaryMouseDown);
  map.off('mousemove', handleBoundaryMouseMove);
  document.removeEventListener('mouseup', handleBoundaryMouseUpGlobal);
  document.removeEventListener('keydown', handleBoundaryKeyDown);

  if (map.dragging) map.dragging.enable();
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  if (map.boxZoom) map.boxZoom.enable();
  if (map.touchZoom) map.touchZoom.enable();
}

function handleBoundaryMouseDown(e) {
  if (!boundaryDrawing.active) return;
  boundaryDrawing.startLat = e.latlng.lat;
  boundaryDrawing.startLng = e.latlng.lng;
}

function handleBoundaryMouseMove(e) {
  if (!boundaryDrawing.active || boundaryDrawing.startLat === null) return;
  
  const currentLat = e.latlng.lat;
  const currentLng = e.latlng.lng;
  
  if (boundaryDrawing.rectangle) {
    map.removeLayer(boundaryDrawing.rectangle);
  }
  
  const bounds = [
    [Math.min(boundaryDrawing.startLat, currentLat), Math.min(boundaryDrawing.startLng, currentLng)],
    [Math.max(boundaryDrawing.startLat, currentLat), Math.max(boundaryDrawing.startLng, currentLng)]
  ];
  
  boundaryDrawing.rectangle = L.rectangle(bounds, {
    color: 'rgba(255, 107, 107, 0.8)',
    weight: 2,
    fillColor: 'rgba(255, 107, 107, 0.1)',
    fillOpacity: 0.2
  }).addTo(map);
  
  const north = Math.max(boundaryDrawing.startLat, currentLat);
  const south = Math.min(boundaryDrawing.startLat, currentLat);
  const east = Math.max(boundaryDrawing.startLng, currentLng);
  const west = Math.min(boundaryDrawing.startLng, currentLng);
  
  document.getElementById('boundary-coords').textContent = 
    `N: ${north.toFixed(4)} | S: ${south.toFixed(4)} | E: ${east.toFixed(4)} | W: ${west.toFixed(4)}`;
}

function handleBoundaryMouseUpGlobal(ev) {
  try {
    const point = map.mouseEventToLatLng(ev);
    handleBoundaryFinalize(point);
  } catch (err) {
    // ignore
  }
}

function handleBoundaryFinalize(latlng) {
  if (!boundaryDrawing.active || boundaryDrawing.startLat === null || !latlng) return;

  const north = Math.max(boundaryDrawing.startLat, latlng.lat);
  const south = Math.min(boundaryDrawing.startLat, latlng.lat);
  const east = Math.max(boundaryDrawing.startLng, latlng.lng);
  const west = Math.min(boundaryDrawing.startLng, latlng.lng);

  document.getElementById('map-north').value = north.toFixed(4);
  document.getElementById('map-south').value = south.toFixed(4);
  document.getElementById('map-east').value = east.toFixed(4);
  document.getElementById('map-west').value = west.toFixed(4);

  document.getElementById('boundary-status').textContent = 'Boundary drawn! Click "Apply" to set the map extent.';

  boundaryDrawing.startLat = null;
  boundaryDrawing.startLng = null;
  boundaryDrawing.active = false;

  addRectangleHandles();

  const drawBtn = document.getElementById('draw-boundary-btn');
  if (drawBtn) {
    drawBtn.textContent = 'Draw on Map';
    drawBtn.classList.remove('active');
    drawBtn.style.background = '';
  }
  document.getElementById('map').style.cursor = '';

  map.off('mousedown', handleBoundaryMouseDown);
  map.off('mousemove', handleBoundaryMouseMove);
  document.removeEventListener('mouseup', handleBoundaryMouseUpGlobal);
  document.removeEventListener('keydown', handleBoundaryKeyDown);

  if (map.dragging) map.dragging.enable();
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  if (map.boxZoom) map.boxZoom.enable();
  if (map.touchZoom) map.touchZoom.enable();
}

function handleBoundaryKeyDown(e) {
  if (e.key === 'Escape' && boundaryDrawing.active) {
    cancelBoundaryDraw();
  }
}

// ── Wire up boundary draw button ──────────────────────────────
// Also expose globally for inline onclick
window.startBoundaryDraw = startBoundaryDraw;

function setDegreeInputsFromBounds(bounds) {
  if (!bounds) return;
  document.getElementById('map-north').value = bounds.getNorth().toFixed(6);
  document.getElementById('map-south').value = bounds.getSouth().toFixed(6);
  document.getElementById('map-east').value = bounds.getEast().toFixed(6);
  document.getElementById('map-west').value = bounds.getWest().toFixed(6);
}

// ── Initialize legend on load ─────────────────────────────────
(function() {
  legendControl = createLegendControl(legendPosition);
  if (legendVisible) {
    legendControl.addTo(map);
    renderLegend();
  }
})();
