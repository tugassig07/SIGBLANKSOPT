// ============================================
// USER VIEW - GOOGLE SHEETS LIVE DATA
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbwqsfXXu2FoT_kxS17sICM9kaicUEkGGXk6cDp6zUGwOrKstvSf5TNkVPjbL9WOBd7jSQ/exec';

let map, markerCluster, pointsData = [], filteredData = [];
let currentLayer = 'satellite', layers = {};
let heatLayer = null, heatActive = false;
let userMarker = null, userCircle = null;
let activePanel = null, filterKec = 'all', filterStatus = 'all', searchTimeout = null;
let lastSyncTime = null, isDarkMode = true;

const colorMap = { blank: '#FF3B5C', lemah: '#FFD700', sedang: '#FF8C00', baik: '#39FF14' };
const labelMap = { blank: 'Blank Spot', lemah: 'Sinyal Lemah', sedang: 'Sinyal Sedang', baik: 'Sinyal Baik' };

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-icon">${type === 'success' ? '✓' : 'ℹ'}</div><div class="toast-message">${msg}</div>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function updateStatusBar(status, message) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (!dot || !text) return;
  dot.className = 'status-dot';
  if (status === 'loading') { dot.classList.add('loading'); text.innerHTML = '⏳ ' + message; }
  else if (status === 'success') { dot.classList.add('success'); text.innerHTML = '✓ ' + message; }
  else if (status === 'warning') { dot.classList.add('warning'); text.innerHTML = '⚠ ' + message; }
  else { dot.classList.add('error'); text.innerHTML = '✗ ' + message; }
}

async function fetchDataFromSheets() {
  const overlay = document.getElementById('loadingOverlay');
  const progressBar = document.getElementById('loadingProgressBar');
  if (overlay) overlay.style.display = 'flex';
  let progress = 0;
  const interval = setInterval(() => { progress += 10; if (progressBar) progressBar.style.width = Math.min(progress, 90) + '%'; if (progress >= 90) clearInterval(interval); }, 100);
  
  try {
    updateStatusBar('loading', 'Mengambil data...');
    const response = await fetch(API_URL);
    const result = await response.json();
    clearInterval(interval);
    if (progressBar) progressBar.style.width = '100%';
    
    if (result.success && result.data && result.data.length > 0) {
      pointsData = result.data.map(item => ({
        id: parseInt(item.id), kec: item.kec, desa: item.desa, dusun: item.dusun,
        lat: parseFloat(item.lat), lng: parseFloat(item.lng), status: item.status,
        rssi: item.rssi, provider: item.provider, populasi: parseInt(item.populasi),
        luas: item.luas || '-', elev: parseInt(item.elev) || 0, ket: item.ket || ''
      }));
      filteredData = [...pointsData];
      lastSyncTime = new Date();
      localStorage.setItem('cachedData', JSON.stringify(pointsData));
      updateUI();
      renderMarkers(filteredData);
      updateStatusBar('success', `${pointsData.length} titik siap`);
      showToast(`Berhasil mengambil ${pointsData.length} data`, 'success');
    } else {
      pointsData = [];
      filteredData = [];
      updateUI();
      renderMarkers([]);
      updateStatusBar('warning', 'Belum ada data (kosong)');
    }
    
    const lastUpdateSpan = document.getElementById('lastUpdate');
    const badgeLastSync = document.getElementById('badgeLastSync');
    if (lastUpdateSpan) lastUpdateSpan.textContent = `Update: ${new Date().toLocaleTimeString()}`;
    if (badgeLastSync) badgeLastSync.textContent = lastSyncTime ? lastSyncTime.toLocaleTimeString() : '-';
    
  } catch (error) {
    const cached = localStorage.getItem('cachedData');
    if (cached && JSON.parse(cached).length > 0) {
      pointsData = JSON.parse(cached);
      filteredData = [...pointsData];
      updateUI();
      renderMarkers(filteredData);
      updateStatusBar('warning', 'Menggunakan data cache');
      showToast('Gagal mengambil data baru, menggunakan cache', 'warning');
    } else {
      pointsData = [];
      filteredData = [];
      updateUI();
      renderMarkers([]);
      updateStatusBar('error', 'Gagal mengambil data');
    }
  } finally {
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 500);
  }
}

