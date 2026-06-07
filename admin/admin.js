// ============================================
// ADMIN PANEL - GOOGLE SHEETS SYNC (FIXED)
// Disesuaikan dengan struktur sheet
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycby-LWBOE7STiH2J-7_XOXOx7Cj8jxUXWtPQCFesmEO3LNN4gKtYyE-bGmSmPOh2swYR/exec';

// Konfigurasi Login
const ADMIN_CREDENTIALS = {
  username: 'admin',
  passwordHash: 'YWRtaW4xMjM='
};

let isLoggedIn = false;
let currentAdmin = null;
let pointsData = [];
let lastSyncTime = null;
let isSyncing = false;

// ========== FIXED API FUNCTIONS ==========

// Fungsi untuk mengirim data ke Google Sheets
async function sendToGoogleSheets(action, data = {}) {
  try {
    addLog(`🔄 ${action} - Mengirim ke Google Sheets...`, 'info');
    
    // Buat FormData untuk menghindari CORS issues
    const formData = new URLSearchParams();
    formData.append('action', action);
    formData.append('data', JSON.stringify(data));
    
    // Gunakan mode 'cors' dengan method POST
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        addLog(`✅ ${action} berhasil: ${result.message || ''}`, 'success');
        return { success: true, data: result.data };
      } else {
        addLog(`❌ ${action} gagal: ${result.error || 'Unknown error'}`, 'error');
        return { success: false, error: result.error };
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    addLog(`❌ Error koneksi: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// Fungsi untuk mengambil data dari Google Sheets
async function fetchDataFromSheets() {
  try {
    addLog('📥 Mengambil data dari Google Sheets...', 'info');
    
    const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`, {
      method: 'GET',
      mode: 'cors'
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.data) {
        if (result.data.length > 0) {
          // Map data sesuai struktur sheet
          pointsData = result.data.map(item => ({
            id: parseInt(item.id) || Date.now(),
            kec: item.kec || '',
            desa: item.desa || '',
            dusun: item.dusun || '',
            lat: parseFloat(item.lat || item.latitude || 0),
            lng: parseFloat(item.lng || item.longitude || 0),
            status: item.status || 'blank',
            rssi: item.rssi || -70,
            provider: item.provider || '',
            populasi: parseInt(item.populasi) || 0,
            luas: item.luas || '-',
            elev: parseInt(item.elev || item.elevasi) || 0,
            ket: item.ket || item.keterangan || '',
            coverage2025: item.coverage2025 || '',
            coverage2026: item.coverage2026 || '',
            timestamp: item.timestamp || new Date().toISOString()
          }));
          
          saveToLocalStorage();
          lastSyncTime = new Date();
          updateSyncStatus();
          renderAll();
          addLog(`✅ Berhasil mengambil ${pointsData.length} data dari Google Sheets`, 'success');
          showToast(`Berhasil mengambil ${pointsData.length} data`, 'success');
        } else {
          addLog('📭 Data kosong dari Google Sheets', 'info');
          pointsData = [];
          renderAll();
        }
        return pointsData;
      } else {
        throw new Error(result.error || 'Invalid response');
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    addLog(`❌ Gagal mengambil data: ${error.message}`, 'error');
    showToast('Gagal mengambil data dari Google Sheets', 'error');
    
    // Fallback ke localStorage
    loadFromLocalStorage();
    return pointsData;
  }
}

// Fungsi push data ke Google Sheets (batch)
async function pushToSheets() {
  if (isSyncing) {
    showToast('Sinkronisasi sedang berjalan...', 'warning');
    return;
  }
  
  if (pointsData.length === 0) {
    addLog('⚠️ Tidak ada data untuk disinkronkan', 'warning');
    showToast('Tidak ada data untuk disinkronkan', 'warning');
    return;
  }
  
  isSyncing = true;
  const pushBtn = document.getElementById('pushToSheetBtn');
  if (pushBtn) {
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyinkronkan...';
  }
  
  try {
    addLog(`📤 Menyinkronkan ${pointsData.length} data ke Google Sheets...`, 'info');
    
    // Kirim semua data sekaligus
    const result = await sendToGoogleSheets('sync', { 
      data: pointsData,
      timestamp: new Date().toISOString()
    });
    
    if (result.success) {
      addLog(`✅ Berhasil menyinkronkan ${pointsData.length} data`, 'success');
      showToast(`Berhasil menyinkronkan ${pointsData.length} data`, 'success');
      lastSyncTime = new Date();
      updateSyncStatus();
    } else {
      addLog(`❌ Sinkronisasi gagal: ${result.error}`, 'error');
      showToast('Sinkronisasi gagal, coba lagi', 'error');
    }
  } catch (error) {
    addLog(`❌ Error sinkronisasi: ${error.message}`, 'error');
    showToast('Error saat sinkronisasi', 'error');
  } finally {
    isSyncing = false;
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.innerHTML = '<i class="fas fa-upload"></i> Push ke Google Sheets';
    }
  }
}

// Fungsi untuk single add/update
async function syncSinglePoint(point, action) {
  const result = await sendToGoogleSheets(action, point);
  return result.success;
}

// Update fungsi addPoint
async function addPoint(pointData) {
  const newId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id), 0) + 1 : 1;
  const newPoint = { 
    id: newId, 
    ...pointData, 
    rssi: pointData.status === 'blank' ? -90 : -70,
    timestamp: new Date().toISOString(),
    coverage2025: '',
    coverage2026: ''
  };
  
  pointsData.push(newPoint);
  saveToLocalStorage();
  renderAll();
  addLog(`➕ Menambahkan titik: ${newPoint.dusun} (ID: ${newId})`, 'success');
  showToast(`Titik "${newPoint.dusun}" berhasil ditambahkan`, 'success');
  
  // Sync ke Google Sheets
  await syncSinglePoint(newPoint, 'add');
  return newPoint;
}

