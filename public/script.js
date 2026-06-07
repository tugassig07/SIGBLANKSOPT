// ============================================
// USER VIEW - GOOGLE SHEETS LIVE DATA (FIXED MARKERS)
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxWL_zJ-TML_497iusMCgSPdgWsUWe0XqrcTJb_f-w-Ob0hAVbTSisWrd-EPAWLpTps_w/exec';

let map, markerCluster, pointsData = [], filteredData = [];
let currentLayer = 'satellite', layers = {};
let heatLayer = null, heatActive = false;
let userMarker = null, userCircle = null;
let activePanel = null, filterKec = 'all', filterStatus = 'all', searchTimeout = null;
let lastSyncTime = null, isDarkMode = true;

// Color mapping for status
const colorMap = { 
    blank: '#FF3B5C',   // Merah untuk Blank Spot
    lemah: '#FFD700',   // Kuning untuk Sinyal Lemah
    sedang: '#FF8C00',  // Oranye untuk Sinyal Sedang
    baik: '#39FF14'     // Hijau untuk Sinyal Baik
};

const labelMap = { 
    blank: 'Blank Spot', 
    lemah: 'Sinyal Lemah', 
    sedang: 'Sinyal Sedang', 
    baik: 'Sinyal Baik' 
};

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
        const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`, { method: 'GET' });
        const result = await response.json();
        clearInterval(interval);
        if (progressBar) progressBar.style.width = '100%';
        
        if (result.success && result.data && result.data.length > 0) {
            pointsData = result.data.map(item => ({
                id: parseInt(item.id),
                kec: item.kec || '',
                desa: item.desa || '',
                dusun: item.dusun || '',
                lat: parseFloat(item.lat) || 0,
                lng: parseFloat(item.lng) || 0,
                status: item.status || 'blank',
                rssi: item.rssi || -70,
                provider: item.provider || '',
                populasi: parseInt(item.populasi) || 0,
                luas: item.luas || '-',
                elev: parseInt(item.elev) || 0,
                ket: item.ket || ''
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
        console.error('Fetch error:', error);
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
            showToast('Gagal mengambil data dari server', 'error');
        }
    } finally {
        setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 500);
    }
}

async function refreshData() { await fetchDataFromSheets(); }

// ========== FIXED: CREATE MARKER ICONS WITH CORRECT COLORS ==========
function getMarkerColor(status) {
    switch(status) {
        case 'blank': return '#FF3B5C';  // Merah
        case 'lemah': return '#FFD700';  // Kuning
        case 'sedang': return '#FF8C00'; // Oranye
        case 'baik': return '#39FF14';   // Hijau
        default: return '#888888';
    }
}

function getMarkerSize(status) {
    return status === 'blank' ? 38 : 34;
}

function createMarkerIcon(status, kec) {
    const color = getMarkerColor(status);
    const size = getMarkerSize(status);
    const borderColor = kec === 'Kedewan' ? '#00AAFF' : '#FF6B35';
    
    // Create SVG for marker
    const svgHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <!-- Outer ring -->
            <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" 
                    fill="${color}" fill-opacity="0.15" 
                    stroke="${borderColor}" stroke-width="2"/>
            <!-- Inner circle -->
            <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 8}" 
                    fill="${color}" stroke="#fff" stroke-width="2.5"/>
    `;
    
    // Add center icon based on status
    if (status === 'blank') {
        svgHtml += `<circle cx="${size/2}" cy="${size/2}" r="5" fill="#fff" fill-opacity="0.9"/>`;
        svgHtml += `<circle cx="${size/2}" cy="${size/2}" r="2" fill="${color}"/>`;
    } else if (status === 'lemah') {
        svgHtml += `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 14}" fill="#fff" fill-opacity="0.5"/>`;
        svgHtml += `<path d="M${size/2-5} ${size/2-3} L${size/2+5} ${size/2-3} M${size/2-4} ${size/2} L${size/2+4} ${size/2} M${size/2-3} ${size/2+3} L${size/2+3} ${size/2+3}" stroke="#fff" stroke-width="1.5" fill="none"/>`;
    } else if (status === 'sedang') {
        svgHtml += `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 14}" fill="#fff" fill-opacity="0.5"/>`;
        svgHtml += `<path d="M${size/2-4} ${size/2-2} L${size/2+4} ${size/2-2} M${size/2-4} ${size/2+2} L${size/2+4} ${size/2+2}" stroke="#fff" stroke-width="1.5" fill="none"/>`;
    } else if (status === 'baik') {
        svgHtml += `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 14}" fill="#fff" fill-opacity="0.5"/>`;
        svgHtml += `<path d="M${size/2-5} ${size/2} L${size/2-2} ${size/2+3} L${size/2+5} ${size/2-3}" stroke="#fff" stroke-width="2" fill="none"/>`;
    }
    
    svgHtml += `</svg>`;
    
    return L.divIcon({
        className: 'custom-marker',
        html: svgHtml,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
    });
}