async function refreshData() { await fetchDataFromSheets(); }

function makeIcon(status, kec) {
  const c = colorMap[status] || '#888';
  const border = kec === 'Kedewan' ? '#00AAFF' : '#FF6B35';
  const size = status === 'blank' ? 36 : 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${c}" fill-opacity="0.15" stroke="${border}" stroke-width="1.5"/><circle cx="${size/2}" cy="${size/2}" r="${size/2-6}" fill="${c}" stroke="#fff" stroke-width="2"/>${status === 'blank' ? `<circle cx="${size/2}" cy="${size/2}" r="3" fill="#fff" fill-opacity="0.8"/>` : `<circle cx="${size/2}" cy="${size/2}" r="${size/2-10}" fill="#fff" fill-opacity="0.5"/>`}</svg>`;
  return L.divIcon({ className: 'custom-marker', html: svg, iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2] });
}

function popupContent(d) {
  return `<div class="popup-title">${d.dusun}<span class="popup-status" style="background:${colorMap[d.status]}20;color:${colorMap[d.status]}">${labelMap[d.status]}</span></div><div class="popup-grid"><div class="popup-grid-item"><span class="popup-grid-label">Kecamatan</span><span>${d.kec}</span></div><div class="popup-grid-item"><span class="popup-grid-label">Desa</span><span>${d.desa}</span></div><div class="popup-grid-item"><span class="popup-grid-label">Populasi</span><span>${d.populasi} jiwa</span></div><div class="popup-grid-item"><span class="popup-grid-label">Elevasi</span><span>${d.elev} mdpl</span></div></div><div class="popup-footer"><button class="popup-detail-btn" onclick="showDetail(${d.id})">Lihat Detail →</button></div>`;
}

function renderMarkers(data) {
  if (!markerCluster) return;
  markerCluster.clearLayers();
  if (!data || data.length === 0) return;
  data.forEach(d => {
    const m = L.marker([d.lat, d.lng], { icon: makeIcon(d.status, d.kec) })
      .bindPopup(popupContent(d), { maxWidth: 280, className: 'glass-popup' })
      .bindTooltip(`<strong>${d.dusun}</strong><br><span style="color:${colorMap[d.status]}">● ${labelMap[d.status]}</span>`, { direction: 'top', offset: [0, -20], className: 'custom-tooltip', sticky: true });
    markerCluster.addLayer(m);
  });
}

function updateStats(data) {
  const blank = data.filter(d => d.status === 'blank').length;
  const lemah = data.filter(d => d.status === 'lemah').length;
  const sedang = data.filter(d => d.status === 'sedang').length;
  const baik = data.filter(d => d.status === 'baik').length;
  const total = data.length;
  
  const elements = { 
    'h-total': total, 'h-blankspot': blank, 'h-lemah': lemah, 'h-baik': baik, 'h-sedang': sedang,
    'cnt-blank': blank, 'cnt-lemah': lemah, 'cnt-sedang': sedang, 'cnt-baik': baik,
    'dl-blank': blank, 'dl-lemah': lemah, 'dl-sedang': sedang, 'dl-baik': baik,
    'badgePoints': total + ' total'
  };
  for (const [id, val] of Object.entries(elements)) { const el = document.getElementById(id); if (el) el.textContent = val; }
  
  const bars = document.querySelectorAll('.stat-float-fill');
  const pcts = total > 0 ? [blank/total*100, lemah/total*100, sedang/total*100, baik/total*100] : [0,0,0,0];
  bars.forEach((bar, i) => { if (bar) bar.style.width = pcts[i] + '%'; });
  
  const kedBlank = data.filter(d => d.kec === 'Kedewan' && d.status === 'blank').length;
  const kasBlank = data.filter(d => d.kec === 'Kasiman' && d.status === 'blank').length;
  const sk = document.getElementById('s-kedewan-blank'); if (sk) sk.textContent = kedBlank;
  const ska = document.getElementById('s-kasiman-blank'); if (ska) ska.textContent = kasBlank;
}