// Update fungsi updatePoint
async function updatePoint(id, updatedData) {
  const index = pointsData.findIndex(p => p.id === id);
  if (index !== -1) {
    pointsData[index] = { 
      ...pointsData[index], 
      ...updatedData, 
      timestamp: new Date().toISOString() 
    };
    saveToLocalStorage();
    renderAll();
    addLog(`✏️ Update titik: ${updatedData.dusun} (ID: ${id})`, 'info');
    showToast(`Titik "${updatedData.dusun}" berhasil diperbarui`, 'success');
    
    // Sync ke Google Sheets
    await syncSinglePoint(pointsData[index], 'update');
  }
}

// Update fungsi deletePoint
async function deletePoint(id) {
  if (confirm('Hapus titik ini? Data akan dihapus dari Google Sheets juga.')) {
    const point = pointsData.find(p => p.id === id);
    pointsData = pointsData.filter(p => p.id !== id);
    saveToLocalStorage();
    renderAll();
    addLog(`🗑️ Hapus titik: ${point?.dusun} (ID: ${id})`, 'warning');
    showToast(`Titik "${point?.dusun}" berhasil dihapus`, 'success');
    
    // Sync ke Google Sheets
    await syncSinglePoint({ id: id }, 'delete');
  }
}

// Test koneksi yang lebih baik
async function testConnection() {
  addLog('🔌 Menguji koneksi ke Google Sheets...', 'info');
  
  try {
    const result = await sendToGoogleSheets('test', { timestamp: Date.now() });
    
    if (result.success) {
      addLog('✅ Koneksi berhasil! Google Sheets API merespon dengan baik', 'success');
      showToast('Koneksi berhasil', 'success');
      
      // Update status badge
      const apiStatus = document.getElementById('apiStatus');
      if (apiStatus) {
        apiStatus.className = 'status-badge status-connected';
        apiStatus.innerHTML = 'Terhubung';
      }
      return true;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    addLog(`❌ Koneksi gagal: ${error.message}`, 'error');
    showToast('Koneksi gagal, periksa URL API', 'error');
    
    const apiStatus = document.getElementById('apiStatus');
    if (apiStatus) {
      apiStatus.className = 'status-badge';
      apiStatus.style.background = '#FEE2E2';
      apiStatus.style.color = '#DC2626';
      apiStatus.innerHTML = 'Gagal Terhubung';
    }
    return false;
  }
}

// ========== SISANYA SAMA DENGAN SEBELUMNYA ==========

function showToast(msg, type = 'success') {
  let t = document.createElement('div'); 
  t.className = `toast-admin toast-${type}`; 
  t.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.prepend(logEntry);
    while (logContainer.children.length > 20) {
      logContainer.removeChild(logContainer.lastChild);
    }
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
    addLog(`📂 Memuat ${pointsData.length} data dari localStorage`, 'info');
  } else {
    pointsData = [];
    addLog('📂 Memulai dengan data kosong', 'info');
  }
  const savedSync = localStorage.getItem('lastSyncTime');
  if (savedSync) lastSyncTime = new Date(savedSync);
  updateSyncStatus();
}

