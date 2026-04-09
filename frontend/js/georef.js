// Georeferencing state machine
// Stages: idle → image_loaded → picking → submitted
const georefState = {
  stage: 'idle',
  imageB64: null,
  imageUrl: null,   // set when loaded from pendingRasters
  imageW: 0,
  imageH: 0,
  tempOverlay: null,
  controlPoints: [],  // [{pixel: [px,py], coords: [lon,lat]}]
  pendingPixel: null, // pixel coord waiting for map click
  pendingLayerId: null // layer_id of the pending raster being georeferenced
};

// ── UI element references ──────────────────────────────────────
const georefFileInput = document.getElementById('georef-file-input');
const georefCanvas = document.getElementById('georef-canvas');
const georefStatus = document.getElementById('georef-status');
const georefSubmitBtn = document.getElementById('georef-submit-btn');
const georefResetBtn = document.getElementById('georef-reset-btn');
const georefPointsList = document.getElementById('georef-points-list');
const georefCtx = georefCanvas ? georefCanvas.getContext('2d') : null;

let georefImg = null;  // HTMLImageElement for canvas drawing

// ── Pending raster dropdown ────────────────────────────────────
function refreshPendingRasterDropdown() {
  const sel = document.getElementById('georef-pending-select');
  const row = document.getElementById('georef-pending-row');
  if (!sel || !row) return;

  sel.innerHTML = '<option value="">-- Select uploaded image --</option>';
  // pendingRasters is declared in upload.js (loads before georef.js)
  Object.entries(pendingRasters).forEach(([id, r]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = r.name;
    sel.appendChild(opt);
  });

  row.style.display = Object.keys(pendingRasters).length > 0 ? 'flex' : 'none';
}

// When user selects a pending raster from the dropdown
const georefPendingSelect = document.getElementById('georef-pending-select');
if (georefPendingSelect) {
  georefPendingSelect.addEventListener('change', function () {
    const id = this.value;
    if (!id) return;
    const raster = pendingRasters[id];
    if (!raster) return;

    _loadImageFromUrl(raster.file_url, id);
  });
}

function _loadImageFromUrl(url, pendingId) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    georefImg = img;
    georefState.imageW = img.naturalWidth;
    georefState.imageH = img.naturalHeight;
    georefState.imageB64 = null;
    georefState.imageUrl = url;
    georefState.pendingLayerId = pendingId || null;
    georefState.stage = 'image_loaded';
    georefState.controlPoints = [];
    georefState.pendingPixel = null;

    drawCanvas();
    renderGeorefPoints();
    setGeorefStatus('Image loaded from upload. Click a point on the image, then click the map.');
    if (georefSubmitBtn) georefSubmitBtn.disabled = true;

    if (georefState.tempOverlay) map.removeLayer(georefState.tempOverlay);
    const bounds = map.getBounds();
    georefState.tempOverlay = L.imageOverlay(url, [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()]
    ], { opacity: 0.5 }).addTo(map);
  };
  img.onerror = () => setGeorefStatus('Failed to load image. Try uploading it again.');
  img.src = url;
}

