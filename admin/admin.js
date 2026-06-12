// ============================================
// ADMIN PANEL - TEMAYANG & GONDANG, BOJONEGORO
// ============================================

let API_URL = 'https://script.google.com/macros/s/AKfycbxWL_zJ-TML_497iusMCgSPdgWsUWe0XqrcTJb_f-w-Ob0hAVbTSisWrd-EPAWLpTps_w/exec';
let pointsData = [];
let isLoading = false;
let renderTimeout = null;
let statusChart = null;

// Daftar Kecamatan
const KECAMATAN_LIST = ['Temayang', 'Gondang'];

// Daftar Desa per Kecamatan
const DESA_LIST = {
    Temayang: ['Bakulan', 'Belun', 'Buntalan', 'Jono', 'Kedungsari', 'Kedungsumber', 'Ngujung', 'Pancur', 'Soko', 'Temayang', 'Papringan', 'Pandantoyo'],
    Gondang: ['Gondang', 'Jari', 'Krondonan', 'Pajeng', 'Pragelan', 'Sambongrejo', 'Sengaten']
};

// ========== MOBILE SIDEBAR ==========
function initMobileSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
    
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }
        if (statusChart) {
            statusChart.resize();
        }
    });
}

// ========== UPDATE DESA OPTIONS BASED ON KECAMATAN ==========
function updateDesaOptions() {
    const kecSelect = document.getElementById('kec');
    const desaSelect = document.getElementById('desa');
    
    if (!kecSelect || !desaSelect) return;
    
    const selectedKec = kecSelect.value;
    const desaList = DESA_LIST[selectedKec] || [];
    
    // Simpan nilai yang dipilih sebelumnya
    const previousValue = desaSelect.value;
    
    // Kosongkan dan isi ulang opsi desa
    desaSelect.innerHTML = '<option value="">Pilih Desa</option>';
    desaList.forEach(desa => {
        const option = document.createElement('option');
        option.value = desa;
        option.textContent = desa;
        desaSelect.appendChild(option);
    });
    
    // Kembalikan nilai sebelumnya jika masih ada
    if (previousValue && desaList.includes(previousValue)) {
        desaSelect.value = previousValue;
    }
}

// Inisialisasi event listener untuk perubahan kecamatan
function initDesaSelect() {
    const kecSelect = document.getElementById('kec');
    if (kecSelect) {
        kecSelect.addEventListener('change', updateDesaOptions);
    }
}

// ========== LOGIN ==========
function checkLogin() {
    const saved = localStorage.getItem('adminLogged');
    if (saved === 'true') {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('adminApp').style.display = 'block';
        document.getElementById('adminName').innerText = localStorage.getItem('adminUser') || 'Admin';
        loadDataFromSheets();
        return true;
    }
    return false;
}

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (username === 'admin' && password === 'admin123') {
        localStorage.setItem('adminLogged', 'true');
        localStorage.setItem('adminUser', username);
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('adminApp').style.display = 'block';
        document.getElementById('adminName').innerText = username;
        loadDataFromSheets();
    } else {
        const err = document.getElementById('loginError');
        err.innerText = 'Username atau password salah! (admin/admin123)';
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('adminLogged');
    localStorage.removeItem('adminUser');
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminApp').style.display = 'none';
    pointsData = [];
});

// ========== NAVIGATION ==========
document.querySelectorAll('.menu-item').forEach(item => {
    if (item.id === 'logoutBtn') return;
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        item.classList.add('active');
        const page = item.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
        document.getElementById(`${page}Page`).style.display = 'block';
        document.getElementById('pageTitle').innerText = 
            page === 'dashboard' ? 'Dashboard' :
            page === 'points' ? 'Kelola Titik' :
            page === 'sync' ? 'Sinkronisasi' : 'Pengaturan';
        
        if (page === 'dashboard') {
            setTimeout(() => {
                renderChart();
            }, 100);
        }
    });
});

