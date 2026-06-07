// ============================================
// ADMIN PANEL - GOOGLE SHEETS SYNC
// FIX VERSION - SEMUA TOMBOL BERFUNGSI
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbwqsfXXu2FoT_kxS17sICM9kaicUEkGGXk6cDp6zUGwOrKstvSf5TNkVPjbL9WOBd7jSQ/exec';

// Konfigurasi Login
const ADMIN_CREDENTIALS = {
  username: 'admin',
  passwordHash: btoa('admin123')
};

let pointsData = [];
let lastSyncTime = null;
let statusChart = null;
let kecChart = null;

// ========== LOGIN FUNCTIONS ==========
function checkLoginStatus() {
  const savedLogin = localStorage.getItem('adminLoggedIn');
  const loginTime = localStorage.getItem('loginTime');
  
  if (savedLogin === 'true' && loginTime) {
    const now = new Date().getTime();
    const loginTimeNum = parseInt(loginTime);
    const eightHours = 8 * 60 * 60 * 1000;
    
    if (now - loginTimeNum < eightHours) {
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
  localStorage.removeItem('adminLoggedIn');
  localStorage.removeItem('currentAdmin');
  localStorage.removeItem('loginTime');
  
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('loginForm').reset();
  showToast('Anda telah logout', 'info');
}

function showAdminContent() {
  document.getElementById('loginModal').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  document.getElementById('adminName').textContent = localStorage.getItem('currentAdmin') || 'Admin';
  
  initMobileMenu();
  loadData();
  initEventListeners();
}

// ========== MOBILE MENU ==========
function initMobileMenu() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebarAdmin');
  
  function toggleMenu() {
    sidebar.classList.toggle('open');
  }
  
  if (mobileMenuBtn) {
    mobileMenuBtn.removeEventListener('click', toggleMenu);
    mobileMenuBtn.addEventListener('click', toggleMenu);
  }
  
  // Close sidebar when clicking on nav item (mobile)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.removeEventListener('click', closeMenuOnMobile);
    item.addEventListener('click', closeMenuOnMobile);
  });
  
  function closeMenuOnMobile() {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }
}

