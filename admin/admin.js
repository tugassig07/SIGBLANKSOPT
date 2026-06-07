// ==================== KONFIGURASI ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbwqsfXXu2FoT_kxS17sICM9kaicUEkGGXk6cDp6zUGwOrKstvSf5TNkVPjbL9WOBd7jSQ/exec';
const ADMIN_CREDENTIALS = {
    username: 'admin',
    passwordHash: 'YWRtaW4xMjM='
};

const SESSION_HOURS = 8;

// ==================== STATE ====================
let pointsData = [];
let filteredData = [];
let lastSyncTime = null;
let charts = {};
let autoRefreshTimer = null;
let clockTimer = null;

// ==================== LOGIN ====================
function login() {
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;
    const err = document.getElementById('loginError');
    const encodedPassword = btoa(password);

    if (username === ADMIN_CREDENTIALS.username && encodedPassword === ADMIN_CREDENTIALS.passwordHash) {
        localStorage.setItem('adminLoggedIn', 'true');
        localStorage.setItem('adminLoginTime', String(Date.now()));
        localStorage.setItem('adminUsername', username);
        err.classList.remove('visible');
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('usernameInput').value = '';
        document.getElementById('passwordInput').value = '';
        initAdmin();
        showToast('Selamat datang, ' + username + '!', 'success');
    } else {
        err.classList.add('visible');
        const input = document.getElementById('passwordInput');
        input.classList.add('shake');
        input.addEventListener('animationend', () => input.classList.remove('shake'), { once: true });
    }
}

function logout() {
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('adminLoginTime');
    localStorage.removeItem('adminUsername');
    clearTimers();
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('passwordInput').value = '';
    document.getElementById('loginError').classList.remove('visible');
    showToast('Anda telah logout', 'info');
}

function checkLogin() {
    const ok = localStorage.getItem('adminLoggedIn');
    const time = localStorage.getItem('adminLoginTime');
    const username = localStorage.getItem('adminUsername');
    if (ok === 'true' && time) {
        const elapsed = (Date.now() - parseInt(time, 10)) / 3_600_000;
        if (elapsed < SESSION_HOURS) {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('adminNameSidebar').textContent = username || 'Administrator';
            initAdmin();
            return;
        }
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('adminLoginTime');
    }
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

function togglePassword() {
    const input = document.getElementById('passwordInput');
    const icon = document.getElementById('pwEyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function changePassword(oldPassword, newPassword, confirmPassword) {
    const encodedOld = btoa(oldPassword);
    if (encodedOld !== ADMIN_CREDENTIALS.passwordHash) {
        showToast('Password lama salah!', 'error');
        return false;
    }
    if (newPassword !== confirmPassword) {
        showToast('Password baru tidak cocok!', 'error');
        return false;
    }
    if (newPassword.length < 6) {
        showToast('Password minimal 6 karakter!', 'error');
        return false;
    }
    ADMIN_CREDENTIALS.passwordHash = btoa(newPassword);
    localStorage.setItem('adminPasswordHash', btoa(newPassword));
    showToast('Password berhasil diubah!', 'success');
    return true;
}

// ==================== SIDEBAR ====================
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

// ==================== INIT ====================
function clearTimers() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

async function initAdmin() {
    clearTimers();

    // Clock
    updateDateTime();
    clockTimer = setInterval(updateDateTime, 1000);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(el => {
        el.removeEventListener('click', handleNavClick);
        el.addEventListener('click', handleNavClick);
    });

    // Filter listeners
    const search = document.getElementById('searchInput');
    const kec = document.getElementById('filterKecamatan');
    const status = document.getElementById('filterStatus');
    if (search) search.addEventListener('input', () => {
        const clearBtn = document.getElementById('searchClearBtn');
        if (clearBtn) clearBtn.style.display = search.value ? 'block' : 'none';
        renderTable();
    });
    if (kec) kec.addEventListener('change', () => renderTable());
    if (status) status.addEventListener('change', () => renderTable());

    // Button listeners
    document.getElementById('addPointBtn')?.addEventListener('click', openAddModal);
    document.getElementById('pushToSheetBtn')?.addEventListener('click', pushToSheets);
    document.getElementById('pullFromSheetBtn')?.addEventListener('click', fetchDataFromSheets);
    document.getElementById('testConnectionBtn')?.addEventListener('click', testConnection);
    document.getElementById('saveApiConfig')?.addEventListener('click', saveApiConfig);
    document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
        const oldPass = document.getElementById('oldPassword').value;
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        if (changePassword(oldPass, newPass, confirmPass)) {
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        }
    });
    document.getElementById('resetDataBtn')?.addEventListener('click', resetToDefault);

    // Load data
    await fetchDataFromSheets();

    // Auto-refresh every 30 seconds
    autoRefreshTimer = setInterval(() => {
        fetchDataFromSheets(true);
    }, 30000);
}