// ========== API CALL ==========
async function callApi(action, data = null, id = null) {
    try {
        let url = `${API_URL}?action=${action}&t=${Date.now()}`;
        
        if (data && (action === 'add' || action === 'update')) {
            url += `&data=${encodeURIComponent(JSON.stringify(data))}`;
        }
        
        if (id && action === 'delete') {
            url += `&id=${id}`;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

// ========== LOAD DATA ==========
async function loadDataFromSheets(showLog = true) {
    if (isLoading) return;
    isLoading = true;
    if (showLog) addLog('📥 Mengambil data...', 'info');
    
    try {
        const result = await callApi('getData');
        
        if (result.success && result.data) {
            pointsData = result.data.map(item => ({
                id: parseInt(item.id),
                dusun: item.dusun || '',
                desa: item.desa || '',
                kec: item.kec || '',
                status: item.status || 'blank',
                lat: parseFloat(item.lat) || 0,
                lng: parseFloat(item.lng) || 0,
                populasi: parseInt(item.populasi) || 0,
                provider: item.provider || '',
                rssi: item.rssi || -70,
                elev: item.elev || 0,
                ket: item.ket || ''
            }));
            pointsData.sort((a, b) => a.id - b.id);
            if (showLog) addLog(`✅ ${pointsData.length} data`, 'success');
        } else {
            pointsData = [];
            if (showLog) addLog('📭 Data kosong', 'info');
        }
    } catch (error) {
        if (showLog) addLog(`❌ Gagal: ${error.message}`, 'error');
        pointsData = [];
    }
    
    renderDashboard();
    renderTable();
    renderChart();
    updateLastSync();
    isLoading = false;
}

// ========== RENDER FUNCTIONS ==========
function renderDashboard() {
    const blank = pointsData.filter(p => p.status === 'blank').length;
    const lemah = pointsData.filter(p => p.status === 'lemah').length;
    const sedang = pointsData.filter(p => p.status === 'sedang').length;
    const baik = pointsData.filter(p => p.status === 'baik').length;
    const total = pointsData.length;
    
    // Statistik per kecamatan
    const temayangTotal = pointsData.filter(p => p.kec === 'Temayang').length;
    const gondangTotal = pointsData.filter(p => p.kec === 'Gondang').length;
    const temayangBlank = pointsData.filter(p => p.kec === 'Temayang' && p.status === 'blank').length;
    const gondangBlank = pointsData.filter(p => p.kec === 'Gondang' && p.status === 'blank').length;
    
    const statsGrid = document.getElementById('statsGrid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card"><h4>Total Titik</h4><div class="number">${total}</div><div class="sub">19 Desa</div></div>
            <div class="stat-card"><h4>Blank Spot</h4><div class="number" style="color:#dc2626">${blank}</div><div class="sub">Prioritas</div></div>
            <div class="stat-card"><h4>Sinyal Lemah</h4><div class="number" style="color:#d97706">${lemah}</div><div class="sub">Perlu Perhatian</div></div>
            <div class="stat-card"><h4>Sinyal Sedang</h4><div class="number" style="color:#ea580c">${sedang}</div><div class="sub">Cukup</div></div>
            <div class="stat-card"><h4>Cakupan Baik</h4><div class="number" style="color:#059669">${baik}</div><div class="sub">Optimal</div></div>
        `;
    }
    
    // Update ringkasan kecamatan
    const kecSummary = document.getElementById('kecamatanSummary');
    if (kecSummary) {
        kecSummary.innerHTML = `
            <div class="kec-card" style="background:linear-gradient(135deg,#00AAFF20,#00AAFF05); border-left:4px solid #00AAFF;">
                <h4><i class="fas fa-map-marker-alt" style="color:#00AAFF"></i> Kecamatan Temayang</h4>
                <p><strong>${temayangTotal}</strong> titik survei | <strong style="color:#dc2626">${temayangBlank}</strong> blank spot</p>
                <p style="font-size:12px; color:#64748B">12 Desa: Bakulan, Belun, Buntalan, Jono, Kedungsari, Kedungsumber, Ngujung, Pancur, Soko, Temayang, Papringan, Pandantoyo</p>
            </div>
            <div class="kec-card" style="background:linear-gradient(135deg,#FF6B3520,#FF6B3505); border-left:4px solid #FF6B35;">
                <h4><i class="fas fa-map-marker-alt" style="color:#FF6B35"></i> Kecamatan Gondang</h4>
                <p><strong>${gondangTotal}</strong> titik survei | <strong style="color:#dc2626">${gondangBlank}</strong> blank spot</p>
                <p style="font-size:12px; color:#64748B">7 Desa: Gondang, Jari, Krondonan, Pajeng, Pragelan, Sambongrejo, Sengaten</p>
            </div>
        `;
    }
}

// ========== CHART JS - DIPERBAIKI ==========
function renderChart() {
    const blank = pointsData.filter(p => p.status === 'blank').length;
    const lemah = pointsData.filter(p => p.status === 'lemah').length;
    const sedang = pointsData.filter(p => p.status === 'sedang').length;
    const baik = pointsData.filter(p => p.status === 'baik').length;
    
    // Chart per kecamatan
    const temayangBlank = pointsData.filter(p => p.kec === 'Temayang' && p.status === 'blank').length;
    const temayangLemah = pointsData.filter(p => p.kec === 'Temayang' && p.status === 'lemah').length;
    const temayangSedang = pointsData.filter(p => p.kec === 'Temayang' && p.status === 'sedang').length;
    const temayangBaik = pointsData.filter(p => p.kec === 'Temayang' && p.status === 'baik').length;
    
    const gondangBlank = pointsData.filter(p => p.kec === 'Gondang' && p.status === 'blank').length;
    const gondangLemah = pointsData.filter(p => p.kec === 'Gondang' && p.status === 'lemah').length;
    const gondangSedang = pointsData.filter(p => p.kec === 'Gondang' && p.status === 'sedang').length;
    const gondangBaik = pointsData.filter(p => p.kec === 'Gondang' && p.status === 'baik').length;
    
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;
    
    const ctx2d = ctx.getContext('2d');
    
    if (statusChart) {
        statusChart.destroy();
    }
    
    const isMobile = window.innerWidth < 768;
    
    statusChart = new Chart(ctx2d, {
        type: 'bar',
        data: {
            labels: ['Blank Spot', 'Sinyal Lemah', 'Sinyal Sedang', 'Sinyal Baik'],
            datasets: [
                {
                    label: 'Temayang',
                    data: [temayangBlank, temayangLemah, temayangSedang, temayangBaik],
                    backgroundColor: '#00AAFF',
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: isMobile ? 0.6 : 0.7,
                    categoryPercentage: isMobile ? 0.8 : 0.9
                },
                {
                    label: 'Gondang',
                    data: [gondangBlank, gondangLemah, gondangSedang, gondangBaik],
                    backgroundColor: '#FF6B35',
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: isMobile ? 0.6 : 0.7,
                    categoryPercentage: isMobile ? 0.8 : 0.9
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            resizeDelay: 100,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            size: isMobile ? 10 : 12,
                            family: 'Inter',
                            weight: '500'
                        },
                        boxWidth: isMobile ? 10 : 12,
                        padding: isMobile ? 6 : 10,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    bodyFont: {
                        size: isMobile ? 11 : 12
                    },
                    titleFont: {
                        size: isMobile ? 11 : 12,
                        weight: 'bold'
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                            return `${label}: ${value} titik`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        font: {
                            size: isMobile ? 9 : 11
                        },
                        callback: function(value) {
                            return value.toString();
                        }
                    },
                    grid: {
                        drawBorder: true,
                        color: '#e2e8f0',
                        lineWidth: 0.5
                    },
                    title: {
                        display: false
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: isMobile ? 10 : 11,
                            weight: '500',
                            family: 'Inter'
                        },
                        maxRotation: isMobile ? 25 : 0,
                        minRotation: isMobile ? 20 : 0,
                        autoSkip: true,
                        padding: isMobile ? 4 : 6
                    },
                    grid: {
                        display: false
                    }
                }
            },
            layout: {
                padding: {
                    left: isMobile ? 5 : 10,
                    right: isMobile ? 5 : 10,
                    top: isMobile ? 5 : 10,
                    bottom: isMobile ? 5 : 10
                }
            },
            elements: {
                bar: {
                    borderWidth: 0,
                    borderRadius: 6
                }
            }
        }
    });
}

// ========== EXPORT EXCEL ==========
function exportToExcel() {
    if (pointsData.length === 0) {
        addLog('⚠️ Tidak ada data untuk diexport', 'error');
        return;
    }
    
    addLog('📊 Mengexport data ke Excel...', 'info');
    
    const exportData = pointsData.map(p => ({
        'ID': p.id,
        'Dusun': p.dusun,
        'Desa': p.desa,
        'Kecamatan': p.kec,
        'Status': p.status === 'blank' ? 'Blank Spot' : p.status === 'lemah' ? 'Sinyal Lemah' : p.status === 'sedang' ? 'Sinyal Sedang' : 'Sinyal Baik',
        'Latitude': p.lat,
        'Longitude': p.lng,
        'Populasi': p.populasi,
        'Provider': p.provider,
        'Elevasi': p.elev,
        'Keterangan': p.ket
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    ws['!cols'] = [
        {wch: 5}, {wch: 20}, {wch: 20}, {wch: 15}, 
        {wch: 15}, {wch: 12}, {wch: 12}, {wch: 10}, 
        {wch: 12}, {wch: 8}, {wch: 25}
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Titik Survei');
    
    const now = new Date();
    const filename = `SIG_BlankSpot_Temayang_Gondang_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}.xlsx`;
    
    XLSX.writeFile(wb, filename);
    addLog(`✅ Export selesai: ${pointsData.length} data`, 'success');
}

function renderTable() {
    if (renderTimeout) clearTimeout(renderTimeout);
    
    renderTimeout = setTimeout(() => {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const filtered = pointsData.filter(p => 
            p.dusun?.toLowerCase().includes(search) || 
            p.desa?.toLowerCase().includes(search) ||
            p.kec?.toLowerCase().includes(search)
        );
        
        const tbody = document.getElementById('pointsTableBody');
        if (!tbody) return;
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Belum ada data</td></tr>';
            return;
        }
        
        // Mapping status ke teks yang lebih pendek untuk mobile
        const getStatusText = (status) => {
            switch(status) {
                case 'blank': return 'BLANK';
                case 'lemah': return 'LEMAH';
                case 'sedang': return 'SEDANG';
                case 'baik': return 'BAIK';
                default: return status.toUpperCase();
            }
        };
        
        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.id}</td>
                <td>${escapeHtml(p.dusun || '-')}</td>
                <td>${escapeHtml(p.desa || '-')}</td>
                <td><span class="kec-badge" style="${p.kec === 'Temayang' ? 'background:#00AAFF20;color:#00AAFF' : 'background:#FF6B3520;color:#FF6B35'}">${escapeHtml(p.kec || '-')}</span></td>
                <td><span class="badge-status badge-${p.status}">${getStatusText(p.status)}</span></td>
                <td>${p.populasi || 0}</td>
                <td>${escapeHtml(p.provider || '-')}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="editPoint(${p.id})"></i>
                    <i class="fas fa-trash-alt" onclick="deletePoint(${p.id})"></i>
                </td>
            </tr>
        `).join('');
    }, 50);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addLog(msg, type = 'info') {
    const logDiv = document.getElementById('logList');
    if (logDiv) {
        const time = new Date().toLocaleTimeString();
        const colorClass = type === 'error' ? 'log-error' : (type === 'success' ? 'log-success' : 'log-info');
        logDiv.innerHTML = `<div class="log-entry ${colorClass}">[${time}] ${msg}</div>` + logDiv.innerHTML;
        if (logDiv.children.length > 20) logDiv.removeChild(logDiv.lastChild);
    }
    console.log(`[${type.toUpperCase()}]`, msg);
}

function updateLastSync() {
    const last = localStorage.getItem('lastSync');
    const lastSyncSpan = document.getElementById('lastSyncTime');
    if (lastSyncSpan) {
        lastSyncSpan.innerHTML = last ? new Date(last).toLocaleString() : '-';
    }
}

// ========== CRUD OPERATIONS ==========
async function addPoint(data) {
    addLog(`➕ Menambah: ${data.dusun}...`, 'info');
    
    const submitBtn = document.querySelector('#pointForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';
    }
    
    try {
        const result = await callApi('add', data);
        
        if (result.success) {
            addLog(`✅ "${data.dusun}" berhasil ditambahkan`, 'success');
            await loadDataFromSheets(false);
        } else {
            throw new Error(result.message || 'Gagal menambahkan');
        }
    } catch (error) {
        addLog(`❌ Gagal: ${error.message}`, 'error');
        return false;
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan';
        }
    }
    return true;
}