function updateDonut(data) {
  const total = data.length || 1;
  const blank = data.filter(d => d.status === 'blank').length;
  const lemah = data.filter(d => d.status === 'lemah').length;
  const sedang = data.filter(d => d.status === 'sedang').length;
  const baik = data.filter(d => d.status === 'baik').length;
  const circ = 251.2;
  const blankLen = (blank / total) * circ, lemahLen = (lemah / total) * circ, sedangLen = (sedang / total) * circ, baikLen = (baik / total) * circ;
  const db = document.getElementById('donutBlank'); if (db) { db.style.strokeDasharray = `${blankLen} ${circ}`; db.style.strokeDashoffset = 0; }
  const dl = document.getElementById('donutLemah'); if (dl) { dl.style.strokeDasharray = `${lemahLen} ${circ}`; dl.style.strokeDashoffset = -blankLen; }
  const ds = document.getElementById('donutSedang'); if (ds) { ds.style.strokeDasharray = `${sedangLen} ${circ}`; ds.style.strokeDashoffset = -(blankLen + lemahLen); }
  const dba = document.getElementById('donutBaik'); if (dba) { dba.style.strokeDasharray = `${baikLen} ${circ}`; dba.style.strokeDashoffset = -(blankLen + lemahLen + sedangLen); }
}

function renderChart(data) {
  const desaMap = {};
  data.forEach(d => { if (!desaMap[d.desa]) desaMap[d.desa] = { total: 0 }; desaMap[d.desa].total++; });
  const desas = Object.keys(desaMap);
  const maxTotal = Math.max(...desas.map(k => desaMap[k].total), 1);
  const container = document.getElementById('miniChart');
  if (container) {
    if (desas.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text3);">Belum ada data</div>`;
    } else {
      container.innerHTML = desas.slice(0, 10).map(desa => {
        const d = desaMap[desa];
        const pct = Math.round((d.total / maxTotal) * 100);
        return `<div class="bar-item"><div class="bar-label" title="${desa}">${desa.length > 12 ? desa.substring(0,10)+'..' : desa}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div></div><div class="bar-count">${d.total}</div></div>`;
      }).join('');
    }
  }
  const dc = document.getElementById('desaCount'); if (dc) dc.textContent = desas.length + ' Desa';
}

function updateUI() { updateStats(pointsData); updateDonut(pointsData); renderChart(pointsData); }

function filterData() {
  const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
  filteredData = pointsData.filter(d => {
    const kecOk = filterKec === 'all' || d.kec === filterKec;
    const statusOk = filterStatus === 'all' || d.status === filterStatus;
    const searchOk = !search || d.dusun.toLowerCase().includes(search) || d.desa.toLowerCase().includes(search);
    return kecOk && statusOk && searchOk;
  });
  renderMarkers(filteredData);
  updateStats(filteredData);
  updateDonut(filteredData);
  renderChart(filteredData);
  const fs = document.getElementById('filterStats'); if (fs) fs.innerHTML = `Menampilkan ${filteredData.length} dari ${pointsData.length} titik`;
}

function setFilterKec(kec, btn) { filterKec = kec; if (btn?.parentElement) btn.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); if (btn) btn.classList.add('active'); filterData(); showToast(`Filter: ${kec === 'all' ? 'Semua' : kec}`, 'info'); }
function setFilterStatus(status, btn) { filterStatus = status; if (btn?.parentElement) btn.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); if (btn) btn.classList.add('active'); filterData(); showToast(`Filter: ${status === 'all' ? 'Semua' : labelMap[status]}`, 'info'); }
function quickFilter(status) { const map = { blank: '.chip-danger', lemah: '.chip-warning', sedang: '.chip', baik: '.chip-success' }; const btn = document.querySelector(map[status]); if (btn) setFilterStatus(status, btn); }
function resetFilters() { filterKec = 'all'; filterStatus = 'all'; const search = document.getElementById('searchInput'); if (search) search.value = ''; document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); const firstChips = document.querySelectorAll('.chip'); if (firstChips[0]) firstChips[0].classList.add('active'); if (firstChips[4]) firstChips[4].classList.add('active'); filterData(); showToast('Filter direset', 'success'); }
function debouncedFilter() { if (searchTimeout) clearTimeout(searchTimeout); searchTimeout = setTimeout(() => filterData(), 300); }

