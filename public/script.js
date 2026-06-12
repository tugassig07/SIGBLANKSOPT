// ============================================
// SIG BLANK SPOT INTERNET 2026
// TEMAYANG & GONDANG, BOJONEGORO
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxWL_zJ-TML_497iusMCgSPdgWsUWe0XqrcTJb_f-w-Ob0hAVbTSisWrd-EPAWLpTps_w/exec';

let map, markerCluster, pointsData = [], filteredData = [];
let currentLayer = 'satellite', layers = {};
let heatLayer = null, heatActive = false;
let userMarker = null, userCircle = null;
let activePanel = null, filterKec = 'all', filterStatus = 'all', searchTimeout = null;
let lastSyncTime = null, isDarkMode = true;
let boundaryLayers = [];

// Color mapping for status
const colorMap = { 
    blank: '#FF3B5C',
    lemah: '#FFD700',
    sedang: '#FF8C00',
    baik: '#39FF14'
};

const labelMap = { 
    blank: 'Blank Spot', 
    lemah: 'Sinyal Lemah', 
    sedang: 'Sinyal Sedang', 
    baik: 'Sinyal Baik' 
};

// ============================================
// DAFTAR DESA PER KECAMATAN
// ============================================

// Kecamatan Temayang (12 desa)
const temayangDesa = [
    'Bakulan', 'Belun', 'Buntalan', 'Jono', 'Kedungsari', 
    'Kedungsumber', 'Ngujung', 'Pancur', 'Soko', 'Sugihwaras', 'Temayang'
];

// Kecamatan Gondang (7 desa)
const gondangDesa = [
    'Gondang', 'Jari', 'Krondonan', 'Pajeng', 'Pragelan', 'Sambongrejo'
];

// ============================================
// KOORDINAT DESA (Titik referensi untuk membentuk polygon)
// ============================================

// Koordinat desa di Kecamatan Temayang
const temayangCoordinates = [
    { desa: 'Soko', lat: -7.422083, lng: 111.929442 },
    { desa: 'Kedungsumber', lat: -7.348792, lng: 111.902089 },
    { desa: 'Bakulan', lat: -7.355000, lng: 111.885000 },
    { desa: 'Belun', lat: -7.368000, lng: 111.878000 },
    { desa: 'Buntalan', lat: -7.382000, lng: 111.890000 },
    { desa: 'Jono', lat: -7.395000, lng: 111.898000 },
    { desa: 'Kedungsari', lat: -7.338000, lng: 111.895000 },
    { desa: 'Ngujung', lat: -7.372000, lng: 111.910000 },
    { desa: 'Pancur', lat: -7.405000, lng: 111.915000 },
    { desa: 'Sugihwaras', lat: -7.358000, lng: 111.870000 },
    { desa: 'Temayang', lat: -7.365000, lng: 111.895000 }
];

// Koordinat desa di Kecamatan Gondang
const gondangCoordinates = [
    { desa: 'Jari', lat: -7.405636, lng: 111.817664 },
    { desa: 'Pragelan', lat: -7.395694, lng: 111.792511 },
    { desa: 'Gondang', lat: -7.385000, lng: 111.835000 },
    { desa: 'Krondonan', lat: -7.378000, lng: 111.845000 },
    { desa: 'Pajeng', lat: -7.392000, lng: 111.825000 },
    { desa: 'Sambongrejo', lat: -7.370000, lng: 111.810000 }
];

// ============================================
// MEMBANGUN POLYGON MENYELURUH (Convex Hull)
// ============================================