// Alternative: Using simple colored markers (more reliable)
function createSimpleMarkerIcon(status, kec) {
    const color = getMarkerColor(status);
    const size = 30;
    
    const markerHtml = `
        <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 1px rgba(0,0,0,0.3);
        ">
            ${status === 'blank' ? '⚠️' : status === 'lemah' ? '📶' : status === 'sedang' ? '📱' : '✓'}
        </div>
    `;
    
    return L.divIcon({
        className: 'simple-marker',
        html: markerHtml,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
    });
}

// Use this simpler version if the SVG version doesn't work
const useSimpleMarkers = true; // Set to false if you want SVG markers

function makeIcon(status, kec) {
    if (useSimpleMarkers) {
        return createSimpleMarkerIcon(status, kec);
    }
    return createMarkerIcon(status, kec);
}

function popupContent(d) {
    const statusColor = getMarkerColor(d.status);
    const statusText = labelMap[d.status] || d.status;
    
    return `
        <div class="popup-title">
            <strong>${d.dusun || 'Tidak bernama'}</strong>
            <span class="popup-status" style="background:${statusColor}20;color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;margin-left:8px;">
                ${statusText}
            </span>
        </div>
        <div class="popup-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;">
            <div><span style="color:#64748B;font-size:10px;">Kecamatan</span><br><strong>${d.kec || '-'}</strong></div>
            <div><span style="color:#64748B;font-size:10px;">Desa</span><br><strong>${d.desa || '-'}</strong></div>
            <div><span style="color:#64748B;font-size:10px;">Populasi</span><br><strong>${(d.populasi || 0).toLocaleString()} jiwa</strong></div>
            <div><span style="color:#64748B;font-size:10px;">Provider</span><br><strong>${d.provider || '-'}</strong></div>
            <div><span style="color:#64748B;font-size:10px;">Elevasi</span><br><strong>${d.elev || 0} mdpl</strong></div>
            <div><span style="color:#64748B;font-size:10px;">RSSI</span><br><strong>${d.rssi || -70} dBm</strong></div>
        </div>
        <div class="popup-footer">
            <button class="popup-detail-btn" onclick="showDetail(${d.id})" style="width:100%;padding:8px;border-radius:8px;border:1px solid #00D4FF;background:transparent;color:#00D4FF;cursor:pointer;">
                Lihat Detail →
            </button>
        </div>
    `;
}

function renderMarkers(data) {
    if (!markerCluster) {
        console.error('Marker cluster not initialized');
        return;
    }
    
    markerCluster.clearLayers();
    
    if (!data || data.length === 0) {
        console.log('No data to render');
        return;
    }
    
    console.log(`Rendering ${data.length} markers with colors:`, 
        data.map(d => `${d.dusun}: ${d.status} (${getMarkerColor(d.status)})`));
    
    data.forEach(d => {
        // Skip invalid coordinates
        if (!d.lat || !d.lng || d.lat === 0 || d.lng === 0) {
            console.warn(`Invalid coordinates for ${d.dusun}: lat=${d.lat}, lng=${d.lng}`);
            return;
        }
        
        const icon = makeIcon(d.status, d.kec);
        const marker = L.marker([d.lat, d.lng], { icon: icon })
            .bindPopup(popupContent(d), { maxWidth: 280, className: 'glass-popup' })
            .bindTooltip(`${d.dusun} - ${labelMap[d.status]}`, { 
                direction: 'top', 
                offset: [0, -20], 
                className: 'custom-tooltip', 
                sticky: true,
                permanent: false
            });
        
        markerCluster.addLayer(marker);
    });
    
    console.log(`Finished rendering ${data.length} markers`);
}