function handleNavClick(e) {
    const page = e.currentTarget.dataset.page;
    closeSidebar();

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    e.currentTarget.classList.add('active');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page + 'Page').classList.add('active');

    const icons = { dashboard: 'fa-gauge-high', points: 'fa-map-marker-alt', sync: 'fa-cloud-upload-alt', settings: 'fa-cog' };
    const titles = { dashboard: 'Dashboard', points: 'Kelola Titik', sync: 'Sinkronisasi', settings: 'Pengaturan' };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    document.getElementById('headerBreadcrumb').innerHTML = `<i class="fas ${icons[page] || 'fa-circle'}"></i> ${titles[page] || page}`;

    if (page === 'dashboard') updateCharts();
}

function updateDateTime() {
    const now = new Date();
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    const btn = document.getElementById('searchClearBtn');
    if (btn) btn.style.display = 'none';
    renderTable();
}

// ==================== DATA FUNCTIONS ====================
async function fetchDataFromSheets(silent = false) {
    const tbody = document.getElementById('pointsTableBody');
    const refreshBtn = document.getElementById('refreshBtn');

    if (!silent && tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">
            <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
            <span>Memuat data…</span>
        </td></tr>`;
    }

    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
        const response = await fetch(API_URL);
        const result = await response.json();

        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            pointsData = result.data.map(item => ({
                id: parseInt(item.id),
                kec: item.kec,
                desa: item.desa,
                dusun: item.dusun,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lng),
                status: item.status,
                rssi: item.rssi,
                provider: item.provider,
                populasi: parseInt(item.populasi),
                luas: item.luas || '-',
                elev: parseInt(item.elev) || 0,
                ket: item.ket || ''
            }));
        } else {
            pointsData = [];
        }

        filteredData = [...pointsData];
        saveToLocalStorage();
        lastSyncTime = new Date();
        updateSyncStatus();
        renderTable();
        updateDashboard();
        updateCharts();

        if (!silent) showToast(`Berhasil mengambil ${pointsData.length} data`, 'success');
        addLog(`📥 Mengambil ${pointsData.length} data dari Google Sheets`, 'success');
    } catch (error) {
        console.error('fetchData error:', error);
        loadFromLocalStorage();
        renderTable();
        updateDashboard();
        if (!silent) showToast('Gagal mengambil data dari server', 'error');
        addLog(`❌ Gagal mengambil data: ${error.message}`, 'error');
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
}

async function pushToSheets() {
    if (pointsData.length === 0) {
        showToast('Tidak ada data untuk disinkronkan', 'warning');
        return;
    }

    addLog(`📤 Menyinkronkan ${pointsData.length} data ke Google Sheets...`, 'info');
    showToast('Menyinkronkan data...', 'info');

    for (const point of pointsData) {
        const action = point.id > 1000 ? 'add' : 'update';
        await callGoogleAPI(action, point);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    addLog(`✅ Berhasil menyinkronkan ${pointsData.length} data`, 'success');
    showToast(`Berhasil menyinkronkan ${pointsData.length} data`, 'success');
    lastSyncTime = new Date();
    updateSyncStatus();
}

async function testConnection() {
    addLog('🔌 Menguji koneksi ke Google Sheets...', 'info');
    try {
        const response = await fetch(API_URL);
        if (response.ok) {
            addLog('✅ Koneksi berhasil!', 'success');
            showToast('Koneksi berhasil', 'success');
            return true;
        }
    } catch (error) {
        addLog(`❌ Koneksi gagal: ${error.message}`, 'error');
        showToast('Koneksi gagal', 'error');
        return false;
    }
}

async function callGoogleAPI(action, data = {}) {
    try {
        const payload = { action, ...data };
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return { success: true };
    } catch (error) {
        return null;
    }
}

function saveToLocalStorage() {
    localStorage.setItem('sigAdminPoints', JSON.stringify(pointsData));
    if (lastSyncTime) localStorage.setItem('lastSyncTime', lastSyncTime.toISOString());
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('sigAdminPoints');
    if (stored && stored !== '[]') {
        pointsData = JSON.parse(stored);
        filteredData = [...pointsData];
        addLog(`📂 Memuat ${pointsData.length} data dari localStorage`, 'info');
    } else {
        pointsData = [];
        filteredData = [];
        addLog('📂 Memulai dengan data kosong', 'info');
    }
    const savedSync = localStorage.getItem('lastSyncTime');
    if (savedSync) lastSyncTime = new Date(savedSync);
    updateSyncStatus();
}

function updateSyncStatus() {
    const lastSyncSpan = document.getElementById('lastSyncTime');
    const totalDataSpan = document.getElementById('totalDataSync');
    if (lastSyncSpan && lastSyncTime) lastSyncSpan.textContent = lastSyncTime.toLocaleString();
    if (totalDataSpan) totalDataSpan.textContent = `${pointsData.length} titik`;
}

function addLog(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
        logContainer.prepend(logEntry);
        while (logContainer.children.length > 20) logContainer.removeChild(logContainer.lastChild);
    }
}

function saveApiConfig() {
    const newUrl = document.getElementById('apiUrl').value;
    if (newUrl) {
        localStorage.setItem('googleApiUrl', newUrl);
        showToast('Konfigurasi disimpan', 'success');
        addLog('⚙️ Konfigurasi API disimpan', 'info');
    }
}

function resetToDefault() {
    if (confirm('Reset ke data kosong? Semua data yang ada akan hilang.')) {
        pointsData = [];
        filteredData = [];
        saveToLocalStorage();
        renderTable();
        updateDashboard();
        updateCharts();
        addLog('🔄 Data direset ke kosong', 'warning');
        showToast('Data berhasil direset ke kosong', 'info');
    }
}

async function refreshAllData() {
    await fetchDataFromSheets(false);
}

// ==================== CRUD ====================
function openAddModal() {
    document.getElementById('pointForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus"></i> Tambah Titik Baru';
    document.getElementById('pointModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('pointModal').style.display = 'none';
}

function editPoint(id) {
    const point = pointsData.find(p => p.id === id);
    if (point) {
        document.getElementById('editId').value = point.id;
        document.getElementById('dusun').value = point.dusun;
        document.getElementById('desa').value = point.desa;
        document.getElementById('kec').value = point.kec;
        document.getElementById('status').value = point.status;
        document.getElementById('lat').value = point.lat;
        document.getElementById('lng').value = point.lng;
        document.getElementById('populasi').value = point.populasi;
        document.getElementById('provider').value = point.provider || '';
        document.getElementById('luas').value = point.luas || '';
        document.getElementById('elev').value = point.elev || 0;
        document.getElementById('ket').value = point.ket || '';
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Titik';
        document.getElementById('pointModal').style.display = 'flex';
    }
}

function deletePoint(id) {
    if (confirm('Hapus titik ini? Data akan dihapus dari Google Sheets juga.')) {
        const point = pointsData.find(p => p.id === id);
        pointsData = pointsData.filter(p => p.id !== id);
        filteredData = [...pointsData];
        saveToLocalStorage();
        renderTable();
        updateDashboard();
        updateCharts();
        addLog(`🗑️ Hapus titik: ${point?.dusun} (ID: ${id})`, 'warning');
        showToast(`Titik "${point?.dusun}" berhasil dihapus`, 'success');
        callGoogleAPI('delete', { id: id });
    }
}

function addPoint(pointData) {
    const newId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id), 0) + 1 : 1;
    const newPoint = {
        id: newId,
        ...pointData,
        rssi: pointData.status === 'blank' ? null : -70
    };
    pointsData.push(newPoint);
    filteredData = [...pointsData];
    saveToLocalStorage();
    renderTable();
    updateDashboard();
    updateCharts();
    addLog(`➕ Menambahkan titik: ${newPoint.dusun} (ID: ${newId})`, 'success');
    showToast(`Titik "${newPoint.dusun}" berhasil ditambahkan`, 'success');
    callGoogleAPI('add', newPoint);
}

function updatePoint(id, updatedData) {
    const index = pointsData.findIndex(p => p.id === id);
    if (index !== -1) {
        pointsData[index] = { ...pointsData[index], ...updatedData };
        filteredData = [...pointsData];
        saveToLocalStorage();
        renderTable();
        updateDashboard();
        updateCharts();
        addLog(`✏️ Update titik: ${updatedData.dusun} (ID: ${id})`, 'info');
        showToast(`Titik "${updatedData.dusun}" berhasil diperbarui`, 'success');
        callGoogleAPI('update', pointsData[index]);
    }
}

// ==================== RENDER FUNCTIONS ====================
function renderTable() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const kecFilter = document.getElementById('filterKecamatan')?.value || 'all';
    const statusFilter = document.getElementById('filterStatus')?.value || 'all';

    filteredData = pointsData.filter(p => {
        const matchSearch = p.dusun.toLowerCase().includes(search) || p.desa.toLowerCase().includes(search);
        const matchKec = kecFilter === 'all' || p.kec === kecFilter;
        const matchStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchSearch && matchKec && matchStatus;
    });

    const tbody = document.getElementById('pointsTableBody');
    const infoEl = document.getElementById('tableInfo');

    if (infoEl) {
        infoEl.textContent = filteredData.length === pointsData.length
            ? `Menampilkan ${pointsData.length} titik`
            : `Menampilkan ${filteredData.length} dari ${pointsData.length} titik`;
    }

    if (!tbody) return;

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">
            <div class="empty-state">
                <i class="fas fa-map-marker-alt"></i>
                <p>Belum ada data titik</p>
                <button class="btn-primary" onclick="openAddModal()" style="margin-top: 12px;">
                    <i class="fas fa-plus"></i> Tambah Titik Pertama
                </button>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filteredData.map((p, i) => {
        const statusClass = p.status;
        const statusText = {
            'blank': '🔴 Blank Spot',
            'lemah': '🟡 Sinyal Lemah',
            'sedang': '🟠 Sinyal Sedang',
            'baik': '🟢 Sinyal Baik'
        }[p.status] || p.status;

        return `
        <tr>
            <td style="font-family:'DM Mono',monospace;font-size:12px;">${String(i + 1).padStart(2, '0')}</td>
            <td><strong>${escapeHtml(p.dusun)}</strong></td>
            <td>${escapeHtml(p.desa)}</td>
            <td>${escapeHtml(p.kec)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${p.populasi.toLocaleString()}</td>
            <td>${escapeHtml(p.provider || '-')}</td>
            <td>
                <div class="action-group">
                    <button class="btn-edit" onclick="editPoint(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete" onclick="deletePoint(${p.id})"><i class="fas fa-trash-can"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function updateDashboard() {
    const total = pointsData.length;
    const blank = pointsData.filter(p => p.status === 'blank').length;
    const lemah = pointsData.filter(p => p.status === 'lemah').length;
    const sedang = pointsData.filter(p => p.status === 'sedang').length;
    const baik = pointsData.filter(p => p.status === 'baik').length;

    animateCount('totalTitik', total);
    animateCount('blankSpot', blank);
    animateCount('sinyaLemah', lemah);
    animateCount('sinyalBaik', baik);
}

function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent, 10) || 0;
    const diff = target - start;
    const steps = 24;
    let step = 0;
    const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(start + diff * (step / steps));
        if (step >= steps) { el.textContent = target; clearInterval(timer); }
    }, 16);
}