function updateSyncStatus() {
  const syncStatusSpan = document.getElementById('syncStatus');
  const lastSyncSpan = document.getElementById('lastSync');
  if (syncStatusSpan) syncStatusSpan.innerHTML = '<i class="fas fa-check-circle"></i> Tersinkronasi';
  if (lastSyncSpan && lastSyncTime) lastSyncSpan.textContent = lastSyncTime.toLocaleString();
}

function renderStats() {
  const blank = pointsData.filter(p => p.status === 'blank').length;
  const lemah = pointsData.filter(p => p.status === 'lemah').length;
  const sedang = pointsData.filter(p => p.status === 'sedang').length;
  const baik = pointsData.filter(p => p.status === 'baik').length;
  const total = pointsData.length;
  
  const statGrid = document.getElementById('statGrid');
  if (statGrid) {
    if (total === 0) {
      statGrid.innerHTML = `
        <div class="stat-card"><div class="stat-title">Total Titik</div><div class="stat-number">0</div><div class="stat-sub">Belum ada data</div></div>
        <div class="stat-card"><div class="stat-title">Blank Spot</div><div class="stat-number" style="color:#DC2626">0</div><div class="stat-sub">Prioritas tinggi</div></div>
        <div class="stat-card"><div class="stat-title">Sinyal Lemah</div><div class="stat-number" style="color:#D97706">0</div><div class="stat-sub">Perlu perbaikan</div></div>
        <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">0</div><div class="stat-sub">0% coverage</div></div>
      `;
    } else {
      statGrid.innerHTML = `
        <div class="stat-card"><div class="stat-title">Total Titik</div><div class="stat-number">${total}</div><div class="stat-sub">Kedewan + Kasiman</div></div>
        <div class="stat-card"><div class="stat-title">Blank Spot</div><div class="stat-number" style="color:#DC2626">${blank}</div><div class="stat-sub">Prioritas tinggi</div></div>
        <div class="stat-card"><div class="stat-title">Sinyal Lemah</div><div class="stat-number" style="color:#D97706">${lemah}</div><div class="stat-sub">Perlu perbaikan</div></div>
        <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">${baik}</div><div class="stat-sub">${total > 0 ? Math.round(baik/total*100) : 0}% coverage</div></div>
      `;
    }
  }
}

