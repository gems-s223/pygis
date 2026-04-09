// Global map instance — used by all other modules
const map = L.map('map');

// Fit initial view to Indonesia bounds
try {
  map.fitBounds([[-11, 95], [6, 141]]);
} catch (err) {
  map.setView([ -2, 118 ], 5);
}

// Basemap definitions
const basemaps = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    crossOrigin: 'anonymous',
    className: 'osm-tiles',
    name: 'OpenStreetMap'
  }),
  gterrain: L.tileLayer('https://a.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
    maxZoom: 17,
    crossOrigin: 'anonymous',
    className: 'gterrain-tiles',
    name: 'Terrain'
  }),
  esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    crossOrigin: 'anonymous',
    className: 'esri-tiles',
    name: 'Esri Satellite'
  })
};

// Store current basemap
let currentBasemap = basemaps.osm;
currentBasemap.addTo(map);

// Scale control
L.control.scale().addTo(map);

// Wire basemap selector
(function initBasemapSelector() {
  const select = document.getElementById('basemap-select');
  if (!select) return;

  select.addEventListener('change', function() {
    const value = this.value;
    if (value === 'none') {
      map.removeLayer(currentBasemap);
      currentBasemap = null;
    } else if (basemaps[value]) {
      if (currentBasemap) map.removeLayer(currentBasemap);
      currentBasemap = basemaps[value];
      currentBasemap.addTo(map);
    }
  });
})();