function editPoint(id) {
    const point = pointsData.find(p => p.id === id);
    if (!point) {
        addLog('❌ Data tidak ditemukan', 'error');
        return;
    }
    
    document.getElementById('editId').value = point.id;
    document.getElementById('dusun').value = point.dusun || '';
    document.getElementById('desa').value = point.desa || '';
    document.getElementById('kec').value = point.kec || 'Temayang';
    document.getElementById('status').value = point.status || 'blank';
    document.getElementById('lat').value = point.lat || 0;
    document.getElementById('lng').value = point.lng || 0;
    document.getElementById('populasi').value = point.populasi || 0;
    document.getElementById('provider').value = point.provider || '';
    document.getElementById('elevasi').value = point.elev || 0;
    document.getElementById('keterangan').value = point.ket || '';
    document.getElementById('modalTitle').innerText = 'Edit Titik';
    
    // Update desa options berdasarkan kecamatan yang dipilih
    updateDesaOptions();
    // Set desa setelah options diperbarui
    setTimeout(() => {
        if (point.desa) document.getElementById('desa').value = point.desa;
    }, 10);
    
    document.getElementById('pointModal').style.display = 'flex';
}

async function updatePoint(id, data) {
    addLog(`✏️ Update: ${data.dusun}...`, 'info');
    
    const submitBtn = document.querySelector('#pointForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';
    }
    
    try {
        const updateData = { id, ...data };
        const result = await callApi('update', updateData);
        
        if (result.success) {
            addLog(`✅ "${data.dusun}" berhasil diupdate`, 'success');
            await loadDataFromSheets(false);
        } else {
            throw new Error(result.message || 'Gagal mengupdate');
        }
    } catch (error) {
        addLog(`❌ Gagal update: ${error.message}`, 'error');
        return false;
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan';
        }
    }
    return true;
}

