// Registry for rasters uploaded without georeferencing
const pendingRasters = {};

const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');

function _updateLabel(files) {
  if (!files || files.length === 0) {
    fileLabel.textContent = 'Choose file(s)...';
  } else if (files.length === 1) {
    fileLabel.textContent = files[0].name;
  } else {
    fileLabel.textContent = `${files.length} files selected`;
  }
}

function validateShapefile(files) {
  const fileNames = Array.from(files).map(f => f.name.toLowerCase());
  
  const shpIndex = fileNames.findIndex(name => name.endsWith('.shp'));
  if (shpIndex === -1) {
    return { valid: true, missing: [] };
  }

  const shpName = files[shpIndex].name;
  const stem = shpName.slice(0, -4).toLowerCase();
  
  const missing = [];
  const required = ['.shx', '.dbf'];
  
  required.forEach(ext => {
    const requiredFile = stem + ext;
    if (!fileNames.includes(requiredFile)) {
      missing.push(requiredFile);
    }
  });

  return { valid: missing.length === 0, missing, stem };
}

fileInput.addEventListener('change', function () {
  clearUploadError();
  clearUploadNotice();
  _updateLabel(this.files);
});

document.getElementById('upload-btn').addEventListener('click', async () => {
  const files = Array.from(fileInput.files);
  clearUploadError();
  clearUploadNotice();

  if (files.length === 0) {
    showUploadError('Please select a file first.');
    return;
  }

  const validation = validateShapefile(files);
  if (!validation.valid) {
    showUploadError(`Missing required companion files: ${validation.missing.join(', ')}`);
    return;
  }

  setUploadLoading(true);

  const formData = new FormData();
  files.forEach(f => formData.append('files', f));

  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      showUploadError(data.detail || 'Upload failed');
      return;
    }

    const layerType = data.layer_type;

    if (layerType === 'raster_georef') {
      addLayer(data.layer_id, data.name, { url: data.file_url, bounds: data.bounds }, 'image', data.filepath);

    } else if (layerType === 'raster_raw') {
      pendingRasters[data.layer_id] = { name: data.name, file_url: data.file_url };
      showUploadNotice(
        `"${data.name}" has no georeference and was not added to the map. ` +
        `Open the Georeference section to align it.`
      );
      if (typeof refreshPendingRasterDropdown === 'function') refreshPendingRasterDropdown();

    } else {
      addLayer(data.layer_id, data.name || files[0].name, data.geojson, 'vector', data.filepath);
    }

    fileInput.value = '';
    _updateLabel([]);
    clearUploadNotice();

  } catch (err) {
    showUploadError('Network error: ' + err.message);
  } finally {
    setUploadLoading(false);
  }
});

function setUploadLoading(loading) {
  const btn = document.getElementById('upload-btn');
  btn.disabled = loading;
  btn.textContent = loading ? 'Uploading...' : 'Upload';
}

function showUploadError(msg) {
  const el = document.getElementById('upload-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearUploadError() {
  const el = document.getElementById('upload-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function showUploadNotice(msg) {
  const el = document.getElementById('upload-notice');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearUploadNotice() {
  const el = document.getElementById('upload-notice');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}