// ==================== CHARTS ====================
const PALETTE = ['#1a7a42', '#27ae60', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#f43f5e', '#06b6d4'];

function renderChart(id, type, labels, data, colors) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }

    charts[id] = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label: 'Jumlah',
                data,
                backgroundColor: type === 'line' ? 'rgba(26,122,66,0.10)' : colors,
                borderColor: type === 'line' ? '#1a7a42' : colors,
                borderWidth: 2,
                fill: type === 'line',
                tension: 0.42,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#1a7a42',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderRadius: type === 'bar' ? 6 : 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: type === 'doughnut',
                    position: 'bottom',
                    labels: {
                        padding: 18,
                        font: { family: "'Plus Jakarta Sans'", size: 12 },
                        boxWidth: 12, boxHeight: 12, borderRadius: 4,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: '#0f2117',
                    padding: 11,
                    titleFont: { family: "'Plus Jakarta Sans'", weight: '700', size: 13 },
                    bodyFont: { family: "'Plus Jakarta Sans'", size: 12 },
                    cornerRadius: 10
                }
            },
            scales: type !== 'doughnut' ? {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { family: "'Plus Jakarta Sans'", size: 11 }, color: '#8ca89a' },
                    grid: { color: 'rgba(0,0,0,.04)' }
                },
                x: {
                    ticks: { font: { family: "'Plus Jakarta Sans'", size: 11 }, color: '#8ca89a' },
                    grid: { display: false }
                }
            } : {},
            animation: { duration: 700, easing: 'easeOutQuart' },
            cutout: type === 'doughnut' ? '62%' : undefined
        }
    });
}

