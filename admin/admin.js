// ============================================
// ADMIN PANEL - DIRECT SYNC TO GOOGLE SHEETS
// USING GET METHOD FOR STABILITY
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

// ========== HELPER FUNCTION ==========
async function callApi(action, data = null, id = null) {
    try {
        let url = `${API_URL}?action=${action}&t=${Date.now()}`;
        
        if (data && (action === 'add' || action === 'update')) {
            url += `&data=${encodeURIComponent(JSON.stringify(data))}`;
        }
        
        if (id && action === 'delete') {
            url += `&id=${id}`;
        }
        
        console.log(`Calling API: ${url.substring(0, 150)}...`);
        
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

// ========== LOAD DATA FROM GOOGLE SHEETS ==========
async function loadDataFromSheets() {
    if (isLoading) return;
    isLoading = true;
    addLog('📥 Mengambil data dari Google Sheets...', 'info');
    
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
            addLog(`✅ Berhasil mengambil ${pointsData.length} data`, 'success');
        } else {
            pointsData = [];
            addLog('📭 Data kosong dari Google Sheets', 'info');
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
        const colorClass = type === 'error' ? 'log-error' : (type === 'success' ? 'log-success' : 'log-info');
        logDiv.innerHTML = `<div class="log-entry ${colorClass}">[${time}] ${msg}</div>` + logDiv.innerHTML;
        if (logDiv.children.length > 30) logDiv.removeChild(logDiv.lastChild);
    }
    console.log(`[${type.toUpperCase()}]`, msg);
}

function updateLastSync() {
    const last = localStorage.getItem('lastSync');
    document.getElementById('lastSyncTime').innerHTML = last ? new Date(last).toLocaleString() : '-';
}

// ========== CRUD OPERATIONS (USING GET) ==========
async function addPoint(data) {
    addLog(`➕ Menambahkan titik: ${data.dusun}...`, 'info');
    
    try {
        // Generate ID baru
        const maxId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id)) : 0;
        const newId = maxId + 1;
        
        const newData = {
            ...data,
            id: newId,
            rssi: data.rssi || -70,
            elev: data.elev || 0,
            ket: data.ket || ''
        };
        
        const result = await callApi('add', newData);
        
        if (result.success) {
            addLog(`✅ Titik "${data.dusun}" berhasil ditambahkan (ID: ${newId})`, 'success');
            await loadDataFromSheets();
            return true;
        } else {
            throw new Error(result.message || 'Gagal menambahkan');
        }
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
        const updateData = {
            id: id,
            ...data,
            rssi: data.rssi || -70,
            elev: data.elev || 0,
            ket: data.ket || ''
        };
        
        const result = await callApi('update', updateData);
        
        if (result.success) {
            addLog(`✅ Titik "${data.dusun}" berhasil diupdate`, 'success');
            await loadDataFromSheets();
            return true;
        } else {
            throw new Error(result.message || 'Gagal mengupdate');
        }
    } catch (error) {
        addLog(`❌ Gagal mengupdate: ${error.message}`, 'error');
        return false;
    }
}

async function deletePoint(id) {
    if (!confirm('⚠️ Hapus titik ini? Data akan dihapus permanen dari Google Sheets.')) return;
    
    const point = pointsData.find(p => p.id === id);
    const pointName = point?.dusun || `ID ${id}`;
    addLog(`🗑️ Menghapus titik: ${pointName}...`, 'info');
    
    try {
        const result = await callApi('delete', null, id);
        
        if (result.success) {
            addLog(`✅ Titik "${pointName}" berhasil dihapus dari Google Sheets`, 'success');
            await loadDataFromSheets();
            return true;
        } else {
            throw new Error(result.message || 'Gagal menghapus');
        }
    } catch (error) {
        addLog(`❌ Gagal menghapus "${pointName}": ${error.message}`, 'error');
        
        if (confirm(`Gagal menghapus "${pointName}". Ingin mencoba lagi?`)) {
            return deletePoint(id);
        }
        return false;
    }
}

