// Central layer registry — shared across all modules
const layerRegistry = {};

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#00bcd4'
];
let colorIndex = 0;

function nextColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

// ── Marker SVG helpers ─────────────────────────────────────────
function makeMarkerIcon(style) {
  const c = style.color || '#e74c3c';
  const f = style.fillColor || c;
  const w = style.weight || 2;
  let svg;
  switch (style.markerStyle) {
    case 'square':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><rect x="1" y="1" width="12" height="12" fill="${f}" stroke="${c}" stroke-width="${w}"/></svg>`;
      break;
    case 'triangle':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><polygon points="7,1 13,13 1,13" fill="${f}" stroke="${c}" stroke-width="${w}"/></svg>`;
      break;
    default: // circle
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="6" fill="${f}" stroke="${c}" stroke-width="${w}"/></svg>`;
  }
  return L.divIcon({ html: svg, className: '', iconSize: [14, 14], iconAnchor: [7, 7] });
}

function getDashArray(lineStyle) {
  if (lineStyle === 'dashed') return '8,4';
  if (lineStyle === 'dotted') return '2,4';
  return null;
}

// ── Add layer ─────────────────────────────────────────────────
function addLayer(layerId, name, geojson, type = 'vector', filepath = null) {
  const color = nextColor();
  const style = {
    color,
    fillColor: color,
    weight: 2,
    lineStyle: 'solid',
    markerStyle: 'circle',
    fillOpacity: 0.35,
  };

  let leafletLayer;

  if (type === 'image') {
    leafletLayer = L.imageOverlay(geojson.url, geojson.bounds, { opacity: 1.0 });
    leafletLayer.addTo(map);
    layerRegistry[layerId] = { id: layerId, name, leafletLayer, visible: true, opacity: 1.0, type, color, style, geojsonData: null, filepath, url: geojson.url, bounds: geojson.bounds };
  } else {
    leafletLayer = _buildVectorLayer(geojson, style);
    leafletLayer.addTo(map);
    layerRegistry[layerId] = { id: layerId, name, leafletLayer, visible: true, opacity: 1.0, type: 'vector', color, style, geojsonData: geojson, filepath };
  }

  // Fit map to layer bounds
  try {
    const bounds = leafletLayer.getBounds ? leafletLayer.getBounds() : null;
    if (bounds && bounds.isValid()) map.fitBounds(bounds);
  } catch (_) {}

  renderLayerList();
  if (typeof renderLegend === 'function') renderLegend();
}

function _buildVectorLayer(geojson, style) {
  return L.geoJSON(geojson, {
    style: () => ({
      color: style.color,
      fillColor: style.fillColor,
      weight: style.weight,
      opacity: 0.9,
      fillOpacity: style.fillOpacity,
      dashArray: getDashArray(style.lineStyle),
    }),
    pointToLayer: (feature, latlng) => {
      if (style.markerStyle && style.markerStyle !== 'circle') {
        return L.marker(latlng, { icon: makeMarkerIcon(style) });
      }
      return L.circleMarker(latlng, {
        radius: 6,
        color: style.color,
        fillColor: style.fillColor,
        weight: style.weight,
        fillOpacity: style.fillOpacity + 0.3,
      });
    },
    onEachFeature: bindPopup,
  });
}

// ── Remove layer ──────────────────────────────────────────────
function removeLayer(layerId) {
  const entry = layerRegistry[layerId];
  if (!entry) return;
  map.removeLayer(entry.leafletLayer);
  delete layerRegistry[layerId];
  renderLayerList();
  if (typeof renderLegend === 'function') renderLegend();
}

// ── Toggle visibility ─────────────────────────────────────────
function toggleVisibility(layerId) {
  const entry = layerRegistry[layerId];
  if (!entry) return;
  entry.visible = !entry.visible;
  if (entry.visible) {
    entry.leafletLayer.addTo(map);
  } else {
    map.removeLayer(entry.leafletLayer);
  }
  // Update only the checkbox — no full re-render (preserves open style panels)
  const cb = document.querySelector(`.layer-item[data-id="${layerId}"] input[type="checkbox"].vis-cb`);
  if (cb) cb.checked = entry.visible;
}

// ── Opacity ───────────────────────────────────────────────────
function setOpacity(layerId, value) {
  const entry = layerRegistry[layerId];
  if (!entry) return;
  entry.opacity = parseFloat(value);
  if (entry.type === 'image') {
    entry.leafletLayer.setOpacity(entry.opacity);
  } else {
    entry.leafletLayer.setStyle({ opacity: entry.opacity, fillOpacity: entry.opacity * 0.5 });
  }
}

// ── Z-order ───────────────────────────────────────────────────
function bringLayerForward(layerId) {
  const entry = layerRegistry[layerId];
  if (entry && entry.leafletLayer.bringToFront) entry.leafletLayer.bringToFront();
}

function sendLayerBack(layerId) {
  const entry = layerRegistry[layerId];
  if (entry && entry.leafletLayer.bringToBack) entry.leafletLayer.bringToBack();
}

// ── Style editor ──────────────────────────────────────────────
function toggleStylePanel(layerId) {
  const panel = document.getElementById(`style-panel-${layerId}`);
  if (!panel) return;
  panel.classList.toggle('hidden');
}

function updateStyle(layerId, prop, value) {
  const entry = layerRegistry[layerId];
  if (!entry) return;
  entry.style[prop] = (prop === 'weight') ? parseFloat(value) : value;
  if (prop === 'color') entry.color = value;
  applyLayerStyle(layerId);
  // Keep color swatch in sync without full re-render
  const swatch = document.querySelector(`.layer-item[data-id="${layerId}"] .swatch`);
  if (swatch && prop === 'color') swatch.style.background = value;
  if (typeof renderLegend === 'function') renderLegend();
}

function applyLayerStyle(layerId) {
  const entry = layerRegistry[layerId];
  if (!entry || entry.type === 'image') return;

  const s = entry.style;
  const needsRebuild = s.markerStyle && s.markerStyle !== 'circle';

  if (needsRebuild && entry.geojsonData) {
    // L.circleMarker doesn't support setIcon — rebuild the layer
    map.removeLayer(entry.leafletLayer);
    const newLayer = _buildVectorLayer(entry.geojsonData, s);
    newLayer.addTo(map);
    if (!entry.visible) map.removeLayer(newLayer);
    entry.leafletLayer = newLayer;
  } else {
    entry.leafletLayer.setStyle({
      color: s.color,
      fillColor: s.fillColor,
      weight: s.weight,
      fillOpacity: s.fillOpacity,
      dashArray: getDashArray(s.lineStyle),
    });
  }
}

function renameLayer(layerId, newName) {
  const entry = layerRegistry[layerId];
  if (!entry) return;
  entry.name = newName;
  // Update name span in place (preserves open style panel)
  const nameEl = document.querySelector(`.layer-item[data-id="${layerId}"] .layer-name`);
  if (nameEl) nameEl.title = newName, nameEl.textContent = newName;
  if (typeof renderLegend === 'function') renderLegend();
}

// ── Popup ─────────────────────────────────────────────────────
function bindPopup(feature, layer) {
  if (!feature.properties) return;
  const entries = Object.entries(feature.properties).filter(([, v]) => v !== null);
  if (entries.length === 0) return;
  const content = entries.map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br>');
  layer.bindPopup(`<div class="popup-content">${content}</div>`);
}

// ── Render layer list ─────────────────────────────────────────
function renderLayerList() {
  const container = document.getElementById('layer-list');
  if (!container) return;
  container.innerHTML = '';

  const ids = Object.keys(layerRegistry).reverse();
  if (ids.length === 0) {
    container.innerHTML = '<p class="empty-msg">No layers loaded</p>';
    return;
  }

  ids.forEach(id => {
    const entry = layerRegistry[id];
    const isImage = entry.type === 'image';

    const swatchHtml = isImage
      ? `<span class="swatch swatch-img">IMG</span>`
      : `<span class="swatch" style="background:${entry.color}"></span>`;

    const item = document.createElement('div');
    item.className = 'layer-item';
    item.dataset.id = id;
    item.draggable = true;

    item.innerHTML = `
      <div class="layer-item-row">
        <label class="layer-checkbox-label">
          <input type="checkbox" class="vis-cb" ${entry.visible ? 'checked' : ''}
            onchange="toggleVisibility('${id}')">
        </label>
        ${swatchHtml}
        <span class="layer-name" title="${entry.name}">${entry.name}</span>
        <div class="layer-item-actions">
          <button class="btn-icon-small" title="Attributes" onclick="toggleAttributes('${id}')">ℹ</button>
          <button class="btn-icon-small" title="Edit layer" onclick="openLayerModal('${id}')">⋯</button>
          <button class="btn-icon-small btn-remove" title="Remove layer" onclick="removeLayer('${id}')">✕</button>
        </div>
      </div>
      <div class="layer-attributes hidden" id="attributes-${id}"></div>
    `;

    // Drag events
    item.addEventListener('dragstart', handleLayerDragStart);
    item.addEventListener('dragenter', handleLayerDragEnter);
    item.addEventListener('dragover', handleLayerDragOver);
    item.addEventListener('dragleave', handleLayerDragLeave);
    item.addEventListener('drop', handleLayerDrop);
    item.addEventListener('dragend', handleLayerDragEnd);

    // Double-click opens modal
    item.addEventListener('dblclick', (e) => {
      if (!e.target.classList.contains('btn-icon-small')) openLayerModal(id);
    });

    container.appendChild(item);
  });
}

function renderStylePanel(layerId) {
  const entry = layerRegistry[layerId];
  if (!entry) return '';

  const s = entry.style;
  const isImage = entry.type === 'image';

  let html = `
    <div class="style-row">
      <label>Name</label>
    </div>
    <input type="text" class="style-input" value="${entry.name.replace(/"/g, '&quot;')}"
      oninput="renameLayer('${layerId}', this.value)">
  `;

  if (!isImage) {
    html += `
      <div class="style-row" style="margin-top:8px">
        <label>Stroke color</label>
        <input type="color" value="${s.color}" oninput="updateStyle('${layerId}', 'color', this.value)">
      </div>
      <div class="style-row">
        <label>Fill color</label>
        <input type="color" value="${s.fillColor}" oninput="updateStyle('${layerId}', 'fillColor', this.value)">
      </div>
      <div class="style-row">
        <label>Weight</label>
        <input type="range" min="1" max="10" step="0.5" value="${s.weight}" style="flex:1"
          oninput="updateStyle('${layerId}', 'weight', this.value)">
        <span style="font-size:11px;color:var(--text-muted);min-width:20px;text-align:right">${s.weight}</span>
      </div>
      <label class="field-label">Line Style</label>
      <select class="style-select" onchange="updateStyle('${layerId}', 'lineStyle', this.value)">
        <option value="solid" ${s.lineStyle === 'solid' ? 'selected' : ''}>Solid</option>
        <option value="dashed" ${s.lineStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
        <option value="dotted" ${s.lineStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
      </select>
      <label class="field-label">Marker Style</label>
      <select class="style-select" onchange="updateStyle('${layerId}', 'markerStyle', this.value)">
        <option value="circle" ${s.markerStyle === 'circle' ? 'selected' : ''}>Circle</option>
        <option value="square" ${s.markerStyle === 'square' ? 'selected' : ''}>Square</option>
        <option value="triangle" ${s.markerStyle === 'triangle' ? 'selected' : ''}>Triangle</option>
      </select>
    `;
  }
  return html;
}

// ── Layer modal functions ─────────────────────────────────────
let currentLayerInModal = null;
let draggedLayerId = null;

function openLayerModal(layerId) {
  currentLayerInModal = layerId;
  const entry = layerRegistry[layerId];
  if (!entry) return;

  const modal = getOrCreateLayerModal();
  const s = entry.style || {};
  const isImage = entry.type === 'image';

  // Update modal content
  document.getElementById('modal-layer-name').value = entry.name;
  document.getElementById('modal-layer-visible').checked = entry.visible;
  document.getElementById('modal-layer-opacity').value = entry.opacity;
  document.getElementById('modal-opacity-value').textContent = Math.round(entry.opacity * 100);

  // Update style fields
  if (!isImage) {
    document.getElementById('modal-stroke-color').value = s.color || '#e74c3c';
    document.getElementById('modal-fill-color').value = s.fillColor || '#e74c3c';
    document.getElementById('modal-weight').value = s.weight || 2;
    document.getElementById('modal-weight-value').textContent = s.weight || 2;
    document.getElementById('modal-line-style').value = s.lineStyle || 'solid';
    document.getElementById('modal-marker-style').value = s.markerStyle || 'circle';
    document.getElementById('style-fields').style.display = 'block';
  } else {
    document.getElementById('style-fields').style.display = 'none';
  }

  // Show modal
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeLayerModal() {
  const modal = document.getElementById('layer-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  currentLayerInModal = null;
}

function getOrCreateLayerModal() {
  let modal = document.getElementById('layer-modal');
  if (modal) return modal;

  // Create modal HTML
  modal = document.createElement('div');
  modal.id = 'layer-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Edit Layer</h3>
        <button class="modal-close" onclick="closeLayerModal()">✕</button>
      </div>
      
      <div class="modal-body">
        <div class="modal-section">
          <label class="modal-label">Layer Name</label>
          <input type="text" id="modal-layer-name" class="modal-input" 
            onchange="if(currentLayerInModal) renameLayer(currentLayerInModal, this.value)">
        </div>

        <div class="modal-section">
          <label class="modal-label">
            <input type="checkbox" id="modal-layer-visible" 
              onchange="if(currentLayerInModal) toggleVisibility(currentLayerInModal)">
            Visible
          </label>
        </div>

        <div class="modal-section">
          <label class="modal-label">
            Opacity
            <span id="modal-opacity-value" style="float:right;font-weight:normal">100%</span>
          </label>
          <input type="range" id="modal-layer-opacity" min="0" max="1" step="0.05" 
            oninput="if(currentLayerInModal) { setOpacity(currentLayerInModal, this.value); document.getElementById('modal-opacity-value').textContent = Math.round(this.value * 100) + '%'; }">
        </div>

        <div id="style-fields">
          <div class="modal-divider"></div>
          
          <div class="modal-section">
            <label class="modal-label">Stroke Color</label>
            <input type="color" id="modal-stroke-color" class="modal-input" 
              onchange="if(currentLayerInModal) updateStyle(currentLayerInModal, 'color', this.value)">
          </div>

          <div class="modal-section">
            <label class="modal-label">Fill Color</label>
            <input type="color" id="modal-fill-color" class="modal-input" 
              onchange="if(currentLayerInModal) updateStyle(currentLayerInModal, 'fillColor', this.value)">
          </div>

          <div class="modal-section">
            <label class="modal-label">
              Line Weight
              <span id="modal-weight-value" style="float:right;font-weight:normal">2</span>
            </label>
            <input type="range" id="modal-weight" min="1" max="10" step="0.5" 
              oninput="if(currentLayerInModal) { updateStyle(currentLayerInModal, 'weight', this.value); document.getElementById('modal-weight-value').textContent = this.value; }">
          </div>

          <div class="modal-section">
            <label class="modal-label">Line Style</label>
            <select id="modal-line-style" class="modal-select" 
              onchange="if(currentLayerInModal) updateStyle(currentLayerInModal, 'lineStyle', this.value)">
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>

          <div class="modal-section">
            <label class="modal-label">Marker Style</label>
            <select id="modal-marker-style" class="modal-select" 
              onchange="if(currentLayerInModal) updateStyle(currentLayerInModal, 'markerStyle', this.value)">
              <option value="circle">Circle</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>
        </div>

        <div class="modal-section modal-actions">
          <button class="btn-modal" onclick="closeLayerModal()">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeLayerModal();
  });

  return modal;
}

// ── Drag and drop functions ───────────────────────────────────
function handleLayerDragStart(e) {
  const id = e.currentTarget.dataset.id;
  draggedLayerId = id;
  e.dataTransfer.setData('text/plain', id);
  e.currentTarget.style.opacity = '0.5';
}

function handleLayerDragEnter(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleLayerDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleLayerDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleLayerDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  const draggedId = e.dataTransfer.getData('text/plain') || draggedLayerId;

  if (draggedId && draggedId !== targetId) {
    const ids = Object.keys(layerRegistry).reverse();
    const dragIdx = ids.indexOf(draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (dragIdx !== -1 && targetIdx !== -1) {
      ids.splice(dragIdx, 1);
      ids.splice(targetIdx, 0, draggedId);
      const newRegistry = {};
      ids.reverse().forEach(id => { newRegistry[id] = layerRegistry[id]; });
      // Replace registry entries
      Object.keys(layerRegistry).forEach(k => delete layerRegistry[k]);
      Object.assign(layerRegistry, newRegistry);
      renderLayerList();
      Object.keys(layerRegistry).reverse().forEach((id, idx) => {
        if (layerRegistry[id].leafletLayer && layerRegistry[id].leafletLayer.setZIndex) {
          layerRegistry[id].leafletLayer.setZIndex(idx);
        }
      });
    }
  }
  e.currentTarget.classList.remove('drag-over');
}

function handleLayerDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  e.currentTarget.classList.remove('drag-over');
  draggedLayerId = null;
}

// Toggle attributes panel for a layer
function toggleAttributes(layerId) {
  const el = document.getElementById(`attributes-${layerId}`);
  if (!el) return;
  if (!el.classList.contains('hidden')) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const entry = layerRegistry[layerId];
  if (!entry || !entry.geojsonData) {
    el.innerHTML = '<div style="padding:8px;color:var(--text-muted)">No attributes available</div>';
    el.classList.remove('hidden');
    return;
  }
  // Build attribute summary from first feature properties
  const feat = (entry.geojsonData.features && entry.geojsonData.features[0]) || null;
  if (!feat || !feat.properties) {
    el.innerHTML = '<div style="padding:8px;color:var(--text-muted)">No attributes available</div>';
    el.classList.remove('hidden');
    return;
  }
  let html = '<div style="padding:8px;font-size:12px">';
  Object.entries(feat.properties).forEach(([k,v]) => {
    html += `<div style="margin-bottom:4px"><b style="color:var(--text);">${k}</b>: <span style="color:var(--text-muted);">${v}</span></div>`;
  });
  html += '</div>';
  el.innerHTML = html;
  el.classList.remove('hidden');
}

