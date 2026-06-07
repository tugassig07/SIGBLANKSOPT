// ============================================
// ADMIN PANEL - GOOGLE SHEETS SYNC
// DENGAN SISTEM LOGIN
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbwqsfXXu2FoT_kxS17sICM9kaicUEkGGXk6cDp6zUGwOrKstvSf5TNkVPjbL9WOBd7jSQ/exec';

// Konfigurasi Login (Username & Password)
// Default: admin / admin123
const ADMIN_CREDENTIALS = {
  username: 'admin',
  passwordHash: 'YWRtaW4xMjM=' // admin123 in base64
};

let isLoggedIn = false;
let currentAdmin = null;
let pointsData = [];
let lastSyncTime = null;

// ========== LOGIN FUNCTIONS ==========
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

// ========== CORE FUNCTIONS ==========
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

async function callGoogleAPI(action, data = {}) {
  try {
    const payload = { action, ...data };
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    addLog(`📤 ${action.toUpperCase()} request sent`, 'info');
    return { success: true };
  } catch (error) {
    addLog(`❌ API Error: ${error.message}`, 'error');
    return null;
  }
}

async function fetchDataFromSheets() {
  try {
    addLog('📥 Mengambil data dari Google Sheets...', 'info');
    const response = await fetch(API_URL);
    const result = await response.json();
    
    if (result.success && result.data && result.data.length > 0) {
      pointsData = result.data.map(item => ({
        id: parseInt(item.id), kec: item.kec, desa: item.desa, dusun: item.dusun,
        lat: parseFloat(item.lat), lng: parseFloat(item.lng), status: item.status,
        rssi: item.rssi, provider: item.provider, populasi: parseInt(item.populasi),
        luas: item.luas || '-', elev: parseInt(item.elev) || 0, ket: item.ket || ''
      }));
      saveToLocalStorage();
      lastSyncTime = new Date();
      updateSyncStatus();
      renderAll();
      addLog(`✅ Berhasil mengambil ${pointsData.length} data`, 'success');
      showToast(`Berhasil mengambil ${pointsData.length} data`, 'success');
    } else {
      addLog('📭 Data kosong dari Google Sheets', 'info');
      pointsData = [];
      saveToLocalStorage();
      renderAll();
    }
    return pointsData;
  } catch (error) {
    addLog(`❌ Error: ${error.message}`, 'error');
    loadFromLocalStorage();
    return null;
  }
}

async function pushToSheets() {
  if (pointsData.length === 0) {
    addLog('⚠️ Tidak ada data untuk disinkronkan', 'warning');
    showToast('Tidak ada data untuk disinkronkan', 'warning');
    return;
  }
  
  addLog(`📤 Menyinkronkan ${pointsData.length} data...`, 'info');
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
  addLog('🔌 Menguji koneksi...', 'info');
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

function addPoint(pointData) {
  const newId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id), 0) + 1 : 1;
  const newPoint = { id: newId, ...pointData, rssi: pointData.status === 'blank' ? null : -70 };
  pointsData.push(newPoint);
  saveToLocalStorage();
  renderAll();
  addLog(`➕ Menambahkan titik: ${newPoint.dusun} (ID: ${newId})`, 'success');
  showToast(`Titik "${newPoint.dusun}" berhasil ditambahkan`, 'success');
  callGoogleAPI('add', newPoint);
  return newPoint;
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
    document.getElementById('modalTitle').innerText = 'Edit Titik';
    document.getElementById('pointModal').style.display = 'flex';
  }
}

function updatePoint(id, updatedData) {
  const index = pointsData.findIndex(p => p.id === id);
  if (index !== -1) {
    pointsData[index] = { ...pointsData[index], ...updatedData };
    saveToLocalStorage();
    renderAll();
    addLog(`✏️ Update titik: ${updatedData.dusun} (ID: ${id})`, 'info');
    showToast(`Titik "${updatedData.dusun}" berhasil diperbarui`, 'success');
    callGoogleAPI('update', pointsData[index]);
  }
}

function deletePoint(id) {
  if (confirm('Hapus titik ini?')) {
    const point = pointsData.find(p => p.id === id);
    pointsData = pointsData.filter(p => p.id !== id);
    saveToLocalStorage();
    renderAll();
    addLog(`🗑️ Hapus titik: ${point?.dusun} (ID: ${id})`, 'warning');
    showToast(`Titik "${point?.dusun}" berhasil dihapus`, 'success');
    callGoogleAPI('delete', { id: id });
  }
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
        <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">${baik}</div><div class="stat-sub">+${Math.round(baik/total*100)}% coverage</div></div>
      `;
    }
  }
}

function renderTable() {
  const searchInput = document.getElementById('searchPoint');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const filtered = pointsData.filter(p => p.dusun.toLowerCase().includes(search) || p.desa.toLowerCase().includes(search));
  
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
          <td class="action-icons"><i class="fas fa-edit" onclick="editPoint(${p.id})"></i> <i class="fas fa-trash-alt" onclick="deletePoint(${p.id})"></i></td>
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
      Object.keys(views).forEach(v => { if (views[v]) views[v].style.display = 'none'; });
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
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    });
  }
  
  const searchPoint = document.getElementById('searchPoint');
  if (searchPoint) searchPoint.addEventListener('input', () => renderTable());
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  
  window.onclick = (event) => {
    const modal = document.getElementById('pointModal');
    if (event.target === modal && modal) modal.style.display = 'none';
  };
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

window.editPoint = editPoint;
window.deletePoint = deletePoint;
