// ============================================
// ADMIN PANEL - GOOGLE SHEETS SYNC (FULL VERSION)
// ============================================

// Konfigurasi - GANTI DENGAN URL APPS SCRIPT ANDA
let API_URL = 'https://script.google.com/macros/s/AKfycbysTozpdNCnONuBs7XkoG3pCsnHNDyt6ZMDCXqg3tQ64iGqfjEhTWfa7mcDrdm76ftZ/exec';

// Konfigurasi Login
const ADMIN_CREDENTIALS = {
  username: 'admin',
  passwordHash: btoa('admin123')
};

let isLoggedIn = false;
let currentAdmin = null;
let pointsData = [];
let lastSyncTime = null;
let isSyncing = false;

// ========== LOAD SAVED API URL ==========
function loadApiConfig() {
  const savedUrl = localStorage.getItem('googleApiUrl');
  if (savedUrl) {
    API_URL = savedUrl;
    const apiUrlInput = document.getElementById('apiUrl');
    if (apiUrlInput) apiUrlInput.value = savedUrl;
  }
}

function saveApiConfig() {
  const newUrl = document.getElementById('apiUrl').value;
  if (newUrl) {
    API_URL = newUrl;
    localStorage.setItem('googleApiUrl', newUrl);
    showToast('Konfigurasi API disimpan', 'success');
    addLog('🔧 URL API diupdate: ' + newUrl.substring(0, 50) + '...', 'info');
  }
}