// Fungsi untuk menghitung convex hull (Graham Scan)
// Menghasilkan polygon yang mengelilingi SEMUA titik
function convexHull(points) {
    if (points.length < 3) return points.slice();
    
    // Clone points
    let pts = points.map(p => ({ lat: p.lat, lng: p.lng, desa: p.desa }));
    
    // Cari titik dengan lat terendah (paling selatan)
    let start = pts.reduce((min, p) => p.lat < min.lat ? p : min, pts[0]);
    
    // Hitung sudut dari titik start
    function angle(p) {
        return Math.atan2(p.lat - start.lat, p.lng - start.lng);
    }
    
    // Sort berdasarkan sudut
    let sorted = pts.slice();
    sorted.sort((a, b) => angle(a) - angle(b));
    
    // Graham Scan - membangun convex hull
    let hull = [];
    for (let i = 0; i < sorted.length; i++) {
        while (hull.length >= 2) {
            let a = hull[hull.length - 2];
            let b = hull[hull.length - 1];
            let c = sorted[i];
            let cross = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
            if (cross <= 0) break;
            hull.pop();
        }
        hull.push(sorted[i]);
    }
    
    return hull;
}

// Fungsi untuk memperluas polygon (membuat batas wilayah)
function expandPolygon(points, expansionKm = 2.0) {
    if (points.length < 3) return points;
    
    // Konversi km ke derajat (1 derajat ≈ 111 km)
    const expansionDeg = expansionKm / 111;
    
    // Hitung centroid
    let centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    let centerLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    
    // Ekspansi setiap titik menjauh dari centroid
    return points.map(p => ({
        lat: centerLat + (p.lat - centerLat) * (1 + expansionDeg * 2.5),
        lng: centerLng + (p.lng - centerLng) * (1 + expansionDeg * 2.5)
    }));
}

// Bangun polygon menyeluruh untuk Temayang
let temayangHull = convexHull(temayangCoordinates);
temayangHull = expandPolygon(temayangHull, 2.2);
const temayangPolygonPoints = temayangHull.map(p => [p.lat, p.lng]);

// Bangun polygon menyeluruh untuk Gondang
let gondangHull = convexHull(gondangCoordinates);
gondangHull = expandPolygon(gondangHull, 2.0);
const gondangPolygonPoints = gondangHull.map(p => [p.lat, p.lng]);