// ── File selection (new image) ─────────────────────────────────
if (georefFileInput) {
  georefFileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      georefState.imageB64 = dataUrl.split(',')[1];
      georefState.imageUrl = null;
      georefState.pendingLayerId = null;

      const img = new Image();
      img.onload = () => {
        georefImg = img;
        georefState.imageW = img.naturalWidth;
        georefState.imageH = img.naturalHeight;
        georefState.stage = 'image_loaded';
        georefState.controlPoints = [];
        georefState.pendingPixel = null;

        drawCanvas();
        renderGeorefPoints();
        setGeorefStatus('Image loaded. Click a point on the image below, then click the map.');
        if (georefSubmitBtn) georefSubmitBtn.disabled = true;

        if (georefState.tempOverlay) map.removeLayer(georefState.tempOverlay);
        const bounds = map.getBounds();
        georefState.tempOverlay = L.imageOverlay(dataUrl, [
          [bounds.getSouth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()]
        ], { opacity: 0.5 }).addTo(map);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ── Canvas click: record pixel coordinate ─────────────────────
if (georefCanvas) {
  georefCanvas.addEventListener('click', e => {
    if (georefState.stage !== 'image_loaded' && georefState.stage !== 'picking') return;

    const rect = georefCanvas.getBoundingClientRect();
    const scaleX = georefState.imageW / georefCanvas.width;
    const scaleY = georefState.imageH / georefCanvas.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    georefState.pendingPixel = [px, py];
    georefState.stage = 'picking';
    setGeorefStatus(`Pixel (${px.toFixed(0)}, ${py.toFixed(0)}) selected. Now click the matching location on the map.`);
    drawCanvas();
  });
}

// ── Map click: pair with pending pixel coord ───────────────────
map.on('click', e => {
  if (georefState.stage !== 'picking' || !georefState.pendingPixel) return;

  georefState.controlPoints.push({
    pixel: georefState.pendingPixel,
    coords: [e.latlng.lng, e.latlng.lat]
  });
  georefState.pendingPixel = null;
  georefState.stage = 'image_loaded';

  renderGeorefPoints();
  drawCanvas();

  const count = georefState.controlPoints.length;
  if (count >= 3) {
    if (georefSubmitBtn) georefSubmitBtn.disabled = false;
    setGeorefStatus(`${count} control point(s) recorded. You can add more or click Submit.`);
  } else {
    setGeorefStatus(`${count} control point(s) recorded. Add ${3 - count} more (minimum 3 required).`);
  }
});

// ── Submit georeferencing ──────────────────────────────────────
if (georefSubmitBtn) {
  georefSubmitBtn.addEventListener('click', async () => {
    if (georefState.controlPoints.length < 3) return;

    georefSubmitBtn.disabled = true;
    setGeorefStatus('Processing...');

    // Resolve base64: either stored from FileReader, or convert from canvas
    let imageB64 = georefState.imageB64;
    if (!imageB64 && georefImg) {
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = georefState.imageW;
        offscreen.height = georefState.imageH;
        offscreen.getContext('2d').drawImage(georefImg, 0, 0);
        imageB64 = offscreen.toDataURL('image/png').split(',')[1];
      } catch (err) {
        setGeorefStatus('Failed to encode image: ' + err.message);
        georefSubmitBtn.disabled = false;
        return;
      }
    }

    const payload = {
      image_b64: imageB64,
      control_points: georefState.controlPoints,
    };

    try {
      const res = await fetch('/georeference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setGeorefStatus('Error: ' + (data.detail || 'Georeferencing failed'));
        georefSubmitBtn.disabled = false;
        return;
      }

      // Remove temporary overlay
      if (georefState.tempOverlay) {
        map.removeLayer(georefState.tempOverlay);
        georefState.tempOverlay = null;
      }

      // Remove from pendingRasters if it came from there
      if (georefState.pendingLayerId && typeof pendingRasters !== 'undefined') {
        delete pendingRasters[georefState.pendingLayerId];
        refreshPendingRasterDropdown();
      }

      // Add georeferenced image as a proper layer
      const layerId = 'georef-' + Date.now();
      const fileName = georefFileInput.files[0]?.name
        || (georefState.pendingLayerId && pendingRasters[georefState.pendingLayerId]?.name)
        || 'georef-image';
      addLayer(layerId, fileName, { url: data.image_url, bounds: data.bounds }, 'image');

      georefReset();
      setGeorefStatus('Georeferencing complete. Image added as a layer.');
    } catch (err) {
      setGeorefStatus('Network error: ' + err.message);
      georefSubmitBtn.disabled = false;
    }
  });
}

// ── Reset ──────────────────────────────────────────────────────
if (georefResetBtn) {
  georefResetBtn.addEventListener('click', georefReset);
}

function georefReset() {
  if (georefState.tempOverlay) map.removeLayer(georefState.tempOverlay);
  Object.assign(georefState, {
    stage: 'idle',
    imageB64: null,
    imageUrl: null,
    imageW: 0,
    imageH: 0,
    tempOverlay: null,
    controlPoints: [],
    pendingPixel: null,
    pendingLayerId: null,
  });
  georefImg = null;
  if (georefFileInput) georefFileInput.value = '';
  if (georefPendingSelect) georefPendingSelect.value = '';
  if (georefCtx) georefCtx.clearRect(0, 0, georefCanvas.width, georefCanvas.height);
  renderGeorefPoints();
  if (georefSubmitBtn) georefSubmitBtn.disabled = true;
  setGeorefStatus('Upload an image or select a pending raster to begin georeferencing.');
}

// ── Canvas drawing ─────────────────────────────────────────────
function drawCanvas() {
  if (!georefCtx || !georefImg) return;

  const canvasW = georefCanvas.width;
  const canvasH = georefCanvas.height;
  georefCtx.clearRect(0, 0, canvasW, canvasH);
  georefCtx.drawImage(georefImg, 0, 0, canvasW, canvasH);

  const scaleX = canvasW / georefState.imageW;
  const scaleY = canvasH / georefState.imageH;

  // Draw recorded control points
  georefState.controlPoints.forEach((cp, i) => {
    const cx = cp.pixel[0] * scaleX;
    const cy = cp.pixel[1] * scaleY;
    georefCtx.beginPath();
    georefCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
    georefCtx.fillStyle = '#e74c3c';
    georefCtx.fill();
    georefCtx.strokeStyle = '#fff';
    georefCtx.lineWidth = 1.5;
    georefCtx.stroke();
    georefCtx.fillStyle = '#fff';
    georefCtx.font = 'bold 10px sans-serif';
    georefCtx.fillText(i + 1, cx + 8, cy + 4);
  });

  // Draw pending pixel selection
  if (georefState.pendingPixel) {
    const cx = georefState.pendingPixel[0] * scaleX;
    const cy = georefState.pendingPixel[1] * scaleY;
    georefCtx.beginPath();
    georefCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
    georefCtx.fillStyle = '#f39c12';
    georefCtx.fill();
    georefCtx.strokeStyle = '#fff';
    georefCtx.lineWidth = 1.5;
    georefCtx.stroke();
  }
}

// ── Points list rendering ──────────────────────────────────────
function renderGeorefPoints() {
  if (!georefPointsList) return;
  georefPointsList.innerHTML = '';

  if (georefState.controlPoints.length === 0) {
    georefPointsList.innerHTML = '<p class="empty-msg">No control points yet</p>';
    return;
  }

  georefState.controlPoints.forEach((cp, i) => {
    const row = document.createElement('div');
    row.className = 'cp-row';
    row.innerHTML = `
      <span class="cp-num">${i + 1}</span>
      <span class="cp-info">px(${cp.pixel[0].toFixed(0)}, ${cp.pixel[1].toFixed(0)})
        → geo(${cp.coords[0].toFixed(4)}, ${cp.coords[1].toFixed(4)})</span>
      <button class="btn-icon btn-remove" onclick="removeControlPoint(${i})">&#10005;</button>
    `;
    georefPointsList.appendChild(row);
  });
}

function removeControlPoint(index) {
  georefState.controlPoints.splice(index, 1);
  renderGeorefPoints();
  drawCanvas();
  const count = georefState.controlPoints.length;
  if (georefSubmitBtn) georefSubmitBtn.disabled = count < 3;
  setGeorefStatus(count >= 3
    ? `${count} control point(s). Ready to submit.`
    : `${count} control point(s). Need ${3 - count} more.`);
}

function setGeorefStatus(msg) {
  if (georefStatus) georefStatus.textContent = msg;
}