function updateStats(data) {
    const blank = data.filter(d => d.status === 'blank').length;
    const lemah = data.filter(d => d.status === 'lemah').length;
    const sedang = data.filter(d => d.status === 'sedang').length;
    const baik = data.filter(d => d.status === 'baik').length;
    const total = data.length;
    
    const elements = { 
        'h-total': total, 
        'h-blankspot': blank, 
        'h-lemah': lemah, 
        'h-baik': baik, 
        'h-sedang': sedang,
        'cnt-blank': blank, 
        'cnt-lemah': lemah, 
        'cnt-sedang': sedang, 
        'cnt-baik': baik,
        'dl-blank': blank, 
        'dl-lemah': lemah, 
        'dl-sedang': sedang, 
        'dl-baik': baik,
        'badgePoints': total + ' total'
    };
    
    for (const [id, val] of Object.entries(elements)) { 
        const el = document.getElementById(id); 
        if (el) el.textContent = val; 
    }
    
    // Update progress bars
    const bars = document.querySelectorAll('.stat-float-fill');
    const pcts = total > 0 ? [blank/total*100, lemah/total*100, sedang/total*100, baik/total*100] : [0,0,0,0];
    bars.forEach((bar, i) => { if (bar) bar.style.width = pcts[i] + '%'; });
    
    // Update Kecamatan stats
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
    
    const blankLen = (blank / total) * circ;
    const lemahLen = (lemah / total) * circ;
    const sedangLen = (sedang / total) * circ;
    const baikLen = (baik / total) * circ;
    
    const db = document.getElementById('donutBlank'); 
    if (db) { db.style.strokeDasharray = `${blankLen} ${circ}`; db.style.strokeDashoffset = 0; }
    const dl = document.getElementById('donutLemah'); 
    if (dl) { dl.style.strokeDasharray = `${lemahLen} ${circ}`; dl.style.strokeDashoffset = -blankLen; }
    const ds = document.getElementById('donutSedang'); 
    if (ds) { ds.style.strokeDasharray = `${sedangLen} ${circ}`; ds.style.strokeDashoffset = -(blankLen + lemahLen); }
    const dba = document.getElementById('donutBaik'); 
    if (dba) { dba.style.strokeDasharray = `${baikLen} ${circ}`; dba.style.strokeDashoffset = -(blankLen + lemahLen + sedangLen); }
}

function renderChart(data) {
    const desaMap = {};
    data.forEach(d => { 
        if (!desaMap[d.desa]) desaMap[d.desa] = { total: 0, blank: 0 }; 
        desaMap[d.desa].total++;
        if (d.status === 'blank') desaMap[d.desa].blank++;
    });
    
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
                return `
                    <div class="bar-item">
                        <div class="bar-label" title="${desa}">${desa.length > 12 ? desa.substring(0,10)+'..' : desa}</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div>
                        </div>
                        <div class="bar-count">${d.total}</div>
                    </div>
                `;
            }).join('');
        }
    }
    
    const dc = document.getElementById('desaCount'); 
    if (dc) dc.textContent = desas.length + ' Desa';
}

function updateUI() { 
    updateStats(pointsData); 
    updateDonut(pointsData); 
    renderChart(pointsData); 
}

function filterData() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    filteredData = pointsData.filter(d => {
        const kecOk = filterKec === 'all' || d.kec === filterKec;
        const statusOk = filterStatus === 'all' || d.status === filterStatus;
        const searchOk = !search || (d.dusun && d.dusun.toLowerCase().includes(search)) || (d.desa && d.desa.toLowerCase().includes(search));
        return kecOk && statusOk && searchOk;
    });
    renderMarkers(filteredData);
    updateStats(filteredData);
    updateDonut(filteredData);
    renderChart(filteredData);
    const fs = document.getElementById('filterStats'); 
    if (fs) fs.innerHTML = `Menampilkan ${filteredData.length} dari ${pointsData.length} titik`;
}

function setFilterKec(kec, btn) { 
    filterKec = kec; 
    if (btn && btn.parentElement) btn.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); 
    if (btn) btn.classList.add('active'); 
    filterData(); 
    showToast(`Filter: ${kec === 'all' ? 'Semua' : kec}`, 'info'); 
}

function setFilterStatus(status, btn) { 
    filterStatus = status; 
    if (btn && btn.parentElement) btn.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); 
    if (btn) btn.classList.add('active'); 
    filterData(); 
    showToast(`Filter: ${status === 'all' ? 'Semua' : labelMap[status]}`, 'info'); 
}

function quickFilter(status) { 
    const statusMap = { blank: '.chip-danger', lemah: '.chip-warning', sedang: '.chip', baik: '.chip-success' };
    const btn = document.querySelector(statusMap[status]); 
    if (btn) setFilterStatus(status, btn); 
}

function resetFilters() { 
    filterKec = 'all'; 
    filterStatus = 'all'; 
    const search = document.getElementById('searchInput'); 
    if (search) search.value = ''; 
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); 
    const firstChips = document.querySelectorAll('.chip'); 
    if (firstChips[0]) firstChips[0].classList.add('active'); 
    if (firstChips[4]) firstChips[4].classList.add('active'); 
    filterData(); 
    showToast('Filter direset', 'success'); 
}

