// Project-wide settings — read by export.js and project.js
const projectSettings = {
  utmZone: '48S',
  projectName: 'My Project',
  description: '',
};

// ── Project Save ──────────────────────────────────────────────
function saveProject() {
  const layers = Object.values(layerRegistry).map((entry, i) => ({
    id: entry.id,
    order: i,
    name: entry.name,
    type: entry.type,
    filepath: entry.filepath || null,
    visible: entry.visible,
    opacity: entry.opacity,
    style: entry.style || {},
    bounds: entry.bounds || null,
  }));

  const n = parseFloat(document.getElementById('map-north')?.value || '');
  const s = parseFloat(document.getElementById('map-south')?.value || '');
  const e = parseFloat(document.getElementById('map-east')?.value || '');
  const w = parseFloat(document.getElementById('map-west')?.value || '');
  const hasBounds = [n, s, e, w].every(v => !isNaN(v));

  const legendToggle = document.getElementById('legend-toggle');
  const legendPos = document.getElementById('legend-position');

  const project = {
    project: {
      title: projectSettings.projectName,
      description: projectSettings.description,
      created_at: new Date().toISOString(),
      utm_zone: projectSettings.utmZone,
    },
    map_settings: {
      bounds: hasBounds ? { north: n, south: s, east: e, west: w } : null,
      legend: {
        visible: legendToggle ? legendToggle.checked : false,
        position: legendPos ? legendPos.value : 'topright',
      },
    },
    layers,
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (projectSettings.projectName || 'pygis').replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `${safeName}_project.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Project Load ──────────────────────────────────────────────
async function loadProject(file) {
  let projectData;
  try {
    const text = await file.text();
    projectData = JSON.parse(text);
  } catch (err) {
    alert('Invalid project file: ' + err.message);
    return;
  }

  let restored;
  try {
    const resp = await fetch('/project/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData),
    });
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      alert('Load failed: ' + (d.detail || 'Server error'));
      return;
    }
    restored = await resp.json();
  } catch (err) {
    alert('Network error: ' + err.message);
    return;
  }

  // Restore project settings
  const proj = restored.project || {};
  projectSettings.projectName = proj.title || 'My Project';
  projectSettings.description = proj.description || '';
  projectSettings.utmZone = proj.utm_zone || '48S';

  const nameInput = document.getElementById('project-name');
  if (nameInput) nameInput.value = projectSettings.projectName;
  const descInput = document.getElementById('project-desc');
  if (descInput) descInput.value = projectSettings.description;
  const utmSel = document.getElementById('utm-zone');
  if (utmSel) utmSel.value = projectSettings.utmZone;

  // Restore map bounds
  const ms = restored.map_settings || {};
  if (ms.bounds) {
    const b = ms.bounds;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    setVal('map-north', b.north); setVal('map-south', b.south);
    setVal('map-east', b.east);  setVal('map-west', b.west);
  }

  // Clear existing layers
  Object.keys(layerRegistry).slice().forEach(id => removeLayer(id));

  // Restore layers
  const layers = (restored.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  layers.forEach(layer => {
    if (layer.error) {
      console.warn(`Layer "${layer.name}" could not be loaded: ${layer.error}`);
      return;
    }
    const layerId = layer.id || (Math.random().toString(36).slice(2));
    if (layer.type === 'vector' && layer.geojson) {
      addLayer(layerId, layer.name, layer.geojson, 'vector', layer.filepath);
      const entry = layerRegistry[layerId];
      if (entry) {
        entry.visible = layer.visible !== false;
        entry.opacity = layer.opacity != null ? layer.opacity : 1.0;
        if (layer.style) { entry.style = { ...entry.style, ...layer.style }; applyLayerStyle(layerId); }
        if (!entry.visible) map.removeLayer(entry.leafletLayer);
        setOpacity(layerId, entry.opacity);
      }
    } else if (layer.type === 'raster_georef' && layer.file_url) {
      addLayer(layerId, layer.name, { url: layer.file_url, bounds: layer.bounds }, 'image', layer.filepath);
    }
  });

  alert(`Project "${projectSettings.projectName}" loaded — ${layers.filter(l => !l.error).length} layer(s) restored.`);
}

// ── UTM helper ────────────────────────────────────────────────
function getProj4String(zone) {
  const num = parseInt(zone, 10);
  const hemi = zone.slice(-1).toUpperCase();
  let s = `+proj=utm +zone=${num} +datum=WGS84 +units=m +no_defs`;
  if (hemi === 'S') s += ' +south';
  return s;
}

// ── Update coordinate bar ─────────────────────────────────────
function updateCoordBar(lat, lon) {
  const wgs84El = document.getElementById('coord-wgs84');
  const utmEl = document.getElementById('coord-utm');
  
  if (wgs84El) {
    wgs84El.textContent = `WGS84: ${lat.toFixed(6)}  ${lon.toFixed(6)}`;
  }
  
  if (utmEl) {
    try {
      const proj4str = getProj4String(projectSettings.utmZone);
      const [easting, northing] = proj4('WGS84', proj4str, [lon, lat]);
      utmEl.textContent = `UTM: E: ${easting.toFixed(1)}  N: ${northing.toFixed(1)}  (${projectSettings.utmZone})`;
    } catch (err) {
      utmEl.textContent = 'UTM: N/A';
    }
  }
}

// ── Map hover for coordinates ─────────────────────────────────
map.on('mousemove', function (e) {
  updateCoordBar(e.latlng.lat, e.latlng.lng);
});

map.on('mouseleave', function () {
  const wgs84El = document.getElementById('coord-wgs84');
  const utmEl = document.getElementById('coord-utm');
  if (wgs84El) wgs84El.textContent = 'WGS84: --';
  if (utmEl) utmEl.textContent = 'UTM: --';
});

// ── Populate UTM zone selector ────────────────────────────────
(function populateUtmSelect() {
  const sel = document.getElementById('utm-zone');
  if (!sel) return;

  // Build options 1N..60N then 1S..60S
  for (let i = 1; i <= 60; i++) {
    const opt = document.createElement('option');
    opt.value = `${i}N`;
    opt.textContent = `UTM Zone ${i}N`;
    if (`${i}N` === projectSettings.utmZone) opt.selected = true;
    sel.appendChild(opt);
  }
  for (let i = 1; i <= 60; i++) {
    const opt = document.createElement('option');
    opt.value = `${i}S`;
    opt.textContent = `UTM Zone ${i}S`;
    if (`${i}S` === projectSettings.utmZone) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', function () {
    projectSettings.utmZone = this.value;
    const display = document.getElementById('utm-display');
    if (display) display.textContent = `Selected: ${this.value}`;
  });
})();

// ── Wire project name + description ──────────────────────────
(function initProjectFields() {
  const nameInput = document.getElementById('project-name');
  const descInput = document.getElementById('project-desc');

  if (nameInput) {
    nameInput.value = projectSettings.projectName;
    nameInput.addEventListener('input', function () {
      projectSettings.projectName = this.value;
    });
  }
  if (descInput) {
    descInput.value = projectSettings.description;
    descInput.addEventListener('input', function () {
      projectSettings.description = this.value;
    });
  }
})();