// ========== UI FUNCTIONS ==========
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast-admin toast-${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.prepend(logEntry);
    while (logContainer.children.length > 30) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ========== DATA STORAGE ==========
function saveToLocalStorage() {
  localStorage.setItem('sigAdminPoints', JSON.stringify(pointsData));
  if (lastSyncTime) localStorage.setItem('lastSyncTime', lastSyncTime.toISOString());
  console.log('Data saved to localStorage:', pointsData.length, 'items');
}

function loadFromLocalStorage() {
  const stored = localStorage.getItem('sigAdminPoints');
  console.log('Loading from localStorage...');
  
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
  
  renderAll();
}

function updateSyncStatus() {
  const syncStatusSpan = document.getElementById('syncStatus');
  const lastSyncSpan = document.getElementById('lastSync');
  if (syncStatusSpan) syncStatusSpan.innerHTML = '<i class="fas fa-database"></i> Local Storage';
  if (lastSyncSpan && lastSyncTime) lastSyncSpan.textContent = lastSyncTime.toLocaleString();
  else if (lastSyncSpan) lastSyncSpan.textContent = 'Belum pernah sync';
}

// ========== RENDER FUNCTIONS ==========
function renderStats() {
  console.log('renderStats dipanggil, total data:', pointsData.length);
  
  const blank = pointsData.filter(p => p.status === 'blank').length;
  const lemah = pointsData.filter(p => p.status === 'lemah').length;
  const sedang = pointsData.filter(p => p.status === 'sedang').length;
  const baik = pointsData.filter(p => p.status === 'baik').length;
  const total = pointsData.length;
  
  const statGrid = document.getElementById('statGrid');
  if (!statGrid) {
    console.error('Element statGrid tidak ditemukan!');
    return;
  }
  
  if (total === 0) {
    statGrid.innerHTML = `
      <div class="stat-card"><div class="stat-title">Total Titik</div><div class="stat-number">0</div><div class="stat-sub">Belum ada data</div></div>
      <div class="stat-card"><div class="stat-title">Blank Spot</div><div class="stat-number" style="color:#DC2626">0</div><div class="stat-sub">Prioritas tinggi</div></div>
      <div class="stat-card"><div class="stat-title">Sinyal Lemah</div><div class="stat-number" style="color:#D97706">0</div><div class="stat-sub">Perlu perbaikan</div></div>
      <div class="stat-card"><div class="stat-title">Sinyal Sedang</div><div class="stat-number" style="color:#EA580C">0</div><div class="stat-sub">Cukup stabil</div></div>
      <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">0</div><div class="stat-sub">0% coverage</div></div>
    `;
  } else {
    const coveragePercent = total > 0 ? Math.round((baik / total) * 100) : 0;
    statGrid.innerHTML = `
      <div class="stat-card"><div class="stat-title">Total Titik</div><div class="stat-number">${total}</div><div class="stat-sub">Kedewan + Kasiman</div></div>
      <div class="stat-card"><div class="stat-title">Blank Spot</div><div class="stat-number" style="color:#DC2626">${blank}</div><div class="stat-sub">Prioritas tinggi</div></div>
      <div class="stat-card"><div class="stat-title">Sinyal Lemah</div><div class="stat-number" style="color:#D97706">${lemah}</div><div class="stat-sub">Perlu perbaikan</div></div>
      <div class="stat-card"><div class="stat-title">Sinyal Sedang</div><div class="stat-number" style="color:#EA580C">${sedang}</div><div class="stat-sub">Cukup stabil</div></div>
      <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">${baik}</div><div class="stat-sub">${coveragePercent}% coverage</div></div>
    `;
  }
}

function renderTable() {
  const searchInput = document.getElementById('searchPoint');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const filtered = pointsData.filter(p => 
    (p.dusun && p.dusun.toLowerCase().includes(search)) || 
    (p.desa && p.desa.toLowerCase().includes(search))
  );
  
  const tbody = document.getElementById('tableBody');
  if (!tbody) {
    console.error('Element tableBody tidak ditemukan!');
    return;
  }
  
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
        <td>${p.id || '-'}</td>
        <td>${p.dusun || '-'}</td>
        <td>${p.desa || '-'}</td>
        <td>${p.kec || '-'}</td>
        <td><span class="badge-status badge-${p.status || 'blank'}">${(p.status || 'blank').toUpperCase()}</span></td>
        <td>${p.populasi || 0}</td>
        <td>${p.provider || '-'}</td>
        <td class="action-icons">
          <i class="fas fa-edit" onclick="editPoint(${p.id})"></i> 
          <i class="fas fa-trash-alt" onclick="deletePoint(${p.id})"></i>
        </td>
      </tr>
    `).join('');
  }
}

function renderAll() {
  console.log('===== RENDERALL DIPANGGIL =====');
  renderStats();
  renderTable();
  console.log('===== RENDERALL SELESAI =====');
}

// ========== DATA MANAGEMENT ==========
function addSampleData() {
  if (pointsData.length > 0) {
    if (confirm('Data sudah ada. Tambahkan sample data? Data yang ada akan ditambahkan (tidak dihapus).')) {
      addSampleDataToExisting();
    }
  } else {
    addSampleDataToExisting();
  }
}

function addSampleDataToExisting() {
  const newId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id), 0) + 1 : 1;
  
  const samplePoints = [
    {
      id: newId,
      dusun: 'Dk. Ngrowo',
      desa: 'Kedewan',
      kec: 'Kedewan',
      status: 'blank',
      lat: -7.105,
      lng: 111.630,
      populasi: 1250,
      provider: 'Telkomsel',
      luas: '2.5 ha',
      elev: 150,
      ket: 'Tertutup perbukitan'
    },
    {
      id: newId + 1,
      dusun: 'Dk. Sumberjo',
      desa: 'Kedewan',
      kec: 'Kedewan',
      status: 'lemah',
      lat: -7.108,
      lng: 111.635,
      populasi: 850,
      provider: 'XL',
      luas: '1.8 ha',
      elev: 120,
      ket: 'Jarak jauh dari BTS'
    },
    {
      id: newId + 2,
      dusun: 'Dk. Krajan',
      desa: 'Kasiman',
      kec: 'Kasiman',
      status: 'sedang',
      lat: -7.112,
      lng: 111.640,
      populasi: 2100,
      provider: 'Indosat',
      luas: '3.2 ha',
      elev: 100,
      ket: 'Cukup stabil'
    },
    {
      id: newId + 3,
      dusun: 'Dk. Ngepung',
      desa: 'Kasiman',
      kec: 'Kasiman',
      status: 'baik',
      lat: -7.115,
      lng: 111.645,
      populasi: 3200,
      provider: 'Telkomsel',
      luas: '4.0 ha',
      elev: 90,
      ket: 'Dekat tower'
    }
  ];
  
  for (const point of samplePoints) {
    pointsData.push(point);
  }
  
  saveToLocalStorage();
  renderAll();
  addLog(`📝 Menambahkan ${samplePoints.length} data sample`, 'success');
  showToast(`${samplePoints.length} data sample ditambahkan`, 'success');
}

function addPoint(pointData) {
  const newId = pointsData.length > 0 ? Math.max(...pointsData.map(p => p.id), 0) + 1 : 1;
  const newPoint = { 
    id: newId, 
    ...pointData, 
    rssi: pointData.status === 'blank' ? -90 : (pointData.status === 'lemah' ? -80 : (pointData.status === 'sedang' ? -65 : -50))
  };
  
  pointsData.push(newPoint);
  saveToLocalStorage();
  renderAll();
  addLog(`➕ Menambahkan titik: ${newPoint.dusun} (ID: ${newId})`, 'success');
  showToast(`Titik "${newPoint.dusun}" berhasil ditambahkan`, 'success');
  
  return newPoint;
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
  }
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

// ========== GOOGLE SHEETS API FUNCTIONS ==========
async function testConnection() {
  addLog('🔌 Menguji koneksi ke Google Sheets...', 'info');
  showToast('Menguji koneksi...', 'info');
  
  try {
    const url = `${API_URL}?action=test&t=${Date.now()}`;
    addLog(`📡 Mengirim request ke: ${API_URL.substring(0, 50)}...`, 'info');
    
    const response = await fetch(url, { method: 'GET', mode: 'cors' });
    
    if (response.ok) {
      const result = await response.json();
      addLog(`✅ Response: ${JSON.stringify(result)}`, 'success');
      
      if (result.success) {
        addLog('✅ Koneksi berhasil!', 'success');
        showToast('Koneksi berhasil', 'success');
        
        const apiStatus = document.getElementById('apiStatus');
        if (apiStatus) {
          apiStatus.className = 'status-badge status-connected';
          apiStatus.innerHTML = 'Terhubung';
        }
        return true;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    addLog(`❌ Koneksi gagal: ${error.message}`, 'error');
    showToast('Koneksi gagal: ' + error.message, 'error');
    
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

async function fetchDataFromSheets() {
  addLog('📥 Mengambil data dari Google Sheets...', 'info');
  showToast('Mengambil data dari Google Sheets...', 'info');
  
  try {
    const url = `${API_URL}?action=getData&t=${Date.now()}`;
    const response = await fetch(url, { method: 'GET', mode: 'cors' });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    
    if (result.success && result.data && result.data.length > 0) {
      pointsData = result.data.map(item => ({
        id: parseInt(item.id) || Date.now(),
        kec: item.kec || '',
        desa: item.desa || '',
        dusun: item.dusun || '',
        lat: parseFloat(item.lat || 0),
        lng: parseFloat(item.lng || 0),
        status: item.status || 'blank',
        rssi: item.rssi || -70,
        provider: item.provider || '',
        populasi: parseInt(item.populasi) || 0,
        luas: item.luas || '-',
        elev: parseInt(item.elev) || 0,
        ket: item.ket || ''
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
      renderAll();
    }
    return pointsData;
  } catch (error) {
    addLog(`❌ Gagal mengambil data: ${error.message}`, 'error');
    showToast('Gagal mengambil data: ' + error.message, 'error');
    loadFromLocalStorage();
    return pointsData;
  }
}

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
  
  let successCount = 0;
  let errorCount = 0;
  
  try {
    addLog(`📤 Mulai sinkronisasi ${pointsData.length} data...`, 'info');
    
    for (let i = 0; i < pointsData.length; i++) {
      const point = pointsData[i];
      addLog(`📤 [${i+1}/${pointsData.length}] Mengirim: ${point.dusun}...`, 'info');
      
      try {
        const formData = new URLSearchParams();
        formData.append('action', 'add');
        formData.append('data', JSON.stringify(point));
        
        const response = await fetch(API_URL, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            successCount++;
            addLog(`✅ [${i+1}/${pointsData.length}] Berhasil: ${point.dusun}`, 'success');
          } else {
            errorCount++;
            addLog(`❌ [${i+1}/${pointsData.length}] Gagal: ${result.error}`, 'error');
          }
        } else {
          errorCount++;
          addLog(`❌ [${i+1}/${pointsData.length}] HTTP ${response.status}`, 'error');
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        errorCount++;
        addLog(`❌ [${i+1}/${pointsData.length}] Error: ${error.message}`, 'error');
      }
    }
    
    addLog(`✅ Selesai: ${successCount} sukses, ${errorCount} gagal`, successCount > 0 ? 'success' : 'error');
    showToast(`Selesai: ${successCount} sukses, ${errorCount} gagal`, successCount > 0 ? 'success' : 'error');
    
    if (successCount > 0) {
      lastSyncTime = new Date();
      updateSyncStatus();
    }
    
  } catch (error) {
    addLog(`❌ Error: ${error.message}`, 'error');
    showToast('Error: ' + error.message, 'error');
  } finally {
    isSyncing = false;
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.innerHTML = '<i class="fas fa-upload"></i> Push ke Google Sheets';
    }
  }
}

// ========== CHANGE PASSWORD ==========
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
  
  if (newPassword.length < 4) {
    showToast('Password minimal 4 karakter!', 'error');
    return false;
  }
  
  ADMIN_CREDENTIALS.passwordHash = btoa(newPassword);
  localStorage.setItem('adminPasswordHash', btoa(newPassword));
  showToast('Password berhasil diubah!', 'success');
  addLog('🔐 Password admin diubah', 'info');
  return true;
}

// ========== LOGIN FUNCTIONS ==========
function login(username, password) {
  const encodedPassword = btoa(password);
  
  if (username === ADMIN_CREDENTIALS.username && encodedPassword === ADMIN_CREDENTIALS.passwordHash) {
    isLoggedIn = true;
    currentAdmin = username;
    
    localStorage.setItem('adminLoggedIn', 'true');
    localStorage.setItem('currentAdmin', username);
    localStorage.setItem('loginTime', Date.now().toString());
    
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
  const loginTime = localStorage.getItem('loginTime');
  
  if (savedLogin === 'true' && loginTime) {
    const now = Date.now();
    const loginTimeNum = parseInt(loginTime);
    if (now - loginTimeNum < 8 * 60 * 60 * 1000) {
      isLoggedIn = true;
      currentAdmin = localStorage.getItem('currentAdmin');
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
  
  loadApiConfig();
  loadFromLocalStorage();
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
        if (target === 'dashboard') mainTitle.innerText = 'Dashboard SIG 2026';
        else if (target === 'points') mainTitle.innerText = 'Kelola Titik Survei';
        else if (target === 'sync') mainTitle.innerText = 'Sinkronisasi';
        else mainTitle.innerText = 'Pengaturan';
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
  
  const saveApiConfigBtn = document.getElementById('saveApiConfig');
  if (saveApiConfigBtn) saveApiConfigBtn.addEventListener('click', saveApiConfig);
  
  const resetDataBtn = document.getElementById('resetDataBtn');
  if (resetDataBtn) resetDataBtn.addEventListener('click', resetToDefault);
  
  const addSampleDataBtn = document.getElementById('addSampleDataBtn');
  if (addSampleDataBtn) addSampleDataBtn.addEventListener('click', addSampleData);
  
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
  
  // Close modal on outside click
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
        showLoginError('Username atau password salah! (admin/admin123)');
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