// Toast notification
function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-icon">${type === 'success' ? '✓' : 'ℹ'}</div><div class="toast-message">${msg}</div>`;
    container.appendChild(toast);
    setTimeout(() => { 
        toast.classList.add('fade-out'); 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

function updateStatusBar(status, message) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;
    dot.className = 'status-dot';
    if (status === 'loading') { 
        dot.classList.add('loading'); 
        text.innerHTML = '⏳ ' + message; 
    } else if (status === 'success') { 
        dot.classList.add('success'); 
        text.innerHTML = '✓ ' + message; 
    } else if (status === 'warning') { 
        dot.classList.add('warning'); 
        text.innerHTML = '⚠ ' + message; 
    } else { 
        dot.classList.add('error'); 
        text.innerHTML = '✗ ' + message; 
    }
}

// Fungsi untuk mendapatkan titik tengah polygon
function getPolygonCenter(points) {
    if (!points || points.length === 0) return { lat: 0, lng: 0 };
    let sumLat = 0, sumLng = 0;
    for (let i = 0; i < points.length; i++) {
        sumLat += points[i][0];
        sumLng += points[i][1];
    }
    return {
        lat: sumLat / points.length,
        lng: sumLng / points.length
    };
}

// Add boundary polygons (menyeluruh)
function addBoundaryPolygons() {
    // Clear existing boundaries if any
    boundaryLayers.forEach(layer => {
        if (map && layer) map.removeLayer(layer);
    });
    boundaryLayers = [];
    
    // ============================================
    // POLYGON MENYELURUH KECAMATAN TEMAYANG
    // ============================================
    const temayangPolygon = L.polygon(temayangPolygonPoints, {
        color: '#00AAFF',
        fillColor: '#00AAFF',
        fillOpacity: 0.08,
        weight: 2.5,
        opacity: 0.9,
        smoothFactor: 0.5,
        className: 'kecamatan-polygon'
    }).bindPopup(`
        <div style="text-align:left; min-width:220px; max-width:280px;">
            <div style="text-align:center; border-bottom:2px solid #00AAFF; padding-bottom:10px; margin-bottom:12px;">
                <strong style="color:#00AAFF; font-size:16px;">🏘️ KECAMATAN TEMAYANG</strong><br>
                <span style="font-size:11px; color:#888;">Kabupaten Bojonegoro, Jawa Timur</span>
            </div>
            <div style="margin-bottom:12px;">
                <span style="background:#00AAFF20; color:#00AAFF; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:500;">
                    📊 TOTAL 12 DESA
                </span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; max-height:220px; overflow-y:auto; padding-right:4px;">
                ${temayangDesa.map(desa => `<div style="padding:5px 4px; border-bottom:1px solid rgba(0,170,255,0.15);">📍 ${desa}</div>`).join('')}
            </div>
            <div style="margin-top:12px; padding-top:8px; border-top:1px solid rgba(0,170,255,0.3); font-size:10px; color:#888; text-align:center;">
                Klik di luar popup untuk menutup
            </div>
        </div>
    `);
    temayangPolygon.addTo(map);
    boundaryLayers.push(temayangPolygon);
    
    // Label untuk Temayang (di tengah polygon)
    const temayangCenter = getPolygonCenter(temayangPolygonPoints);
    const temayangLabel = L.marker([temayangCenter.lat, temayangCenter.lng], {
        icon: L.divIcon({
            className: 'kecamatan-label',
            html: `<div style="background:rgba(0,170,255,0.9); backdrop-filter:blur(4px); padding:6px 16px; border-radius:30px; font-size:12px; font-weight:700; white-space:nowrap; box-shadow:0 2px 12px rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.25); letter-spacing:0.5px;">
                    📍 KECAMATAN TEMAYANG
                   </div>`,
            iconSize: [180, 30],
            iconAnchor: [90, 15]
        })
    });
    temayangLabel.addTo(map);
    boundaryLayers.push(temayangLabel);
    
    // ============================================
    // POLYGON MENYELURUH KECAMATAN GONDANG
    // ============================================
    const gondangPolygon = L.polygon(gondangPolygonPoints, {
        color: '#FF6B35',
        fillColor: '#FF6B35',
        fillOpacity: 0.08,
        weight: 2.5,
        opacity: 0.9,
        smoothFactor: 0.5,
        className: 'kecamatan-polygon'
    }).bindPopup(`
        <div style="text-align:left; min-width:200px; max-width:250px;">
            <div style="text-align:center; border-bottom:2px solid #FF6B35; padding-bottom:10px; margin-bottom:12px;">
                <strong style="color:#FF6B35; font-size:16px;">🏘️ KECAMATAN GONDANG</strong><br>
                <span style="font-size:11px; color:#888;">Kabupaten Bojonegoro, Jawa Timur</span>
            </div>
            <div style="margin-bottom:12px;">
                <span style="background:#FF6B3520; color:#FF6B35; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:500;">
                    📊 TOTAL 7 DESA
                </span>
            </div>
            <div style="display:grid; grid-template-columns:1fr; gap:6px; font-size:11px; max-height:200px; overflow-y:auto; padding-right:4px;">
                ${gondangDesa.map(desa => `<div style="padding:5px 4px; border-bottom:1px solid rgba(255,107,53,0.15);">📍 ${desa}</div>`).join('')}
            </div>
            <div style="margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,107,53,0.3); font-size:10px; color:#888; text-align:center;">
                Klik di luar popup untuk menutup
            </div>
        </div>
    `);
    gondangPolygon.addTo(map);
    boundaryLayers.push(gondangPolygon);
    
    // Label untuk Gondang (di tengah polygon)
    const gondangCenter = getPolygonCenter(gondangPolygonPoints);
    const gondangLabel = L.marker([gondangCenter.lat, gondangCenter.lng], {
        icon: L.divIcon({
            className: 'kecamatan-label',
            html: `<div style="background:rgba(255,107,53,0.9); backdrop-filter:blur(4px); padding:6px 16px; border-radius:30px; font-size:12px; font-weight:700; white-space:nowrap; box-shadow:0 2px 12px rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.25); letter-spacing:0.5px;">
                    📍 KECAMATAN GONDANG
                   </div>`,
            iconSize: [170, 30],
            iconAnchor: [85, 15]
        })
    });
    gondangLabel.addTo(map);
    boundaryLayers.push(gondangLabel);
    
    console.log('Comprehensive polygons added for Temayang (12 desa) and Gondang (7 desa)');
    console.log('Temayang polygon points:', temayangPolygonPoints.length);
    console.log('Gondang polygon points:', gondangPolygonPoints.length);
}

// Fetch data from Google Sheets
async function fetchDataFromSheets() {
    const overlay = document.getElementById('loadingOverlay');
    const progressBar = document.getElementById('loadingProgressBar');
    if (overlay) overlay.style.display = 'flex';
    let progress = 0;
    const interval = setInterval(() => { 
        progress += 10; 
        if (progressBar) progressBar.style.width = Math.min(progress, 90) + '%'; 
        if (progress >= 90) clearInterval(interval); 
    }, 100);
    
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
            updateStatusBar('warning', 'Belum ada data dari server');
            showToast('Belum ada data, silahkan input data terlebih dahulu', 'warning');
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

async function refreshData() { 
    await fetchDataFromSheets(); 
}

// Marker functions
function getMarkerColor(status) {
    switch(status) {
        case 'blank': return '#FF3B5C';
        case 'lemah': return '#FFD700';
        case 'sedang': return '#FF8C00';
        case 'baik': return '#39FF14';
        default: return '#888888';
    }
}

function createMarkerIcon(status, kec) {
    const color = getMarkerColor(status);
    const size = status === 'blank' ? 32 : 28;
    const borderColor = kec === 'Temayang' ? '#00AAFF' : '#FF6B35';
    
    const html = `
        <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border-radius: 50%;
            border: 3px solid ${borderColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            color: white;
        ">
            ${status === 'blank' ? '⚠️' : status === 'lemah' ? '📶' : status === 'sedang' ? '📱' : '✓'}
        </div>
    `;
    
    return L.divIcon({
        className: 'simple-marker',
        html: html,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
    });
}

function popupContent(d) {
    const statusColor = getMarkerColor(d.status);
    const statusText = labelMap[d.status] || d.status;
    const borderColor = d.kec === 'Temayang' ? '#00AAFF' : '#FF6B35';
    
    return `
        <div style="min-width: 220px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:2px solid ${borderColor};padding-bottom:8px;">
                <strong style="font-size:14px;">${d.dusun || d.desa || 'Tidak bernama'}</strong>
                <span style="background:${statusColor}20;color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10px;">
                    ${statusText}
                </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div><span style="color:#64748B;font-size:10px;">Kecamatan</span><br><strong style="color:${borderColor};">${d.kec || '-'}</strong></div>
                <div><span style="color:#64748B;font-size:10px;">Desa</span><br><strong>${d.desa || '-'}</strong></div>
                <div><span style="color:#64748B;font-size:10px;">Populasi</span><br><strong>${(d.populasi || 0).toLocaleString()} jiwa</strong></div>
                <div><span style="color:#64748B;font-size:10px;">Provider</span><br><strong>${d.provider || '-'}</strong></div>
                <div><span style="color:#64748B;font-size:10px;">Elevasi</span><br><strong>${d.elev || 0} mdpl</strong></div>
                <div><span style="color:#64748B;font-size:10px;">RSSI</span><br><strong>${d.rssi || -70} dBm</strong></div>
            </div>
            <div style="padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:10px;font-size:11px;color:var(--text2);">
                📝 ${d.ket || 'Tidak ada keterangan'}
            </div>
            <button onclick="showDetail(${d.id})" style="width:100%;padding:8px;border-radius:8px;border:1px solid ${borderColor};background:transparent;color:${borderColor};cursor:pointer;">
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
    
    if (!data || data.length === 0) return;
    
    data.forEach(d => {
        if (!d.lat || !d.lng || d.lat === 0 || d.lng === 0) return;
        const icon = createMarkerIcon(d.status, d.kec);
        const marker = L.marker([d.lat, d.lng], { icon: icon })
            .bindPopup(popupContent(d), { maxWidth: 300, className: 'glass-popup' })
            .bindTooltip(`${d.desa} - ${labelMap[d.status]}`, { 
                direction: 'top', 
                offset: [0, -15], 
                className: 'custom-tooltip', 
                sticky: true 
            });
        markerCluster.addLayer(marker);
    });
    
    console.log(`Rendered ${data.length} markers`);
}

// Statistics and UI Updates
function updateStats(data) {
    const blank = data.filter(d => d.status === 'blank').length;
    const lemah = data.filter(d => d.status === 'lemah').length;
    const sedang = data.filter(d => d.status === 'sedang').length;
    const baik = data.filter(d => d.status === 'baik').length;
    const total = data.length;
    
    const elements = { 
        'h-total': total, 'h-blankspot': blank, 'h-lemah': lemah, 
        'h-baik': baik, 'h-sedang': sedang,
        'cnt-blank': blank, 'cnt-lemah': lemah, 'cnt-sedang': sedang, 'cnt-baik': baik,
        'dl-blank': blank, 'dl-lemah': lemah, 'dl-sedang': sedang, 'dl-baik': baik,
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
    
    // Update kecamatan stats
    const temayangBlank = data.filter(d => d.kec === 'Temayang' && d.status === 'blank').length;
    const gondangBlank = data.filter(d => d.kec === 'Gondang' && d.status === 'blank').length;
    const st = document.getElementById('s-temayang-blank'); if (st) st.textContent = temayangBlank;
    const sg = document.getElementById('s-gondang-blank'); if (sg) sg.textContent = gondangBlank;
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
            container.innerHTML = desas.map(desa => {
                const d = desaMap[desa];
                const pct = Math.round((d.total / maxTotal) * 100);
                const blankBadge = d.blank > 0 ? `<span style="background:#FF3B5C20;color:#FF3B5C;padding:0 6px;border-radius:10px;font-size:9px;margin-left:6px;">${d.blank} blank</span>` : '';
                return `
                    <div class="bar-item">
                        <div class="bar-label" title="${desa}">${desa.length > 12 ? desa.substring(0,10)+'..' : desa}</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div>
                        </div>
                        <div class="bar-count">${d.total}${blankBadge}</div>
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

// Filter functions
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

// Map functions
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

function resetView() { 
    if (map) { 
        map.setView([-7.385, 111.860], 11); 
        showToast('Tampilan direset', 'info'); 
    } 
}

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
    document.body.classList.toggle('light-mode', !isDarkMode);
    showToast(isDarkMode ? 'Mode gelap' : 'Mode terang', 'info'); 
    localStorage.setItem('darkMode', isDarkMode); 
}

function showDetail(id) { 
    const point = pointsData.find(d => d.id === id); 
    if (!point) return; 
    
    const statusColor = getMarkerColor(point.status);
    const statusText = labelMap[point.status];
    const borderColor = point.kec === 'Temayang' ? '#00AAFF' : '#FF6B35';
    
    if (window.innerWidth <= 768) { 
        const sheet = document.getElementById('bottomSheet'); 
        const body = document.getElementById('bottomSheetBody'); 
        if (sheet && body) { 
            body.innerHTML = `
                <div style="display:flex;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid ${borderColor};">
                    <strong>${point.desa}</strong>
                    <span style="color:${statusColor};background:${statusColor}20;padding:2px 12px;border-radius:20px;">${statusText}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Kecamatan</span><span style="color:${borderColor};">${point.kec || '-'}</span></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Populasi</span><span>${(point.populasi || 0).toLocaleString()} jiwa</span></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Provider</span><span>${point.provider || '-'}</span></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Elevasi</span><span>${point.elev || 0} mdpl</span></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>RSSI</span><span>${point.rssi || -70} dBm</span></div>
                <div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:10px;margin:8px 0;">📝 ${point.ket || 'Tidak ada keterangan'}</div>
                <button onclick="closeBottomSheet()" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--glass-border);background:transparent;color:var(--text);cursor:pointer;margin-top:12px;">Tutup</button>
            `; 
            sheet.classList.add('open'); 
        } 
    } else { 
        alert(`📍 ${point.desa}\n🗺️ Kecamatan: ${point.kec}\n📡 Status: ${statusText}\n📱 Provider: ${point.provider}\n👥 Populasi: ${(point.populasi || 0).toLocaleString()} jiwa\n⛰️ Elevasi: ${point.elev} mdpl\n📶 RSSI: ${point.rssi} dBm\n📝 Keterangan: ${point.ket}`); 
    } 
}

function closeBottomSheet() { 
    const sheet = document.getElementById('bottomSheet'); 
    if (sheet) sheet.classList.remove('open'); 
}

function togglePanel(name) { 
    const panel = document.getElementById('panel-' + name); 
    if (activePanel === name && panel) { 
        panel.style.display = 'none'; 
        activePanel = null; 
    } else { 
        document.querySelectorAll('.glass-panel').forEach(p => { if (p) p.style.display = 'none'; }); 
        if (panel) panel.style.display = 'flex'; 
        activePanel = name; 
    } 
}

function toggleSidebar() { 
    const sidebar = document.getElementById('sidebar'); 
    const overlay = document.getElementById('sidebarOverlay'); 
    if (sidebar && overlay) { 
        sidebar.classList.toggle('open'); 
        overlay.classList.toggle('open'); 
    } 
}
function closeSidebar() { 
    const sidebar = document.getElementById('sidebar'); 
    const overlay = document.getElementById('sidebarOverlay'); 
    if (sidebar && overlay) { 
        sidebar.classList.remove('open'); 
        overlay.classList.remove('open'); 
    } 
}

function exportToCSV() { 
    if (filteredData.length === 0) { showToast('Tidak ada data untuk diexport', 'warning'); return; }
    const headers = ['ID','Kecamatan','Desa','Latitude','Longitude','Status','RSSI','Provider','Populasi','Luas','Elevasi','Keterangan']; 
    const rows = filteredData.map(p => [p.id, p.kec, p.desa, p.lat, p.lng, p.status, p.rssi || 'N/A', p.provider, p.populasi, p.luas, p.elev, p.ket]); 
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n'); 
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv' }); 
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(blob); 
    link.download = `blank-spot-temayang-gondang-${new Date().toISOString().slice(0,10)}.csv`; 
    link.click(); 
    URL.revokeObjectURL(link.href); 
    showToast(`${filteredData.length} data diexport`, 'success'); 
}

// Initialize map
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing map for Temayang (12 desa) & Gondang (7 desa)...');
    
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
    
    map = L.map('map', { zoomControl: false }).setView([-7.385, 111.860], 11);
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
                html: `<div style="background:${color};width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;position:relative;">
                        <span>${count}</span>
                        <div style="position:absolute;width:100%;height:100%;border-radius:50%;animation:cluster-pulse 1.5s infinite;background:${color}"></div>
                      </div>`, 
                className: 'marker-cluster-custom', 
                iconSize: [42,42], 
                iconAnchor: [21,21] 
            }); 
        } 
    });
    map.addLayer(markerCluster);
    
    // Add comprehensive boundary polygons
    addBoundaryPolygons();
    
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
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
    
    // Escape key handler
    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') { 
            if (activePanel) togglePanel(activePanel); 
            closeBottomSheet(); 
            closeSidebar(); 
            if (map) map.closePopup();
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
window.debouncedFilter = debouncedFilter;