async function deletePoint(id) {
    if (!confirm('⚠️ Hapus titik ini?')) return;
    
    const point = pointsData.find(p => p.id === id);
    const pointName = point?.dusun || `ID ${id}`;
    addLog(`🗑️ Menghapus: ${pointName}...`, 'info');
    
    try {
        const result = await callApi('delete', null, id);
        
        if (result.success) {
            addLog(`✅ "${pointName}" berhasil dihapus`, 'success');
            await loadDataFromSheets(false);
        } else {
            throw new Error(result.message || 'Gagal menghapus');
        }
    } catch (error) {
        addLog(`❌ Gagal hapus: ${error.message}`, 'error');
        return false;
    }
    return true;
}

async function reindexData() {
    addLog('🔄 Mengurutkan ulang ID...', 'info');
    
    try {
        const result = await callApi('reindex');
        
        if (result.success) {
            addLog('✅ ID berhasil diurutkan ulang', 'success');
            await loadDataFromSheets(false);
        } else {
            throw new Error(result.message || 'Gagal reindex');
        }
    } catch (error) {
        addLog(`❌ Gagal reindex: ${error.message}`, 'error');
        return false;
    }
    return true;
}

// ========== SYNC FUNCTIONS ==========
async function testConnection() {
    addLog('🔌 Testing connection...', 'info');
    const connStatus = document.getElementById('connStatus');
    
    try {
        const result = await callApi('test');
        
        if (result.success) {
            addLog(`✅ Connection OK!`, 'success');
            if (connStatus) {
                connStatus.innerHTML = '✅ Terhubung';
                connStatus.style.background = '#d1fae5';
                connStatus.style.color = '#059669';
            }
            return true;
        } else {
            throw new Error(result.message || 'Connection failed');
        }
    } catch(e) {
        addLog(`❌ Connection failed: ${e.message}`, 'error');
        if (connStatus) {
            connStatus.innerHTML = '❌ Gagal';
            connStatus.style.background = '#fee2e2';
            connStatus.style.color = '#dc2626';
        }
        return false;
    }
}