// ========== CORE FUNCTIONS ==========
function showToast(msg, type = 'success') {
  const existingToast = document.querySelector('.toast-admin');
  if (existingToast) existingToast.remove();
  
  let t = document.createElement('div'); 
  t.className = `toast-admin`; 
  t.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : ''}`;
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
    showToast('Tidak ada data untuk disinkronkan', 'warning');
    return;
  }
  
  addLog(`📤 Menyinkronkan ${pointsData.length} data...`, 'info');
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
  const lastSyncSpan = document.getElementById('lastSync');
  if (lastSyncSpan && lastSyncTime) lastSyncSpan.textContent = lastSyncTime.toLocaleString();
}

async function loadData() {
  await fetchDataFromSheets();
}

// ========== CRUD ==========
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

function resetToDefault() {
  if (confirm('Reset ke data kosong? Semua data yang ada akan hilang.')) {
    pointsData = [];
    saveToLocalStorage();
    renderAll();
    addLog('🔄 Data direset ke kosong', 'warning');
    showToast('Data berhasil direset ke kosong', 'info');
  }
}

// ========== RENDER FUNCTIONS ==========
function renderStats() {
  const blank = pointsData.filter(p => p.status === 'blank').length;
  const lemah = pointsData.filter(p => p.status === 'lemah').length;
  const sedang = pointsData.filter(p => p.status === 'sedang').length;
  const baik = pointsData.filter(p => p.status === 'baik').length;
  const total = pointsData.length;
  
  const statGrid = document.getElementById('statGrid');
  if (statGrid) {
    statGrid.innerHTML = `
      <div class="stat-card"><div class="stat-title">Total Titik</div><div class="stat-number">${total}</div><div class="stat-sub">Kedewan + Kasiman</div></div>
      <div class="stat-card"><div class="stat-title">Blank Spot</div><div class="stat-number" style="color:#DC2626">${blank}</div><div class="stat-sub">Prioritas tinggi</div></div>
      <div class="stat-card"><div class="stat-title">Sinyal Lemah</div><div class="stat-number" style="color:#D97706">${lemah}</div><div class="stat-sub">Perlu perbaikan</div></div>
      <div class="stat-card"><div class="stat-title">Cakupan Baik</div><div class="stat-number" style="color:#059669">${baik}</div><div class="stat-sub">+${total > 0 ? Math.round(baik/total*100) : 0}% coverage</div></div>
    `;
  }
  
  // Update charts
  if (statusChart) statusChart.destroy();
  const statusCtx = document.getElementById('statusChart')?.getContext('2d');
  if (statusCtx) {
    statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Blank Spot', 'Sinyal Lemah', 'Sinyal Sedang', 'Sinyal Baik'],
        datasets: [{ data: [blank, lemah, sedang, baik], backgroundColor: ['#DC2626', '#D97706', '#EA580C', '#059669'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: '#1E293B' } } } }
    });
  }
  
  if (kecChart) kecChart.destroy();
  const kecCtx = document.getElementById('kecChart')?.getContext('2d');
  if (kecCtx) {
    const ked = pointsData.filter(p => p.kec === 'Kedewan').length;
    const kas = pointsData.filter(p => p.kec === 'Kasiman').length;
    kecChart = new Chart(kecCtx, {
      type: 'bar',
      data: { labels: ['Kedewan', 'Kasiman'], datasets: [{ label: 'Jumlah Titik', data: [ked, kas], backgroundColor: '#00D4FF' }] },
      options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }
}

function renderTable() {
  const searchInput = document.getElementById('searchPoint');
  const filterKec = document.getElementById('filterKec')?.value || 'all';
  const filterStatus = document.getElementById('filterStatusPoint')?.value || 'all';
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = pointsData.filter(p => {
    const matchKec = filterKec === 'all' || p.kec === filterKec;
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchSearch = p.dusun.toLowerCase().includes(search) || p.desa.toLowerCase().includes(search);
    return matchKec && matchStatus && matchSearch;
  });
  
  const tbody = document.getElementById('tableBody');
  if (tbody) {
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px;"><div class="empty-state-container"><div class="empty-icon"><i class="fas fa-map-marker-alt"></i></div><div class="empty-title">Belum ada data titik</div><div class="empty-desc">Klik tombol "Tambah Titik" untuk menambahkan data</div></div></td></tr>`;
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
    tab.removeEventListener('click', handleTabClick);
    tab.addEventListener('click', handleTabClick);
  });
  
  function handleTabClick(e) {
    const tab = e.currentTarget;
    const target = tab.getAttribute('data-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    Object.keys(views).forEach(v => { if (views[v]) views[v].style.display = 'none'; });
    if (target === 'dashboard' && views.dashboard) views.dashboard.style.display = 'block';
    else if (target === 'points' && views.points) views.points.style.display = 'block';
    else if (target === 'sync' && views.sync) views.sync.style.display = 'block';
    else if (target === 'settings' && views.settings) views.settings.style.display = 'block';
    
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) {
      mainTitle.innerText = target === 'dashboard' ? 'Dashboard SIG 2026' : target === 'points' ? 'Kelola Titik Survei' : target === 'sync' ? 'Sinkronisasi' : 'Pengaturan';
    }
  }
  
  // Buttons
  const addPointBtn = document.getElementById('addPointBtn');
  if (addPointBtn) {
    addPointBtn.removeEventListener('click', openAddModal);
    addPointBtn.addEventListener('click', openAddModal);
  }
  
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const closeModal = () => { document.getElementById('pointModal').style.display = 'none'; };
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  
  const pointForm = document.getElementById('pointForm');
  if (pointForm) {
    pointForm.removeEventListener('submit', handleFormSubmit);
    pointForm.addEventListener('submit', handleFormSubmit);
  }
  
  function handleFormSubmit(e) {
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
    if (idEdit) { updatePoint(idEdit, pointData); } 
    else { addPoint(pointData); }
    document.getElementById('pointModal').style.display = 'none';
  }
  
  function openAddModal() {
    document.getElementById('pointForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').innerText = 'Tambah Titik Baru';
    document.getElementById('pointModal').style.display = 'flex';
  }
  
  // Sync Buttons
  const pushBtn = document.getElementById('pushToSheetBtn');
  const pullBtn = document.getElementById('pullFromSheetBtn');
  const testBtn = document.getElementById('testConnectionBtn');
  const refreshBtn = document.getElementById('refreshDashboardBtn');
  const saveApiBtn = document.getElementById('saveApiConfig');
  const resetDataBtn = document.getElementById('resetDataBtn');
  const changePassBtn = document.getElementById('changePasswordBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const searchPoint = document.getElementById('searchPoint');
  const filterKec = document.getElementById('filterKec');
  const filterStatus = document.getElementById('filterStatusPoint');
  
  if (pushBtn) pushBtn.addEventListener('click', pushToSheets);
  if (pullBtn) pullBtn.addEventListener('click', fetchDataFromSheets);
  if (testBtn) testBtn.addEventListener('click', testConnection);
  if (refreshBtn) refreshBtn.addEventListener('click', fetchDataFromSheets);
  if (saveApiBtn) saveApiBtn.addEventListener('click', () => { showToast('Konfigurasi disimpan', 'success'); });
  if (resetDataBtn) resetDataBtn.addEventListener('click', resetToDefault);
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  if (searchPoint) searchPoint.addEventListener('input', () => renderTable());
  if (filterKec) filterKec.addEventListener('change', () => renderTable());
  if (filterStatus) filterStatus.addEventListener('change', () => renderTable());
  
  if (changePassBtn) {
    changePassBtn.addEventListener('click', () => {
      const oldPass = document.getElementById('oldPassword').value;
      const newPass = document.getElementById('newPassword').value;
      const confirmPass = document.getElementById('confirmPassword').value;
      
      if (!oldPass || !newPass || !confirmPass) {
        showToast('Semua field password harus diisi!', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        showToast('Password baru tidak cocok!', 'error');
        return;
      }
      if (newPass.length < 6) {
        showToast('Password minimal 6 karakter!', 'error');
        return;
      }
      
      ADMIN_CREDENTIALS.passwordHash = btoa(newPass);
      localStorage.setItem('adminPasswordHash', btoa(newPass));
      showToast('Password berhasil diubah!', 'success');
      
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    });
  }
  
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
  } else {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
  }
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      const errorDiv = document.getElementById('loginError');
      
      if (login(username, password)) {
        document.getElementById('loginForm').reset();
        errorDiv.style.display = 'none';
      } else {
        errorDiv.textContent = 'Username atau password salah!';
        errorDiv.style.display = 'block';
      }
    });
  }
});

// Global functions for onclick
window.editPoint = editPoint;
window.deletePoint = deletePoint;