function renderTable() {
  const searchInput = document.getElementById('searchPoint');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const filtered = pointsData.filter(p => 
    p.dusun.toLowerCase().includes(search) || 
    p.desa.toLowerCase().includes(search)
  );
  
  const tbody = document.getElementById('tableBody');
  if (tbody) {
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 60px;">
            <div class="empty-state-container">
              <div class="empty-icon"><i class="fas fa-map-marker-alt"></i></div>
              <div class="empty-title">Belum ada data titik</div>
              <div class="empty-desc">Klik tombol "Tambah Titik" untuk menambahkan data blank spot</div>
              <button class="btn-primary" onclick="document.getElementById('addPointBtn').click()" style="margin-top: 16px;">
                <i class="fas fa-plus"></i> Tambah Titik Pertama
              </button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = filtered.map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${p.dusun}</td>
          <td>${p.desa}</td>
          <td>${p.kec}</td>
          <td><span class="badge-status badge-${p.status}">${p.status.toUpperCase()}</span></td>
          <td>${p.populasi}</td>
          <td>${p.provider || '-'}</td>
          <td class="action-icons">
            <i class="fas fa-edit" onclick="editPoint(${p.id})"></i> 
            <i class="fas fa-trash-alt" onclick="deletePoint(${p.id})"></i>
          </td>
        </tr>
      `).join('');
    }
  }
}

function renderAll() {
  renderStats();
  renderTable();
}

function resetToDefault() {
  if (confirm('Reset ke data kosong? Semua data yang ada akan hilang.')) {
    pointsData = [];
    saveToLocalStorage();
    renderAll();
    addLog('🔄 Data direset ke kosong', 'warning');
    showToast('Data berhasil direset ke kosong', 'info');
  }
}

// ========== EVENT LISTENERS ==========
function initEventListeners() {
  // Tab Navigation
  const tabs = document.querySelectorAll('.nav-item');
  const views = {
    dashboard: document.getElementById('dashboardView'),
    points: document.getElementById('pointsView'),
    sync: document.getElementById('syncView'),
    settings: document.getElementById('settingsView')
  };
  
  tabs.forEach(tab => {
    if (tab.classList.contains('logout-item')) return;
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      Object.keys(views).forEach(v => { 
        if (views[v]) views[v].style.display = 'none'; 
      });
      if (target === 'dashboard' && views.dashboard) views.dashboard.style.display = 'block';
      else if (target === 'points' && views.points) views.points.style.display = 'block';
      else if (target === 'sync' && views.sync) views.sync.style.display = 'block';
      else if (target === 'settings' && views.settings) views.settings.style.display = 'block';
      
      const mainTitle = document.getElementById('mainTitle');
      if (mainTitle) {
        mainTitle.innerText = target === 'dashboard' ? 'Dashboard SIG 2026' : 
                              target === 'points' ? 'Kelola Titik Survei' : 
                              target === 'sync' ? 'Sinkronisasi' : 'Pengaturan';
      }
    });
  });
  
  // Modal Events
  const addPointBtn = document.getElementById('addPointBtn');
  if (addPointBtn) {
    addPointBtn.addEventListener('click', () => {
      document.getElementById('pointForm').reset();
      document.getElementById('editId').value = '';
      document.getElementById('modalTitle').innerText = 'Tambah Titik Baru';
      document.getElementById('pointModal').style.display = 'flex';
    });
  }
  
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document.getElementById('pointModal').style.display = 'none';
    });
  }
  
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
      document.getElementById('pointModal').style.display = 'none';
    });
  }
  
  // Sync Buttons
  const syncNowBtn = document.getElementById('syncNowBtn');
  if (syncNowBtn) syncNowBtn.addEventListener('click', pushToSheets);
  
  const pushToSheetBtn = document.getElementById('pushToSheetBtn');
  if (pushToSheetBtn) pushToSheetBtn.addEventListener('click', pushToSheets);
  
  const pullFromSheetBtn = document.getElementById('pullFromSheetBtn');
  if (pullFromSheetBtn) pullFromSheetBtn.addEventListener('click', fetchDataFromSheets);
  
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  if (testConnectionBtn) testConnectionBtn.addEventListener('click', testConnection);
  
  const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
  if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', fetchDataFromSheets);
  
  const saveApiConfig = document.getElementById('saveApiConfig');
  if (saveApiConfig) {
    saveApiConfig.addEventListener('click', () => {
      const newUrl = document.getElementById('apiUrl').value;
      if (newUrl) {
        localStorage.setItem('googleApiUrl', newUrl);
        showToast('Konfigurasi disimpan', 'success');
      }
    });
  }
  
  const resetDataBtn = document.getElementById('resetDataBtn');
  if (resetDataBtn) resetDataBtn.addEventListener('click', resetToDefault);
  
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
      const oldPass = document.getElementById('oldPassword').value;
      const newPass = document.getElementById('newPassword').value;
      const confirmPass = document.getElementById('confirmPassword').value;
      
      if (!oldPass || !newPass || !confirmPass) {
        showToast('Semua field password harus diisi!', 'error');
        return;
      }
      
      changePassword(oldPass, newPass, confirmPass);
      
      // Clear password fields
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    });
  }
  
  const searchPoint = document.getElementById('searchPoint');
  if (searchPoint) searchPoint.addEventListener('input', () => renderTable());
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  
  // Close modal on outside click
  window.onclick = (event) => {
    const modal = document.getElementById('pointModal');
    if (event.target === modal && modal) modal.style.display = 'none';
  };
}

function changePassword(oldPassword, newPassword, confirmPassword) {
  const encodedOldPassword = btoa(oldPassword);
  if (encodedOldPassword !== ADMIN_CREDENTIALS.passwordHash) {
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

function login(username, password) {
  const encodedPassword = btoa(password);
  
  if (username === ADMIN_CREDENTIALS.username && encodedPassword === ADMIN_CREDENTIALS.passwordHash) {
    isLoggedIn = true;
    currentAdmin = username;
    
    localStorage.setItem('adminLoggedIn', 'true');
    localStorage.setItem('currentAdmin', username);
    localStorage.setItem('loginTime', new Date().getTime().toString());
    
    showAdminContent();
    showToast(`Selamat datang, ${username}!`, 'success');
    return true;
  }
  return false;
}

function logout() {
  isLoggedIn = false;
  currentAdmin = null;
  localStorage.removeItem('adminLoggedIn');
  localStorage.removeItem('currentAdmin');
  localStorage.removeItem('loginTime');
  
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('loginForm').reset();
  showToast('Anda telah logout', 'info');
}

function checkLoginStatus() {
  const savedLogin = localStorage.getItem('adminLoggedIn');
  const savedAdmin = localStorage.getItem('currentAdmin');
  const loginTime = localStorage.getItem('loginTime');
  
  if (savedLogin === 'true' && savedAdmin && loginTime) {
    const now = new Date().getTime();
    const loginTimeNum = parseInt(loginTime);
    const eightHours = 8 * 60 * 60 * 1000;
    
    if (now - loginTimeNum < eightHours) {
      isLoggedIn = true;
      currentAdmin = savedAdmin;
      showAdminContent();
      return true;
    } else {
      logout();
      return false;
    }
  }
  return false;
}

function showAdminContent() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  document.getElementById('adminName').textContent = currentAdmin || 'Admin';
  
  loadFromLocalStorage();
  renderAll();
  initEventListeners();
}

function showLoginError(message) {
  const errorDiv = document.getElementById('loginError');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 3000);
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  const savedHash = localStorage.getItem('adminPasswordHash');
  if (savedHash) {
    ADMIN_CREDENTIALS.passwordHash = savedHash;
  }
  
  if (!checkLoginStatus()) {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('adminContent').style.display = 'none';
  }
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      
      if (login(username, password)) {
        document.getElementById('loginForm').reset();
      } else {
        showLoginError('Username atau password salah!');
      }
    });
  }
  
  const passwordInput = document.getElementById('loginPassword');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('loginForm').dispatchEvent(new Event('submit'));
      }
    });
  }
});

// Make functions global for onclick
window.editPoint = editPoint;
window.deletePoint = deletePoint;