function updateCharts() {
    // Status chart
    const blank = pointsData.filter(p => p.status === 'blank').length;
    const lemah = pointsData.filter(p => p.status === 'lemah').length;
    const sedang = pointsData.filter(p => p.status === 'sedang').length;
    const baik = pointsData.filter(p => p.status === 'baik').length;

    renderChart('statusChart', 'doughnut',
        ['Blank Spot', 'Sinyal Lemah', 'Sinyal Sedang', 'Sinyal Baik'],
        [blank, lemah, sedang, baik],
        ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981']
    );

    // Kecamatan chart
    const kedewan = pointsData.filter(p => p.kec === 'Kedewan').length;
    const kasiman = pointsData.filter(p => p.kec === 'Kasiman').length;
    renderChart('kecamatanChart', 'bar', ['Kedewan', 'Kasiman'], [kedewan, kasiman], ['#1a7a42', '#27ae60']);
}

// ==================== EXPORT CSV ====================
function exportToCSV() {
    if (filteredData.length === 0) {
        showToast('Tidak ada data untuk diekspor', 'error');
        return;
    }

    const headers = ['ID', 'Kecamatan', 'Desa', 'Dusun', 'Latitude', 'Longitude', 'Status', 'RSSI', 'Provider', 'Populasi', 'Luas', 'Elevasi', 'Keterangan'];
    const rows = filteredData.map(p => [
        p.id, p.kec, p.desa, p.dusun, p.lat, p.lng, p.status,
        p.rssi || 'N/A', p.provider, p.populasi, p.luas, p.elev, p.ket
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `blank_spot_${new Date().toISOString().split('T')[0]}.csv`
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Berhasil mengekspor ${filteredData.length} data`, 'success');
}

// ==================== FORM SUBMIT ====================
document.addEventListener('DOMContentLoaded', () => {
    const savedHash = localStorage.getItem('adminPasswordHash');
    if (savedHash) {
        ADMIN_CREDENTIALS.passwordHash = savedHash;
    }

    checkLogin();

    const pointForm = document.getElementById('pointForm');
    if (pointForm) {
        pointForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const idEdit = parseInt(document.getElementById('editId').value);
            const pointData = {
                dusun: document.getElementById('dusun').value,
                desa: document.getElementById('desa').value,
                kec: document.getElementById('kec').value,
                status: document.getElementById('status').value,
                lat: parseFloat(document.getElementById('lat').value),
                lng: parseFloat(document.getElementById('lng').value),
                populasi: parseInt(document.getElementById('populasi').value) || 0,
                provider: document.getElementById('provider').value,
                luas: document.getElementById('luas').value,
                elev: parseInt(document.getElementById('elev').value) || 0,
                ket: document.getElementById('ket').value
            };
            if (idEdit) {
                updatePoint(idEdit, pointData);
            } else {
                addPoint(pointData);
            }
            closeModal();
        });
    }

    // Close modal on overlay click
    window.onclick = (event) => {
        const modal = document.getElementById('pointModal');
        if (event.target === modal && modal) modal.style.display = 'none';
    };
});

// ==================== HELPERS ====================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(msg, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle'}"></i> ${escapeHtml(msg)}`;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toastOut .3s ease forwards';
        setTimeout(() => t.remove(), 300);
    }, 3200);
}

// Make functions global
window.login = login;
window.logout = logout;
window.togglePassword = togglePassword;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.refreshAllData = refreshAllData;
window.editPoint = editPoint;
window.deletePoint = deletePoint;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.exportToCSV = exportToCSV;
window.clearSearch = clearSearch;