function toggleHeatmap(btn) {
  if (pointsData.length === 0) { showToast('Tidak ada data untuk heatmap', 'warning'); return; }
  heatActive = !heatActive;
  if (btn) btn.classList.toggle('active');
  if (heatActive && map) {
    const heatPoints = filteredData.filter(d => d.status === 'blank' || d.status === 'lemah').map(d => [d.lat, d.lng, d.status === 'blank' ? 1 : 0.5]);
    if (heatPoints.length > 0) {
      heatLayer = L.heatLayer(heatPoints, { radius: 35, blur: 20, maxZoom: 15, minOpacity: 0.3, gradient: { 0.4: '#FFD700', 0.6: '#FF8C00', 0.8: '#FF3B5C' } }).addTo(map);
      showToast('Heatmap aktif', 'info');
    } else { showToast('Tidak ada titik blank/lemah', 'warning'); heatActive = false; if (btn) btn.classList.remove('active'); }
  } else if (heatLayer && map) { map.removeLayer(heatLayer); showToast('Heatmap nonaktif', 'info'); }
}

function setLayer(name, btn) {
  if (!map || !layers[currentLayer]) return;
  map.removeLayer(layers[currentLayer]);
  layers[name].addTo(map);
  currentLayer = name;
  document.querySelectorAll('.map-control-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  showToast(`Layer: ${name === 'satellite' ? 'Satelit' : 'Peta Jalan'}`, 'info');
}

function resetView() { if (map) { map.setView([-7.090, 111.650], 12); showToast('Tampilan direset', 'info'); } }
function locateUser() { 
  if (!navigator.geolocation) { showToast('Geolokasi tidak didukung', 'error'); return; } 
  showToast('Mendapatkan lokasi...', 'info'); 
  navigator.geolocation.getCurrentPosition(pos => { 
    const { latitude: lat, longitude: lng } = pos.coords; 
    if (userMarker) map.removeLayer(userMarker); 
    if (userCircle) map.removeLayer(userCircle); 
    userMarker = L.marker([lat, lng], { icon: L.divIcon({ className: 'user-location-marker', html: `<div class="user-pulse"></div>`, iconSize: [20,20], iconAnchor: [10,10] }) }).addTo(map).bindPopup('📍 Lokasi Anda'); 
    userCircle = L.circle([lat, lng], { radius: 100, color: '#00D4FF', fillColor: '#00D4FF', fillOpacity: 0.08, weight: 1.5 }).addTo(map); 
    map.setView([lat, lng], 15); 
    showToast('Lokasi ditemukan', 'success'); 
  }, () => showToast('Gagal mendapatkan lokasi', 'error')); 
}
function toggleDarkMode() { 
  isDarkMode = !isDarkMode; 
  const root = document.documentElement; 
  if (isDarkMode) { 
    root.style.setProperty('--bg', '#0B0F19'); root.style.setProperty('--bg2', '#111827'); 
    root.style.setProperty('--text', '#F0F4F8'); root.style.setProperty('--text2', '#94A3B8'); 
  } else { 
    root.style.setProperty('--bg', '#F0F4F8'); root.style.setProperty('--bg2', '#FFFFFF'); 
    root.style.setProperty('--text', '#1A2332'); root.style.setProperty('--text2', '#64748B'); 
  } 
  showToast(isDarkMode ? 'Mode gelap' : 'Mode terang', 'info'); 
  localStorage.setItem('darkMode', isDarkMode); 
}
function showDetail(id) { 
  const point = pointsData.find(d => d.id === id); 
  if (!point) return; 
  if (window.innerWidth <= 768) { 
    const sheet = document.getElementById('bottomSheet'); 
    const body = document.getElementById('bottomSheetBody'); 
    if (sheet && body) { 
      body.innerHTML = `<div class="bs-header"><strong>${point.dusun}</strong><span class="bs-status" style="color:${colorMap[point.status]}">● ${labelMap[point.status]}</span></div><div class="bs-row"><span>Kecamatan</span><span>${point.kec}</span></div><div class="bs-row"><span>Desa</span><span>${point.desa}</span></div><div class="bs-row"><span>Populasi</span><span>${point.populasi} jiwa</span></div><div class="bs-row"><span>Elevasi</span><span>${point.elev} mdpl</span></div><div class="bs-row"><span>Provider</span><span>${point.provider}</span></div><div class="bs-note">${point.ket}</div><button class="bs-close" onclick="closeBottomSheet()">Tutup</button>`; 
      sheet.classList.add('open'); 
    } 
  } else { 
    alert(`Dusun: ${point.dusun}\nDesa: ${point.desa}\nKecamatan: ${point.kec}\nStatus: ${labelMap[point.status]}\nProvider: ${point.provider}\nPopulasi: ${point.populasi} jiwa\nElevasi: ${point.elev} mdpl\nKeterangan: ${point.ket}`); 
  } 
}
function closeBottomSheet() { const sheet = document.getElementById('bottomSheet'); if (sheet) sheet.classList.remove('open'); }
function togglePanel(name) { 
  const panel = document.getElementById('panel-' + name); 
  if (activePanel === name && panel) { panel.style.display = 'none'; activePanel = null; } 
  else { document.querySelectorAll('.glass-panel').forEach(p => { if (p) p.style.display = 'none'; }); if (panel) panel.style.display = 'flex'; activePanel = name; } 
}
function toggleSidebar() { const sidebar = document.getElementById('sidebar'); const overlay = document.getElementById('sidebarOverlay'); if (sidebar && overlay) { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); } }
function closeSidebar() { const sidebar = document.getElementById('sidebar'); const overlay = document.getElementById('sidebarOverlay'); if (sidebar && overlay) { sidebar.classList.remove('open'); overlay.classList.remove('open'); } }
function exportToCSV() { 
  if (filteredData.length === 0) { showToast('Tidak ada data untuk diexport', 'warning'); return; }
  const headers = ['ID','Kecamatan','Desa','Dusun','Latitude','Longitude','Status','RSSI','Provider','Populasi','Luas','Elevasi','Keterangan']; 
  const rows = filteredData.map(p => [p.id, p.kec, p.desa, p.dusun, p.lat, p.lng, p.status, p.rssi || 'N/A', p.provider, p.populasi, p.luas, p.elev, p.ket]); 
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n'); 
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' }); 
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); 
  link.download = `blank-spot-${new Date().toISOString().slice(0,10)}.csv`; 
  link.click(); URL.revokeObjectURL(link.href); 
  showToast(`${filteredData.length} data diexport`, 'success'); 
}

