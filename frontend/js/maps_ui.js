(function initMapsUI(){
  async function fetchMaps() {
    const resp = await fetch('/api/maps/list');
    if (!resp.ok) {
      console.error('Failed to fetch maps');
      return [];
    }
    const data = await resp.json();
    return data.files || [];
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1024/1024).toFixed(2) + ' MB';
  }

  async function render() {
    const container = document.getElementById('saved-maps-list');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-muted)">Loading...</div>';
    const files = await fetchMaps();
    if (!files.length) {
      container.innerHTML = '<div class="empty-msg">No saved maps</div>';
      return;
    }
    container.innerHTML = '';
    files.forEach(f => {
      const el = document.createElement('div');
      el.className = 'layer-item';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="flex:1"><strong>${f.filename}</strong><div style="font-size:11px;color:var(--text-muted)">${f.metadata?.project?.projectName || ''}</div></div><div style="text-align:right"><div style="font-size:11px;color:var(--text-muted)">${humanSize(f.size)}</div><div style="margin-top:6px"><a href="${f.url}" target="_blank" class="btn-secondary">Download</a></div></div></div>`;
      container.appendChild(el);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('saved-maps-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', render);
    render();
  });
})();