async function pullData() {
    addLog('📥 Pull data...', 'info');
    await loadDataFromSheets(true);
    localStorage.setItem('lastSync', new Date().toISOString());
    updateLastSync();
    addLog('✅ Pull selesai', 'success');
}

async function pushData() {
    if (pointsData.length === 0) {
        addLog('⚠️ Tidak ada data', 'warning');
        return;
    }
    
    addLog(`📤 Push ${pointsData.length} data...`, 'info');
    let success = 0;
    
    for (const point of pointsData) {
        try {
            const result = await callApi('add', point);
            if (result.success) success++;
            await new Promise(r => setTimeout(r, 100));
        } catch(e) {
            addLog(`❌ Push ${point.dusun} gagal`, 'error');
        }
    }
    
    addLog(`✅ Push selesai: ${success}/${pointsData.length}`, success === pointsData.length ? 'success' : 'warning');
    if (success > 0) {
        localStorage.setItem('lastSync', new Date().toISOString());
        updateLastSync();
        await loadDataFromSheets(false);
    }
}

async function addSampleData() {
    const samples = [
        // Kecamatan Temayang
        { dusun: 'Dk. Krajan', desa: 'Temayang', kec: 'Temayang', status: 'blank', lat: -7.3650, lng: 111.8950, populasi: 1250, provider: 'Telkomsel' },
        { dusun: 'Dk. Soko', desa: 'Soko', kec: 'Temayang', status: 'blank', lat: -7.422083, lng: 111.929442, populasi: 2150, provider: 'Indosat' },
        { dusun: 'Dk. Kedungsumber', desa: 'Kedungsumber', kec: 'Temayang', status: 'blank', lat: -7.348792, lng: 111.902089, populasi: 1820, provider: 'Telkomsel' },
        { dusun: 'Dk. Papringan', desa: 'Papringan', kec: 'Temayang', status: 'lemah', lat: -7.3480, lng: 111.8600, populasi: 950, provider: 'XL' },
        { dusun: 'Dk. Pandantoyo', desa: 'Pandantoyo', kec: 'Temayang', status: 'sedang', lat: -7.3380, lng: 111.8750, populasi: 2100, provider: 'Telkomsel' },
        
        // Kecamatan Gondang
        { dusun: 'Dk. Jari', desa: 'Jari', kec: 'Gondang', status: 'blank', lat: -7.405636, lng: 111.817664, populasi: 1950, provider: 'XL' },
        { dusun: 'Dk. Pragelan', desa: 'Pragelan', kec: 'Gondang', status: 'lemah', lat: -7.395694, lng: 111.792511, populasi: 1650, provider: 'Telkomsel' },
        { dusun: 'Dk. Sengaten', desa: 'Sengaten', kec: 'Gondang', status: 'sedang', lat: -7.3650, lng: 111.8000, populasi: 1100, provider: 'Indosat' },
        { dusun: 'Dk. Gondang', desa: 'Gondang', kec: 'Gondang', status: 'baik', lat: -7.3850, lng: 111.8350, populasi: 2850, provider: 'Telkomsel' }
    ];
    
    addLog('📝 Menambah sample data...', 'info');
    for (const s of samples) {
        await addPoint(s);
        await new Promise(r => setTimeout(r, 200));
    }
    addLog(`✅ ${samples.length} sample data ditambahkan`, 'success');
}