// ========== GOOGLE SHEETS SYNC FUNCTIONS ==========
async function testConnection() {
    addLog('🔌 Testing connection to Google Sheets...', 'info');
    try {
        const result = await callApi('test');
        
        if (result.success) {
            addLog(`✅ Connection successful! (${result.data?.rowCount || 0} records)`, 'success');
            const connStatus = document.getElementById('connStatus');
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
        const connStatus = document.getElementById('connStatus');
        if (connStatus) {
            connStatus.innerHTML = '❌ Gagal';
            connStatus.style.background = '#fee2e2';
            connStatus.style.color = '#dc2626';
        }
        return false;
    }
}

async function pullData() {
    addLog('📥 Pulling latest data from Google Sheets...', 'info');
    await loadDataFromSheets();
    localStorage.setItem('lastSync', new Date().toISOString());
    updateLastSync();
    addLog('✅ Pull data selesai', 'success');
}

async function pushData() {
    if (pointsData.length === 0) {
        addLog('⚠️ Tidak ada data untuk dipush', 'warning');
        return;
    }
    
    addLog(`📤 Mempush ${pointsData.length} data ke Google Sheets...`, 'info');
    let success = 0;
    let failed = 0;
    
    for (const point of pointsData) {
        try {
            const result = await callApi('add', point);
            
            if (result.success) {
                success++;
                addLog(`✅ Push ${point.dusun} berhasil`, 'success');
            } else {
                failed++;
                addLog(`⚠️ Push ${point.dusun} gagal: ${result.message}`, 'warning');
            }
            
            await new Promise(r => setTimeout(r, 500));
        } catch(e) {
            failed++;
            addLog(`❌ Gagal push ${point.dusun}: ${e.message}`, 'error');
        }
    }
    
    addLog(`📊 Selesai: ${success} berhasil, ${failed} gagal dari ${pointsData.length} data`, 
           failed === 0 ? 'success' : 'warning');
    
    if (success > 0) {
        localStorage.setItem('lastSync', new Date().toISOString());
        updateLastSync();
        await loadDataFromSheets();
    }
}

// ========== SAMPLE DATA ==========
async function addSampleData() {
    const samples = [
        { dusun: 'Dk. Ngrowo', desa: 'Kedewan', kec: 'Kedewan', status: 'blank', lat: -7.105, lng: 111.63, populasi: 1250, provider: 'Telkomsel', rssi: -95, elev: 45, ket: 'Area perbukitan, sinyal sangat lemah' },
        { dusun: 'Dk. Sumberjo', desa: 'Kedewan', kec: 'Kedewan', status: 'lemah', lat: -7.108, lng: 111.635, populasi: 850, provider: 'XL', rssi: -85, elev: 52, ket: 'Jarak jauh dari BTS' },
        { dusun: 'Dk. Krajan', desa: 'Kasiman', kec: 'Kasiman', status: 'sedang', lat: -7.112, lng: 111.64, populasi: 2100, provider: 'Indosat', rssi: -75, elev: 48, ket: 'Sinyal cukup stabil' },
        { dusun: 'Dk. Ngepung', desa: 'Kasiman', kec: 'Kasiman', status: 'baik', lat: -7.115, lng: 111.645, populasi: 3200, provider: 'Telkomsel', rssi: -65, elev: 50, ket: 'Area pemukiman padat, sinyal baik' }
    ];
    
    addLog('📝 Menambahkan sample data...', 'info');
    for (const s of samples) {
        await addPoint(s);
        await new Promise(r => setTimeout(r, 500));
    }
    addLog(`✅ Selesai menambahkan ${samples.length} sample data`, 'success');
}

// ========== SETTINGS ==========
function saveApiConfig() {
    const newUrl = document.getElementById('apiUrlInput').value;
    if (newUrl && newUrl.trim()) {
        API_URL = newUrl.trim();
        localStorage.setItem('apiUrl', API_URL);
        addLog('🔧 URL API telah disimpan', 'success');
        addLog('💡 Silakan klik "Test Connection" untuk memverifikasi koneksi', 'info');
    } else {
        addLog('❌ URL API tidak boleh kosong', 'error');
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
    
    localStorage.setItem('adminPassword', newPass);
    addLog('✅ Password berhasil diubah', 'success');
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
}

// ========== EVENT LISTENERS ==========
const addPointBtn = document.getElementById('addPointBtn');
if (addPointBtn) {
    addPointBtn.addEventListener('click', () => {
        document.getElementById('pointForm').reset();
        document.getElementById('editId').value = '';
        document.getElementById('modalTitle').innerText = 'Tambah Titik';
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
            provider: document.getElementById('provider').value
        };
        
        // Validate required fields
        if (!data.dusun || !data.desa || !data.lat || !data.lng) {
            addLog('❌ Harap isi semua field yang diperlukan (Dusun, Desa, Latitude, Longitude)', 'error');
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
    refreshBtn.addEventListener('click', () => loadDataFromSheets());
}

const refreshPointsBtn = document.getElementById('refreshPointsBtn');
if (refreshPointsBtn) {
    refreshPointsBtn.addEventListener('click', () => loadDataFromSheets());
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

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('pointModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// ========== INITIALIZATION ==========
const savedUrl = localStorage.getItem('apiUrl');
if (savedUrl) API_URL = savedUrl;
const apiUrlInput = document.getElementById('apiUrlInput');
if (apiUrlInput) apiUrlInput.value = API_URL;

async function initialize() {
    if (!checkLogin()) {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('adminApp').style.display = 'none';
    }
}

initialize();

// Make functions global for onclick
window.editPoint = editPoint;
window.deletePoint = deletePoint;
window.testConnection = testConnection;
window.pullData = pullData;
window.pushData = pushData;
window.saveApiConfig = saveApiConfig;
window.changePassword = changePassword;
window.addSampleData = addSampleData;
