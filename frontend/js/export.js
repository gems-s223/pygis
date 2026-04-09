// ── Paper Overlay for Print Preview ───────────────────────────
let paperMap = null;
let paperLayers = {};

// ── Initialize export section toggle detection ───────────────
(function initExportSection() {
  // Find the Export Map section header
  const sections = document.querySelectorAll('.section-header');
  let exportSection = null;
  
  sections.forEach(header => {
    if (header.textContent.includes('Export Map')) {
      exportSection = header;
    }
  });
  
  if (!exportSection) return;
  
  // Monitor for class changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const sectionBody = exportSection.nextElementSibling;
        if (sectionBody && sectionBody.classList.contains('hidden')) {
          closePaperOverlay();
        } else if (sectionBody && !sectionBody.classList.contains('hidden')) {
          openPaperOverlay();
        }
      }
    });
  });

  observer.observe(exportSection, { attributes: true });
})();

function openPaperOverlay() {
  const overlay = document.getElementById('paper-overlay');
  if (!overlay) return;

  // Get boundary box from Map Settings
  const bounds = getBoundaryBounds();
  
  // Show overlay
  overlay.classList.remove('hidden');
  
  // Initialize paper map after overlay is visible
  setTimeout(() => {
    initPaperMap(bounds);
  }, 100);
}

function closePaperOverlay() {
  const overlay = document.getElementById('paper-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  
  // Clean up paper map
  if (paperMap) {
    paperMap.remove();
    paperMap = null;
  }
  paperLayers = {};
}

// Expose to global for onclick
window.closePaperOverlay = closePaperOverlay;

function getBoundaryBounds() {
  const n = parseFloat(document.getElementById('map-north')?.value);
  const s = parseFloat(document.getElementById('map-south')?.value);
  const e = parseFloat(document.getElementById('map-east')?.value);
  const w = parseFloat(document.getElementById('map-west')?.value);
  
  if (isNaN(n) || isNaN(s) || isNaN(e) || isNaN(w)) {
    // Default to Indonesia bounds if no boundary set
    return [[-11, 95], [6, 141]];
  }
  
  return [[s, w], [n, e]];
}

function initPaperMap(bounds) {
  const paperMapContainer = document.getElementById('paper-map');
  if (!paperMapContainer) return;
  
  // Clear existing map
  paperMapContainer.innerHTML = '';
  
  // Create new map instance
  paperMap = L.map('paper-map', {
    zoomControl: false,
    attributionControl: false
  });
  
  // Add zoom control to top-right
  L.control.zoom({ position: 'topright' }).addTo(paperMap);
  
  // Add basemap
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  });
  osmLayer.addTo(paperMap);
  
  // Fit to boundary box
  paperMap.fitBounds(bounds);
  
  // Copy layers from main map
  setTimeout(() => {
    copyLayersToPaperMap();
  }, 500);
}

function copyLayersToPaperMap() {
  if (!paperMap) return;
  
  // Add all layers from main map's layerRegistry
  Object.values(layerRegistry).forEach((entry) => {
    if (!entry.visible) return;
    
    let layer;
    
    if (entry.type === 'image') {
      // Raster layer
      if (entry.bounds) {
        layer = L.imageOverlay(entry.url, entry.bounds, {
          opacity: entry.opacity || 1
        });
      }
    } else {
      // Vector layer
      const style = getVectorStyle(entry);
      layer = L.geoJSON(entry.geojson, {
        style: style,
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 4,
            fillColor: entry.color || '#3388ff',
            color: entry.color || '#3388ff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.5
          });
        }
      });
    }
    
    if (layer) {
      layer.addTo(paperMap);
      paperLayers[entry.id] = layer;
    }
  });
}

function getVectorStyle(entry) {
  return {
    color: entry.color || '#3388ff',
    weight: entry.style?.weight || 2,
    fillColor: entry.fillColor || entry.color || '#3388ff',
    fillOpacity: entry.opacity || 0.5,
    opacity: entry.opacity || 1
  };
}

// ── Export from Paper ────────────────────────────────────────
async function exportFromPaper(format) {
  const statusEl = document.getElementById('export-status');
  
  try {
    if (statusEl) {
      statusEl.textContent = 'Generating export...';
      statusEl.className = 'export-status';
      statusEl.style.display = 'block';
    }
    
    const paperMapContainer = document.getElementById('paper-map');
    
    if (!paperMap) {
      throw new Error('Paper map not initialized');
    }
    
    // Force a re-render
    paperMap.invalidateSize();
    
    // Wait for tiles to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Capture using html2canvas
    const canvas = await html2canvas(paperMapContainer, {
      useCORS: true,
      allowTaint: false,
      logging: false,
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    if (format === 'png') {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      downloadFile(dataUrl, 'pygis-map.png');
    } else if (format === 'pdf') {
      // Generate PDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pw = 297;
      const ph = 210;
      const margin = 10;
      const titleH = 15;
      
      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 50);
      const title = (typeof projectSettings !== 'undefined' && projectSettings.projectName)
        ? projectSettings.projectName
        : 'PyGIS Map';
      doc.text(title, margin, margin + 8);
      
      // Date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 120);
      doc.text(`Exported: ${new Date().toLocaleDateString()}`, pw - margin, margin + 8, { align: 'right' });
      
      // Map image
      const mapY = margin + titleH;
      const mapH = ph - margin - titleH - 25;
      const mapW = pw - 2 * margin;
      const mapImgData = canvas.toDataURL('image/png', 1.0);
      doc.addImage(mapImgData, 'PNG', margin, mapY, mapW, mapH);
      
      // Border
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.5);
      doc.rect(margin, mapY, mapW, mapH);
      
      // Legend
      const entries = Object.values(layerRegistry).filter(e => e.visible);
      if (entries.length > 0) {
        const legendY = ph - margin - 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 50);
        doc.text('Legend:', margin, legendY);
        
        let lx = margin + 20;
        entries.forEach((entry) => {
          const hex = entry.color || '#3388ff';
          const r = parseInt(hex.slice(1, 3), 16) || 51;
          const g = parseInt(hex.slice(3, 5), 16) || 136;
          const b = parseInt(hex.slice(5, 7), 16) || 255;
          doc.setFillColor(r, g, b);
          doc.rect(lx, legendY - 3, 5, 5, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          const label = (entry.name || '').substring(0, 20);
          doc.text(label, lx + 7, legendY);
          lx += 10 + doc.getTextWidth(label);
        });
      }
      
      doc.save('pygis-map.pdf');
    }
    
    if (statusEl) {
      statusEl.textContent = 'Export completed!';
      statusEl.className = 'export-status success';
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    }
    
  } catch (err) {
    console.error('Export error:', err);
    if (statusEl) {
      statusEl.textContent = 'Export failed: ' + err.message;
      statusEl.className = 'export-status error';
    }
  }
}

// Expose to global for onclick
window.exportFromPaper = exportFromPaper;

function downloadFile(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