function debouncedFilter() { 
    if (searchTimeout) clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(() => filterData(), 300); 
}

function toggleHeatmap(btn) {
    if (pointsData.length === 0) { showToast('Tidak ada data untuk heatmap', 'warning'); return; }
    heatActive = !heatActive;
    if (btn) btn.classList.toggle('active');
    
    if (heatActive && map) {
        const heatPoints = filteredData.filter(d => d.status === 'blank' || d.status === 'lemah').map(d => [d.lat, d.lng, d.status === 'blank' ? 1 : 0.5]);
        if (heatPoints.length > 0) {
            if (window.heatLayer && map.hasLayer(window.heatLayer)) {
                map.removeLayer(window.heatLayer);
            }
            window.heatLayer = L.heatLayer(heatPoints, { 
                radius: 35, 
                blur: 20, 
                maxZoom: 15, 
                minOpacity: 0.3, 
                gradient: { 0.4: '#FFD700', 0.6: '#FF8C00', 0.8: '#FF3B5C' } 
            }).addTo(map);
            showToast('Heatmap aktif', 'info');
        } else { 
            showToast('Tidak ada titik blank/lemah', 'warning'); 
            heatActive = false; 
            if (btn) btn.classList.remove('active'); 
        }
    } else if (window.heatLayer && map) { 
        map.removeLayer(window.heatLayer); 
        showToast('Heatmap nonaktif', 'info'); 
    }
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
        userMarker = L.marker([lat, lng], { 
            icon: L.divIcon({ 
                className: 'user-location-marker', 
                html: `<div class="user-pulse"></div>`, 
                iconSize: [20,20], 
                iconAnchor: [10,10] 
            }) 
        }).addTo(map).bindPopup('📍 Lokasi Anda'); 
        userCircle = L.circle([lat, lng], { 
            radius: 100, 
            color: '#00D4FF', 
            fillColor: '#00D4FF', 
            fillOpacity: 0.08, 
            weight: 1.5 
        }).addTo(map); 
        map.setView([lat, lng], 15); 
        showToast('Lokasi ditemukan', 'success'); 
    }, () => showToast('Gagal mendapatkan lokasi', 'error')); 
}

function toggleDarkMode() { 
    isDarkMode = !isDarkMode; 
    const root = document.documentElement; 
    if (isDarkMode) { 
        root.style.setProperty('--bg', '#0B0F19'); 
        root.style.setProperty('--bg2', '#111827'); 
        root.style.setProperty('--text', '#F0F4F8'); 
        root.style.setProperty('--text2', '#94A3B8'); 
    } else { 
        root.style.setProperty('--bg', '#F0F4F8'); 
        root.style.setProperty('--bg2', '#FFFFFF'); 
        root.style.setProperty('--text', '#1A2332'); 
        root.style.setProperty('--text2', '#64748B'); 
    } 
    showToast(isDarkMode ? 'Mode gelap' : 'Mode terang', 'info'); 
    localStorage.setItem('darkMode', isDarkMode); 
}

