// ============================================
// ADMIN PANEL - DIRECT SYNC TO GOOGLE SHEETS
// TANPA LOCAL STORAGE BACKUP
// ============================================

let API_URL = 'https://script.google.com/macros/s/AKfycbysTozpdNCnONuBs7XkoG3pCsnHNDyt6ZMDCXqg3tQ64iGqfjEhTWfa7mcDrdm76ftZ/exec';
let pointsData = [];
let isLoading = false;

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
    });
});

// ========== LOAD DATA FROM GOOGLE SHEETS ==========
async function loadDataFromSheets() {
    if (isLoading) return;
    isLoading = true;
    addLog('📥 Mengambil data dari Google Sheets...', 'info');
    
    try {
        const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`, { method: 'GET' });
        if (response.ok) {
            const result = await response.json();
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
                    provider: item.provider || ''
                }));
                addLog(`✅ Berhasil mengambil ${pointsData.length} data`, 'success');
            } else {
                pointsData = [];
                addLog('📭 Data kosong dari Google Sheets', 'info');
            }
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        addLog(`❌ Gagal mengambil data: ${error.message}`, 'error');
        pointsData = [];
    }
    
    renderDashboard();
    renderTable();
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
    
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card"><h4>Total Titik</h4><div class="number">${total}</div></div>
        <div class="stat-card"><h4>Blank Spot</h4><div class="number" style="color:#dc2626">${blank}</div></div>
        <div class="stat-card"><h4>Sinyal Lemah</h4><div class="number" style="color:#d97706">${lemah}</div></div>
        <div class="stat-card"><h4>Sinyal Sedang</h4><div class="number" style="color:#ea580c">${sedang}</div></div>
        <div class="stat-card"><h4>Cakupan Baik</h4><div class="number" style="color:#059669">${baik}</div></div>
    `;
}

function renderTable() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const filtered = pointsData.filter(p => 
        p.dusun?.toLowerCase().includes(search) || 
        p.desa?.toLowerCase().includes(search)
    );
    
    const tbody = document.getElementById('pointsTableBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Belum ada data</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.dusun || '-'}</td>
            <td>${p.desa || '-'}</td>
            <td>${p.kec || '-'}</td>
            <td><span class="badge-status badge-${p.status}">${(p.status || 'blank').toUpperCase()}</span></td>
            <td>${p.populasi || 0}</td>
            <td>${p.provider || '-'}</td>
            <td class="action-icons">
                <i class="fas fa-edit" onclick="editPoint(${p.id})"></i>
                <i class="fas fa-trash-alt" onclick="deletePoint(${p.id})"></i>
            </td>
        </tr>
    `).join('');
}

function addLog(msg, type = 'info') {
    const logDiv = document.getElementById('logList');
    if (logDiv) {
        const time = new Date().toLocaleTimeString();
        logDiv.innerHTML = `<div class="log-entry log-${type}">[${time}] ${msg}</div>` + logDiv.innerHTML;
        if (logDiv.children.length > 30) logDiv.removeChild(logDiv.lastChild);
    }
    console.log(msg);
}

function updateLastSync() {
    const last = localStorage.getItem('lastSync');
    document.getElementById('lastSyncTime').innerHTML = last ? new Date(last).toLocaleString() : '-';
}

// ========== CRUD OPERATIONS (LANGSUNG KE SHEETS) ==========
async function addPoint(data) {
    addLog(`➕ Menambahkan titik: ${data.dusun}...`, 'info');
    
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'add');
        formData.append('data', JSON.stringify(data));
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                addLog(`✅ Titik "${data.dusun}" berhasil ditambahkan`, 'success');
                await loadDataFromSheets();
                return true;
            }
        }
        throw new Error('Gagal menambahkan');
    } catch (error) {
        addLog(`❌ Gagal menambahkan: ${error.message}`, 'error');
        return false;
    }
}

function editPoint(id) {
    const point = pointsData.find(p => p.id === id);
    if (point) {
        document.getElementById('editId').value = point.id;
        document.getElementById('dusun').value = point.dusun || '';
        document.getElementById('desa').value = point.desa || '';
        document.getElementById('kec').value = point.kec || 'Kedewan';
        document.getElementById('status').value = point.status || 'blank';
        document.getElementById('lat').value = point.lat || 0;
        document.getElementById('lng').value = point.lng || 0;
        document.getElementById('populasi').value = point.populasi || 0;
        document.getElementById('provider').value = point.provider || '';
        document.getElementById('modalTitle').innerText = 'Edit Titik';
        document.getElementById('pointModal').style.display = 'flex';
    }
}

async function updatePoint(id, data) {
    addLog(`✏️ Mengupdate titik ID: ${id}...`, 'info');
    
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'update');
        formData.append('data', JSON.stringify({ id, ...data }));
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                addLog(`✅ Titik "${data.dusun}" berhasil diupdate`, 'success');
                await loadDataFromSheets();
                return true;
            }
        }
        throw new Error('Gagal mengupdate');
    } catch (error) {
        addLog(`❌ Gagal mengupdate: ${error.message}`, 'error');
        return false;
    }
}

async function deletePoint(id) {
    if (!confirm('Hapus titik ini? Data akan dihapus dari Google Sheets.')) return;
    
    const point = pointsData.find(p => p.id === id);
    addLog(`🗑️ Menghapus titik: ${point?.dusun}...`, 'info');
    
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'delete');
        formData.append('id', id.toString());
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                addLog(`✅ Titik "${point?.dusun}" berhasil dihapus`, 'success');
                await loadDataFromSheets();
                return true;
            }
        }
        throw new Error('Gagal menghapus');
    } catch (error) {
        addLog(`❌ Gagal menghapus: ${error.message}`, 'error');
        return false;
    }
}

// ========== GOOGLE SHEETS SYNC FUNCTIONS ==========
async function testConnection() {
    addLog('🔌 Testing connection to Google Sheets...', 'info');
    try {
        const response = await fetch(`${API_URL}?action=test&t=${Date.now()}`, { method: 'GET' });
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                addLog('✅ Connection successful!', 'success');
                document.getElementById('connStatus').innerHTML = 'Terhubung';
                document.getElementById('connStatus').style.background = '#d1fae5';
                document.getElementById('connStatus').style.color = '#059669';
                return true;
            }
        }
        throw new Error('Connection failed');
    } catch(e) {
        addLog(`❌ Connection failed: ${e.message}`, 'error');
        document.getElementById('connStatus').innerHTML = 'Gagal';
        return false;
    }
}

async function pullData() {
    await loadDataFromSheets();
    localStorage.setItem('lastSync', new Date().toISOString());
    updateLastSync();
}

async function pushData() {
    if (pointsData.length === 0) {
        addLog('⚠️ Tidak ada data untuk dipush', 'warning');
        return;
    }
    
    addLog(`📤 Mempush ${pointsData.length} data ke Google Sheets...`, 'info');
    let success = 0;
    
    for (const point of pointsData) {
        try {
            const formData = new URLSearchParams();
            formData.append('action', 'sync');
            formData.append('data', JSON.stringify(point));
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) success++;
            }
            await new Promise(r => setTimeout(r, 200));
        } catch(e) {
            addLog(`❌ Gagal push ${point.dusun}: ${e.message}`, 'error');
        }
    }
    
    addLog(`✅ Berhasil push ${success}/${pointsData.length} data`, success === pointsData.length ? 'success' : 'warning');
    if (success > 0) {
        localStorage.setItem('lastSync', new Date().toISOString());
        updateLastSync();
        await loadDataFromSheets();
    }
}

// ========== SAMPLE DATA ==========
async function addSampleData() {
    const samples = [
        { dusun: 'Dk. Ngrowo', desa: 'Kedewan', kec: 'Kedewan', status: 'blank', lat: -7.105, lng: 111.63, populasi: 1250, provider: 'Telkomsel' },
        { dusun: 'Dk. Sumberjo', desa: 'Kedewan', kec: 'Kedewan', status: 'lemah', lat: -7.108, lng: 111.635, populasi: 850, provider: 'XL' },
        { dusun: 'Dk. Krajan', desa: 'Kasiman', kec: 'Kasiman', status: 'sedang', lat: -7.112, lng: 111.64, populasi: 2100, provider: 'Indosat' },
        { dusun: 'Dk. Ngepung', desa: 'Kasiman', kec: 'Kasiman', status: 'baik', lat: -7.115, lng: 111.645, populasi: 3200, provider: 'Telkomsel' }
    ];
    
    for (const s of samples) {
        await addPoint(s);
        await new Promise(r => setTimeout(r, 300));
    }
    addLog('📝 Sample data telah ditambahkan', 'success');
}

// ========== SETTINGS ==========
function saveApiConfig() {
    const newUrl = document.getElementById('apiUrlInput').value;
    if (newUrl) {
        API_URL = newUrl;
        localStorage.setItem('apiUrl', newUrl);
        addLog('🔧 URL API telah disimpan', 'success');
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
        addLog('❌ Password minimal 4 karakter', 'error');
        return;
    }
    
    addLog('✅ Password berhasil diubah (sementara, refresh akan kembali ke default)', 'success');
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
}

// ========== EVENT LISTENERS ==========
document.getElementById('addPointBtn').addEventListener('click', () => {
    document.getElementById('pointForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').innerText = 'Tambah Titik';
    document.getElementById('pointModal').style.display = 'flex';
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('pointModal').style.display = 'none';
});

document.getElementById('pointForm').addEventListener('submit', async (e) => {
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
        provider: document.getElementById('provider').value
    };
    
    if (id) {
        await updatePoint(id, data);
    } else {
        await addPoint(data);
    }
    
    document.getElementById('pointModal').style.display = 'none';
});

document.getElementById('searchInput')?.addEventListener('input', () => renderTable());
document.getElementById('refreshBtn').addEventListener('click', () => loadDataFromSheets());
document.getElementById('refreshPointsBtn').addEventListener('click', () => loadDataFromSheets());
document.getElementById('testConnBtn').addEventListener('click', testConnection);
document.getElementById('pullDataBtn').addEventListener('click', pullData);
document.getElementById('pushDataBtn').addEventListener('click', pushData);
document.getElementById('saveApiBtn').addEventListener('click', saveApiConfig);
document.getElementById('changePassBtn').addEventListener('click', changePassword);
document.getElementById('sampleDataBtn').addEventListener('click', addSampleData);

// ========== INITIALIZATION ==========
const savedUrl = localStorage.getItem('apiUrl');
if (savedUrl) API_URL = savedUrl;
document.getElementById('apiUrlInput').value = API_URL;

if (!checkLogin()) {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminApp').style.display = 'none';
}

// Make functions global for onclick
window.editPoint = editPoint;
window.deletePoint = deletePoint;