document.addEventListener('DOMContentLoaded', () => {
  layers = { satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri', maxZoom: 19 }), osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }) };
  map = L.map('map', { zoomControl: false }).setView([-7.090, 111.650], 12);
  layers.satellite.addTo(map);
  markerCluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false, iconCreateFunction: cluster => { const count = cluster.getChildCount(); let color = '#00D4FF'; if (count > 10) color = '#FF3B5C'; else if (count > 5) color = '#FFD700'; return L.divIcon({ html: `<div class="cluster-icon" style="background:${color};"><span>${count}</span><div class="cluster-pulse" style="background:${color}"></div></div>`, className: 'marker-cluster-custom', iconSize: [42,42], iconAnchor: [21,21] }); } });
  map.addLayer(markerCluster);
  L.polygon([[-7.095,111.620],[-7.100,111.645],[-7.108,111.660],[-7.115,111.655],[-7.128,111.648],[-7.135,111.630],[-7.130,111.615],[-7.120,111.608],[-7.108,111.610],[-7.095,111.620]], { color:'#00AAFF', fillColor:'#00AAFF', fillOpacity:0.06, weight:2, dashArray:'8,4' }).addTo(map);
  L.polygon([[-7.072,111.640],[-7.073,111.670],[-7.085,111.695],[-7.098,111.690],[-7.107,111.680],[-7.108,111.660],[-7.100,111.645],[-7.095,111.620],[-7.080,111.625],[-7.072,111.640]], { color:'#FF6B35', fillColor:'#FF6B35', fillOpacity:0.06, weight:2, dashArray:'8,4' }).addTo(map);
  document.getElementById('layerSat')?.classList.add('active');
  const savedDark = localStorage.getItem('darkMode'); if (savedDark === 'false') toggleDarkMode();
  fetchDataFromSheets();
  setInterval(() => fetchDataFromSheets(), 5 * 60 * 1000);
  setTimeout(() => map?.invalidateSize(), 100);
  map.on('click', () => { if (activePanel) togglePanel(activePanel); closeBottomSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (activePanel) togglePanel(activePanel); closeBottomSheet(); closeSidebar(); } });
});