function saveApiConfig() {
    const newUrl = document.getElementById('apiUrlInput').value;
    if (newUrl && newUrl.trim()) {
        API_URL = newUrl.trim();
        localStorage.setItem('apiUrl', API_URL);
        addLog('🔧 API URL saved', 'success');
    } else {
        addLog('❌ URL tidak boleh kosong', 'error');
    }
}

function changePassword() {
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;
    
    if (oldPass !== 'admin123') {
        addLog('❌ Password lama salah', 'error');
        return;
    }
    if (newPass !== confirmPass) {
        addLog('❌ Password baru tidak cocok', 'error');
        return;
    }
    if (newPass.length < 4) {
        addLog('❌ Minimal 4 karakter', 'error');
        return;
    }
    
    localStorage.setItem('adminPassword', newPass);
    addLog('✅ Password berhasil diubah', 'success');
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
}

// ========== EVENT LISTENERS ==========
function initEventListeners() {
    const addPointBtn = document.getElementById('addPointBtn');
    if (addPointBtn) {
        addPointBtn.addEventListener('click', () => {
            document.getElementById('pointForm').reset();
            document.getElementById('editId').value = '';
            document.getElementById('modalTitle').innerText = 'Tambah Titik';
            document.getElementById('kec').value = 'Temayang';
            updateDesaOptions(); // Update desa options berdasarkan kecamatan default
            document.getElementById('pointModal').style.display = 'flex';
        });
    }
    
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            document.getElementById('pointModal').style.display = 'none';
        });
    }
    
    const pointForm = document.getElementById('pointForm');
    if (pointForm) {
        pointForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = parseInt(document.getElementById('editId').value);
            const data = {
                dusun: document.getElementById('dusun').value,
                desa: document.getElementById('desa').value,
                kec: document.getElementById('kec').value,
                status: document.getElementById('status').value,
                lat: parseFloat(document.getElementById('lat').value),
                lng: parseFloat(document.getElementById('lng').value),
                populasi: parseInt(document.getElementById('populasi').value) || 0,
                provider: document.getElementById('provider').value,
                elev: parseInt(document.getElementById('elevasi').value) || 0,
                ket: document.getElementById('keterangan').value || ''
            };
            
            if (!data.dusun || !data.desa || !data.lat || !data.lng) {
                addLog('❌ Lengkapi semua field (Dusun, Desa, Lat, Lng)', 'error');
                return;
            }
            
            if (id) {
                await updatePoint(id, data);
            } else {
                await addPoint(data);
            }
            
            document.getElementById('pointModal').style.display = 'none';
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderTable());
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDataFromSheets(true));
    }
    
    const refreshPointsBtn = document.getElementById('refreshPointsBtn');
    if (refreshPointsBtn) {
        refreshPointsBtn.addEventListener('click', () => loadDataFromSheets(true));
    }
    
    const refreshChartBtn = document.getElementById('refreshChartBtn');
    if (refreshChartBtn) {
        refreshChartBtn.addEventListener('click', () => renderChart());
    }
    
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }
    
    const testConnBtn = document.getElementById('testConnBtn');
    if (testConnBtn) {
        testConnBtn.addEventListener('click', testConnection);
    }
    
    const pullDataBtn = document.getElementById('pullDataBtn');
    if (pullDataBtn) {
        pullDataBtn.addEventListener('click', pullData);
    }
    
    const pushDataBtn = document.getElementById('pushDataBtn');
    if (pushDataBtn) {
        pushDataBtn.addEventListener('click', pushData);
    }
    
    const saveApiBtn = document.getElementById('saveApiBtn');
    if (saveApiBtn) {
        saveApiBtn.addEventListener('click', saveApiConfig);
    }
    
    const changePassBtn = document.getElementById('changePassBtn');
    if (changePassBtn) {
        changePassBtn.addEventListener('click', changePassword);
    }
    
    const sampleDataBtn = document.getElementById('sampleDataBtn');
    if (sampleDataBtn) {
        sampleDataBtn.addEventListener('click', addSampleData);
    }
    
    const reindexBtn = document.getElementById('reindexBtn');
    if (reindexBtn) {
        reindexBtn.addEventListener('click', reindexData);
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('pointModal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    window.addEventListener('resize', () => {
        if (statusChart) {
            statusChart.resize();
        }
    });
}

// ========== INITIALIZATION ==========
const savedUrl = localStorage.getItem('apiUrl');
if (savedUrl) API_URL = savedUrl;
const apiUrlInput = document.getElementById('apiUrlInput');
if (apiUrlInput) apiUrlInput.value = API_URL;

initMobileSidebar();
initEventListeners();
initDesaSelect(); // Initialize desa select listener

if (!checkLogin()) {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminApp').style.display = 'none';
}

// Export functions for global access
window.editPoint = editPoint;
window.deletePoint = deletePoint;
window.testConnection = testConnection;
window.pullData = pullData;
window.pushData = pushData;
window.saveApiConfig = saveApiConfig;
window.changePassword = changePassword;
window.addSampleData = addSampleData;
window.reindexData = reindexData;
window.exportToExcel = exportToExcel;