function showDetail(id) { 
    const point = pointsData.find(d => d.id === id); 
    if (!point) return; 
    
    const statusColor = getMarkerColor(point.status);
    const statusText = labelMap[point.status];
    
    if (window.innerWidth <= 768) { 
        const sheet = document.getElementById('bottomSheet'); 
        const body = document.getElementById('bottomSheetBody'); 
        if (sheet && body) { 
            body.innerHTML = `
                <div class="bs-header" style="display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--glass-border);">
                    <strong>${point.dusun}</strong>
                    <span class="bs-status" style="color:${statusColor};background:${statusColor}20;padding:2px 12px;border-radius:20px;">${statusText}</span>
                </div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>Kecamatan</span><span>${point.kec || '-'}</span></div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>Desa</span><span>${point.desa || '-'}</span></div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>Populasi</span><span>${(point.populasi || 0).toLocaleString()} jiwa</span></div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>Provider</span><span>${point.provider || '-'}</span></div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>Elevasi</span><span>${point.elev || 0} mdpl</span></div>
                <div class="bs-row" style="display:flex;justify-content:space-between;padding:8px 0;"><span>RSSI</span><span>${point.rssi || -70} dBm</span></div>
                <div class="bs-note" style="padding:10px;background:rgba(255,255,255,0.04);border-radius:10px;margin:8px 0;font-style:italic;">${point.ket || 'Tidak ada keterangan'}</div>
                <button class="bs-close" onclick="closeBottomSheet()" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--glass-border);background:transparent;color:var(--text);cursor:pointer;margin-top:12px;">Tutup</button>
            `; 
            sheet.classList.add('open'); 
        } 
    } else { 
        alert(`Dusun: ${point.dusun}\nDesa: ${point.desa}\nKecamatan: ${point.kec}\nStatus: ${statusText}\nProvider: ${point.provider}\nPopulasi: ${(point.populasi || 0).toLocaleString()} jiwa\nElevasi: ${point.elev} mdpl\nRSSI: ${point.rssi} dBm\nKeterangan: ${point.ket}`); 
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

// Initialize map and load data
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing map...');
    
    // Setup map layers
    layers = { 
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
            attribution: 'Esri', 
            maxZoom: 19 
        }), 
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© OpenStreetMap', 
            maxZoom: 19 
        }) 
    };
    
    map = L.map('map', { zoomControl: false }).setView([-7.090, 111.650], 12);
    layers.satellite.addTo(map);
    
    markerCluster = L.markerClusterGroup({ 
        maxClusterRadius: 50, 
        spiderfyOnMaxZoom: true, 
        showCoverageOnHover: false, 
        iconCreateFunction: cluster => { 
            const count = cluster.getChildCount(); 
            let color = '#00D4FF'; 
            if (count > 10) color = '#FF3B5C'; 
            else if (count > 5) color = '#FFD700'; 
            return L.divIcon({ 
                html: `<div class="cluster-icon" style="background:${color};width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;position:relative;">
                        <span>${count}</span>
                        <div class="cluster-pulse" style="position:absolute;width:100%;height:100%;border-radius:50%;animation:cluster-pulse 1.5s infinite;background:${color}"></div>
                      </div>`, 
                className: 'marker-cluster-custom', 
                iconSize: [42,42], 
                iconAnchor: [21,21] 
            }); 
        } 
    });
    map.addLayer(markerCluster);
    
    // Add boundary polygons
    L.polygon([[-7.095,111.620],[-7.100,111.645],[-7.108,111.660],[-7.115,111.655],[-7.128,111.648],[-7.135,111.630],[-7.130,111.615],[-7.120,111.608],[-7.108,111.610],[-7.095,111.620]], { 
        color:'#00AAFF', 
        fillColor:'#00AAFF', 
        fillOpacity:0.06, 
        weight:2, 
        dashArray:'8,4' 
    }).addTo(map);
    
    L.polygon([[-7.072,111.640],[-7.073,111.670],[-7.085,111.695],[-7.098,111.690],[-7.107,111.680],[-7.108,111.660],[-7.100,111.645],[-7.095,111.620],[-7.080,111.625],[-7.072,111.640]], { 
        color:'#FF6B35', 
        fillColor:'#FF6B35', 
        fillOpacity:0.06, 
        weight:2, 
        dashArray:'8,4' 
    }).addTo(map);
    
    // Set active layer button
    const layerSat = document.getElementById('layerSat');
    if (layerSat) layerSat.classList.add('active');
    
    // Load dark mode preference
    const savedDark = localStorage.getItem('darkMode'); 
    if (savedDark === 'false') toggleDarkMode();
    
    // Fetch data
    fetchDataFromSheets();
    
    // Auto refresh every 5 minutes
    setInterval(() => fetchDataFromSheets(), 5 * 60 * 1000);
    
    // Fix map size
    setTimeout(() => {
        if (map) map.invalidateSize();
        console.log('Map invalidated size');
    }, 100);
    
    // Close panels when clicking on map
    map.on('click', () => { 
        if (activePanel) togglePanel(activePanel); 
        closeBottomSheet(); 
    });
    
    // Escape key handler
    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') { 
            if (activePanel) togglePanel(activePanel); 
            closeBottomSheet(); 
            closeSidebar(); 
        } 
    });
    
    console.log('Map initialization complete');
});

// Export functions for global access
window.refreshData = refreshData;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.togglePanel = togglePanel;
window.setFilterKec = setFilterKec;
window.setFilterStatus = setFilterStatus;
window.resetFilters = resetFilters;
window.quickFilter = quickFilter;
window.toggleHeatmap = toggleHeatmap;
window.setLayer = setLayer;
window.resetView = resetView;
window.locateUser = locateUser;
window.toggleDarkMode = toggleDarkMode;
window.exportToCSV = exportToCSV;
window.showDetail = showDetail;
window.closeBottomSheet = closeBottomSheet;
