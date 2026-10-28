// App State
const client = window.supabaseClient;
let currentUser = null;
let guestFolderContext = null; // { folderId, email, role, folderName }
let bookmarks = [];
let folders = [];
let currentFilter = {
  folderId: 'all',
  searchQuery: ''
};

// UI Elements - Screens
const authScreen = document.getElementById('authScreen');
const guestScreen = document.getElementById('guestScreen');

// Auth Form Elements
const authForm = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authModeTitle = document.getElementById('authModeTitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
let isSignUp = false;

// Guest Access Elements
const guestFolderTitle = document.getElementById('guestFolderTitle');
const guestFolderSubtitle = document.getElementById('guestFolderSubtitle');
const guestCheckStep = document.getElementById('guestCheckStep');
const guestCheckForm = document.getElementById('guestCheckForm');
const guestEmailInput = document.getElementById('guestEmailInput');
const guestCheckBtn = document.getElementById('guestCheckBtn');
const guestRequestStep = document.getElementById('guestRequestStep');
const guestRequestForm = document.getElementById('guestRequestForm');
const guestReqEmail = document.getElementById('guestReqEmail');
const guestReqRole = document.getElementById('guestReqRole');
const guestRequestBtn = document.getElementById('guestRequestBtn');
const guestBackBtn = document.getElementById('guestBackBtn');
const guestRequestedSuccess = document.getElementById('guestRequestedSuccess');
const guestMailtoLink = document.getElementById('guestMailtoLink');
const guestCheckAgainBtn = document.getElementById('guestCheckAgainBtn');

// Dashboard UI Elements
const userEmailEl = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const bookmarkGrid = document.getElementById('bookmarkGrid');
const searchInput = document.getElementById('searchInput');
const folderListEl = document.getElementById('folderList');
const viewTitle = document.getElementById('viewTitle');
const viewCount = document.getElementById('viewCount');
const folderPillContainerEl = document.getElementById('folderPillContainer');
let activeModalFolderIds = new Set();

// Navigation Buttons
const navAll = document.getElementById('navAll');
const navFavorites = document.getElementById('navFavorites');
const navShared = document.getElementById('navShared');

// Modals
const bookmarkModal = document.getElementById('bookmarkModal');
const folderModal = document.getElementById('folderModal');
const shareModal = document.getElementById('shareModal');

// Forms
const bookmarkForm = document.getElementById('bookmarkForm');
const folderForm = document.getElementById('folderForm');
const shareForm = document.getElementById('shareForm');

// Share modal elements
const shareLinkUrl = document.getElementById('shareLinkUrl');
const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
const pendingRequestsSection = document.getElementById('pendingRequestsSection');
const pendingRequestsBadge = document.getElementById('pendingRequestsBadge');
const pendingRequestsList = document.getElementById('pendingRequestsList');

// Helper: Toast
function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

// -----------------------------------------------------------------------------
// Check for URL Parameter (e.g. ?folder=<id>)
// -----------------------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const targetFolderId = urlParams.get('folder');

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------
authToggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp;
  if (isSignUp) {
    authModeTitle.textContent = "Create Account";
    authSubmitBtn.textContent = "Sign Up";
    authToggleBtn.textContent = "Already have an account? Sign In";
  } else {
    authModeTitle.textContent = "Sign In";
    authSubmitBtn.textContent = "Sign In";
    authToggleBtn.textContent = "Need an account? Sign Up";
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = 'Processing...';

  try {
    if (isSignUp) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      showToast('Account created! Logging in...');
    } else {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    alert(err.message || 'Authentication error');
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (guestFolderContext) {
    localStorage.removeItem('guest_email');
    window.location.href = window.location.pathname;
    return;
  }
  await client.auth.signOut();
});

// Watch Auth State
client.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    userEmailEl.textContent = currentUser.email;
    authScreen.style.display = 'none';
    guestScreen.style.display = 'none';
    await loadInitialData();
  } else {
    currentUser = null;
    if (targetFolderId) {
      // Guest mode for folder
      authScreen.style.display = 'none';
      initGuestFolderFlow(targetFolderId);
    } else {
      authScreen.style.display = 'flex';
      guestScreen.style.display = 'none';
    }
  }
});

// -----------------------------------------------------------------------------
// Guest Access & Request Workflow
// -----------------------------------------------------------------------------
let guestFolderInfo = null; // { id, name, owner_email }

async function initGuestFolderFlow(folderId) {
  guestScreen.style.display = 'flex';

  try {
    const { data, error } = await client.rpc('get_folder_public_info', { f_id: folderId });
    if (error || !data || data.length === 0) {
      guestFolderTitle.textContent = "Folder Not Found";
      guestFolderSubtitle.textContent = "This folder may have been deleted or the link is invalid.";
      guestCheckStep.style.display = 'none';
      return;
    }

    guestFolderInfo = data[0];
    guestFolderTitle.textContent = guestFolderInfo.name;
    guestFolderSubtitle.textContent = `Shared by ${guestFolderInfo.owner_email}`;

    // Auto-check if email already remembered locally
    const savedEmail = localStorage.getItem('guest_email');
    if (savedEmail) {
      guestEmailInput.value = savedEmail;
      checkGuestAccess(savedEmail);
    }
  } catch (err) {
    console.error("Guest init error:", err);
  }
}

guestCheckForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = guestEmailInput.value.trim().toLowerCase();
  checkGuestAccess(email);
});

async function checkGuestAccess(email) {
  guestCheckBtn.disabled = true;
  guestCheckBtn.textContent = 'Verifying...';

  try {
    const { data, error } = await client.rpc('check_email_folder_access', {
      f_id: targetFolderId,
      check_email: email
    });

    if (error) throw error;

    if (data && data.length > 0 && data[0].has_access) {
      // Authorized!
      const userAccess = data[0];
      localStorage.setItem('guest_email', email);
      guestFolderContext = {
        folderId: targetFolderId,
        email: email,
        role: userAccess.role,
        folderName: userAccess.folder_name
      };
      startGuestSession();
    } else {
      // Not authorized -> Show Request Access step
      showRequestAccessStep(email);
    }
  } catch (err) {
    alert(err.message || "Failed to verify access");
  } finally {
    guestCheckBtn.disabled = false;
    guestCheckBtn.textContent = 'Access Folder';
  }
}

function showRequestAccessStep(email) {
  guestCheckStep.style.display = 'none';
  guestRequestStep.style.display = 'block';
  guestRequestedSuccess.style.display = 'none';
  guestReqEmail.value = email;
}

guestBackBtn.addEventListener('click', () => {
  guestRequestStep.style.display = 'none';
  guestCheckStep.style.display = 'block';
});

guestRequestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = guestReqEmail.value.trim().toLowerCase();
  const requestedRole = guestReqRole.value;

  guestRequestBtn.disabled = true;
  guestRequestBtn.textContent = 'Submitting...';

  try {
    const { error } = await client.rpc('submit_folder_access_request', {
      f_id: targetFolderId,
      req_email: email,
      req_role: requestedRole
    });

    if (error) throw error;

    // Build mailto link to notify owner directly
    const ownerEmail = guestFolderInfo ? guestFolderInfo.owner_email : '';
    const folderName = guestFolderInfo ? guestFolderInfo.name : 'Bookmarks Folder';
    const folderLink = window.location.href;
    const subject = encodeURIComponent(`Access Request: ${folderName}`);
    const body = encodeURIComponent(
      `Hi,\n\nI have requested ${requestedRole.toUpperCase()} access to your folder "${folderName}".\n\nRequester Email: ${email}\nFolder Link: ${folderLink}\n\nPlease approve my request in your Bookmarks dashboard.\n\nThanks!`
    );
    guestMailtoLink.href = `mailto:${ownerEmail}?subject=${subject}&body=${body}`;

    guestRequestStep.style.display = 'none';
    guestRequestedSuccess.style.display = 'block';
  } catch (err) {
    alert(err.message || 'Error sending request');
  } finally {
    guestRequestBtn.disabled = false;
    guestRequestBtn.textContent = 'Request Access';
  }
});

guestCheckAgainBtn.addEventListener('click', () => {
  const email = guestReqEmail.value.trim().toLowerCase();
  checkGuestAccess(email);
});

// Start view for authorized guest
async function startGuestSession() {
  guestScreen.style.display = 'none';
  userEmailEl.textContent = `${guestFolderContext.email} (${guestFolderContext.role})`;
  logoutBtn.title = "Exit Shared Folder";

  // Hide owner navigation sections in guest mode
  document.querySelector('.nav-section').style.display = 'none';
  document.querySelector('.nav-section:nth-of-type(2)').style.display = 'none';
  if (guestFolderContext.role !== 'editor') {
    document.getElementById('addBookmarkBtn').style.display = 'none';
  }

  viewTitle.textContent = guestFolderContext.folderName;
  await loadGuestBookmarks();
}

async function loadGuestBookmarks() {
  try {
    const { data, error } = await client.rpc('get_shared_folder_bookmarks', {
      f_id: guestFolderContext.folderId,
      guest_email: guestFolderContext.email
    });

    if (error) throw error;
    bookmarks = (data || []).map(b => ({
      ...b,
      folder_ids: [guestFolderContext.folderId]
    }));
    renderBookmarks();
  } catch (err) {
    console.error("Error loading guest bookmarks:", err);
  }
}

// -----------------------------------------------------------------------------
// Data Fetching (Authenticated Owner / Member)
// -----------------------------------------------------------------------------
async function loadInitialData() {
  await Promise.all([loadFolders(), loadBookmarks()]);
}

async function loadFolders() {
  try {
    const { data: folderData, error } = await client
      .from('folders')
      .select('*, folder_members(shared_with_email, role)')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading folders:', error);
      throw error;
    }
    folders = folderData || [];

    // Ensure user has a Global folder
    let globalFolder = folders.find(f => f.owner_id === currentUser.id && f.name.toLowerCase() === 'global');
    if (!globalFolder) {
      const { data: newG, error: gErr } = await client
        .from('folders')
        .insert([{ name: 'Global', color: '#18181b', owner_id: currentUser.id }])
        .select('*, folder_members(shared_with_email, role)');
      
      if (!gErr && newG && newG.length > 0) {
        folders.unshift(newG[0]);
      }
    }

    renderFolders();
    populateFolderPills();
  } catch (err) {
    console.error('Error loading folders:', err);
  }
}

async function loadBookmarks() {
  try {
    const { data, error } = await client
      .from('bookmarks')
      .select('*, bookmark_folders(folder_id)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    bookmarks = (data || []).map(b => ({
      ...b,
      folder_ids: (b.bookmark_folders || []).map(bf => bf.folder_id)
    }));
    renderBookmarks();
  } catch (err) {
    console.error('Error loading bookmarks:', err);
  }
}

// -----------------------------------------------------------------------------
// Render Folders & Pills
// -----------------------------------------------------------------------------
function renderFolders() {
  folderListEl.innerHTML = '';
  
  folders.forEach(f => {
    const isOwner = f.owner_id === currentUser.id;
    const item = document.createElement('div');
    item.className = `folder-item ${currentFilter.folderId === f.id ? 'active' : ''}`;
    
    item.innerHTML = `
      <div class="folder-meta">
        <span class="folder-color-dot" style="background-color: ${f.color || '#18181b'}"></span>
        <span class="folder-name-text">${escapeHtml(f.name)}</span>
        ${!isOwner ? '<span title="Shared with you" style="font-size: 0.72rem; opacity: 0.6;">👥</span>' : ''}
      </div>
      <div class="folder-actions">
        ${isOwner ? `
          <button class="icon-btn-mini share-folder-btn" title="Share Folder">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-4-6l-4-4-4 4m4-4v13"/></svg>
          </button>
          <button class="icon-btn-mini delete-folder-btn" title="Delete Folder">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        ` : ''}
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.share-folder-btn')) {
        openShareModal(f);
        return;
      }
      if (e.target.closest('.delete-folder-btn')) {
        deleteFolder(f.id, f.name);
        return;
      }
      setFolderFilter(f.id, f.name);
    });

    folderListEl.appendChild(item);
  });
}

function populateFolderPills(selectedIds = []) {
  folderPillContainerEl.innerHTML = '';
  if (folders.length === 0) {
    folderPillContainerEl.innerHTML = '<span style="color:var(--text-dim); font-size: 0.78rem;">No folders created yet</span>';
    return;
  }

  const globalFolder = folders.find(f => f.owner_id === (currentUser ? currentUser.id : '') && f.name.toLowerCase() === 'global');
  const globalId = globalFolder ? globalFolder.id : null;

  activeModalFolderIds = new Set(selectedIds);
  if (globalId) activeModalFolderIds.add(globalId);

  folders.forEach(f => {
    const isGlobal = (f.id === globalId);
    const isSelected = activeModalFolderIds.has(f.id);

    const chip = document.createElement('div');
    chip.className = `folder-chip ${isSelected ? 'selected' : ''} ${isGlobal ? 'locked' : ''}`;
    chip.dataset.folderId = f.id;

    chip.innerHTML = `
      <span class="folder-color-dot" style="background-color: ${f.color || '#18181b'}"></span>
      <span>${escapeHtml(f.name)}</span>
      ${isGlobal 
        ? '' 
        : (isSelected 
            ? '<span class="chip-cross" title="Remove">×</span>' 
            : '<span class="chip-cross" style="font-size:0.8rem; opacity:0.6;" title="Add">+</span>')
      }
    `;

    if (!isGlobal) {
      chip.addEventListener('click', () => {
        if (activeModalFolderIds.has(f.id)) {
          activeModalFolderIds.delete(f.id);
        } else {
          activeModalFolderIds.add(f.id);
        }
        populateFolderPills(Array.from(activeModalFolderIds));
      });
    }

    folderPillContainerEl.appendChild(chip);
  });
}

// -----------------------------------------------------------------------------
// Render Bookmarks
// -----------------------------------------------------------------------------
function renderBookmarks() {
  const filtered = bookmarks.filter(b => {
    // In guest mode, everything loaded is for the guest folder
    if (guestFolderContext) {
      if (currentFilter.searchQuery) {
        const q = currentFilter.searchQuery.toLowerCase();
        return (b.title && b.title.toLowerCase().includes(q)) ||
               (b.url && b.url.toLowerCase().includes(q)) ||
               (b.description && b.description.toLowerCase().includes(q));
      }
      return true;
    }

    // 1. Folder Filter
    if (currentFilter.folderId === 'favorites') {
      if (!b.is_favorite) return false;
    } else if (currentFilter.folderId === 'shared') {
      const isShared = (b.folder_ids || []).some(fId => {
        const folder = folders.find(f => f.id === fId);
        return folder && folder.owner_id !== currentUser.id;
      });
      if (!isShared) return false;
    } else if (currentFilter.folderId !== 'all') {
      if (!b.folder_ids || !b.folder_ids.includes(currentFilter.folderId)) return false;
    }

    // 2. Search Filter
    if (currentFilter.searchQuery) {
      const q = currentFilter.searchQuery.toLowerCase();
      const matchTitle = b.title && b.title.toLowerCase().includes(q);
      const matchUrl = b.url && b.url.toLowerCase().includes(q);
      const matchDesc = b.description && b.description.toLowerCase().includes(q);
      
      const folderNames = (b.folder_ids || []).map(fId => {
        const f = folders.find(folder => folder.id === fId);
        return f ? f.name.toLowerCase() : '';
      });
      const matchFolder = folderNames.some(fn => fn.includes(q));

      if (!matchTitle && !matchUrl && !matchDesc && !matchFolder) return false;
    }

    return true;
  });

  viewCount.textContent = `${filtered.length} link${filtered.length === 1 ? '' : 's'}`;
  bookmarkGrid.innerHTML = '';

  if (filtered.length === 0) {
    bookmarkGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        <p>No links found.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bookmark-card';
    
    let domain = '';
    try {
      domain = new URL(b.url).hostname;
    } catch (_) {
      domain = b.url;
    }
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    const assignedFolders = (b.folder_ids || [])
      .map(id => folders.find(f => f.id === id))
      .filter(Boolean);

    const isOwner = currentUser && (b.owner_id === currentUser.id);

    card.innerHTML = `
      <div class="bookmark-card-top">
        <div class="bookmark-favicon">
          <img src="${faviconUrl}" alt="" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' fill=\\\'none\\\' stroke=\\\'%23999\\\' viewBox=\\\'0 0 24 24\\\'><path d=\\\'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71\\\'/></svg>'"/>
        </div>
        <div class="bookmark-info">
          <a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer" class="bookmark-title" title="${escapeHtml(b.title)}">
            ${escapeHtml(b.title)}
          </a>
          <div class="bookmark-url">${escapeHtml(domain)}</div>
        </div>
        ${!guestFolderContext ? `
          <button class="icon-btn-mini fav-btn" title="Favorite">
            <svg width="15" height="15" fill="${b.is_favorite ? '#f59e0b' : 'none'}" stroke="${b.is_favorite ? '#f59e0b' : 'currentColor'}" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        ` : ''}
      </div>

      ${b.description ? `<p class="bookmark-desc">${escapeHtml(b.description)}</p>` : ''}

      <div class="bookmark-footer">
        <div class="bookmark-folders">
          ${assignedFolders.map(f => `
            <span class="bookmark-folder-badge">
              <span class="folder-color-dot" style="background-color:${f.color || '#18181b'}"></span>
              ${escapeHtml(f.name)}
            </span>
          `).join('')}
        </div>
        <div class="bookmark-actions">
          <button class="icon-btn-mini copy-btn" title="Copy Link">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          ${isOwner ? `
            <button class="icon-btn-mini edit-btn" title="Edit">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn-mini del-btn" title="Delete">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Action button listeners
    const favBtn = card.querySelector('.fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(b);
      });
    }

    card.querySelector('.copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(b.url);
      showToast('Link copied');
    });

    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBookmarkModal(b);
      });
    }

    const delBtn = card.querySelector('.del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBookmark(b.id);
      });
    }

    // Clicking anywhere on card opens link directly
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      window.open(b.url, '_blank', 'noopener,noreferrer');
    });

    bookmarkGrid.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// Filters & Search
// -----------------------------------------------------------------------------
function setFolderFilter(fId, title) {
  currentFilter.folderId = fId;
  viewTitle.textContent = title;
  document.querySelectorAll('.nav-btn, .folder-item').forEach(el => el.classList.remove('active'));
  
  if (fId === 'all') navAll.classList.add('active');
  else if (fId === 'favorites') navFavorites.classList.add('active');
  else if (fId === 'shared') navShared.classList.add('active');
  else renderFolders();

  renderBookmarks();
}

navAll.addEventListener('click', () => setFolderFilter('all', 'All Links'));
navFavorites.addEventListener('click', () => setFolderFilter('favorites', 'Favorites'));
navShared.addEventListener('click', () => setFolderFilter('shared', 'Shared with Me'));

searchInput.addEventListener('input', (e) => {
  currentFilter.searchQuery = e.target.value.trim();
  renderBookmarks();
});

window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && !isModalOpen()) {
    e.preventDefault();
    searchInput.focus();
  }
});

function isModalOpen() {
  return document.querySelector('.modal-backdrop.open') !== null;
}

// -----------------------------------------------------------------------------
// Bookmark Operations
// -----------------------------------------------------------------------------
let editingBookmarkId = null;

function openBookmarkModal(b = null) {
  editingBookmarkId = b ? b.id : null;
  document.getElementById('bookmarkModalTitle').textContent = b ? 'Edit Link' : 'Add Link';
  
  document.getElementById('bmUrl').value = b ? b.url : '';
  document.getElementById('bmTitle').value = b ? b.title : '';
  document.getElementById('bmDesc').value = b ? (b.description || '') : '';
  
  let selectedFolderIds = [];
  if (b) {
    selectedFolderIds = b.folder_ids || [];
  } else if (currentFilter.folderId.length > 10) {
    selectedFolderIds = [currentFilter.folderId];
  }
  populateFolderPills(selectedFolderIds);

  bookmarkModal.classList.add('open');
  if (!b) document.getElementById('bmUrl').focus();
}

document.getElementById('bmUrl').addEventListener('blur', (e) => {
  const urlVal = e.target.value.trim();
  const titleInput = document.getElementById('bmTitle');
  if (urlVal && !titleInput.value) {
    try {
      const u = new URL(urlVal);
      titleInput.value = u.hostname.replace('www.', '');
    } catch (_) {}
  }
});

bookmarkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('bmUrl').value.trim();
  const title = document.getElementById('bmTitle').value.trim();
  const description = document.getElementById('bmDesc').value.trim();

  const selectedFolderIds = Array.from(activeModalFolderIds);

  try {
    let bookmarkId = editingBookmarkId;

    if (editingBookmarkId) {
      const { error } = await client
        .from('bookmarks')
        .update({ url, title, description, updated_at: new Date().toISOString() })
        .eq('id', editingBookmarkId);
      if (error) throw error;

      await client.from('bookmark_folders').delete().eq('bookmark_id', editingBookmarkId);
      showToast('Link updated');
    } else {
      const { data, error } = await client
        .from('bookmarks')
        .insert([{
          owner_id: currentUser ? currentUser.id : null,
          url,
          title,
          description
        }])
        .select()
        .single();
      if (error) throw error;
      bookmarkId = data.id;
      showToast('Link added');
    }

    if (selectedFolderIds.length > 0) {
      const folderInserts = selectedFolderIds.map(fId => ({
        bookmark_id: bookmarkId,
        folder_id: fId
      }));
      const { error: relError } = await client.from('bookmark_folders').insert(folderInserts);
      if (relError) console.error("Relation insert error:", relError);
    }

    bookmarkModal.classList.remove('open');
    if (guestFolderContext) {
      await loadGuestBookmarks();
    } else {
      await loadBookmarks();
    }
  } catch (err) {
    alert(err.message || 'Error saving link');
  }
});

async function toggleFavorite(b) {
  try {
    const { error } = await client
      .from('bookmarks')
      .update({ is_favorite: !b.is_favorite })
      .eq('id', b.id);
    if (error) throw error;
    b.is_favorite = !b.is_favorite;
    renderBookmarks();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteBookmark(id) {
  if (!confirm('Delete this link?')) return;
  try {
    const { error } = await client.from('bookmarks').delete().eq('id', id);
    if (error) throw error;
    showToast('Link deleted');
    await loadBookmarks();
  } catch (err) {
    alert(err.message);
  }
}

// -----------------------------------------------------------------------------
// Folder Operations
// -----------------------------------------------------------------------------
function openFolderModal() {
  document.getElementById('folderName').value = '';
  document.getElementById('folderColor').value = '#18181b';
  folderModal.classList.add('open');
}

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('folderName').value.trim();
  const color = document.getElementById('folderColor').value;

  if (!name) return;

  const alreadyExists = folders.some(
    f => f.owner_id === currentUser.id && f.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (alreadyExists) {
    alert(`A folder named "${name}" already exists.`);
    return;
  }

  try {
    const { error } = await client
      .from('folders')
      .insert([{ name, color, owner_id: currentUser.id }]);
    if (error) {
      if (error.code === '23505') {
        throw new Error(`A folder named "${name}" already exists.`);
      }
      throw error;
    }

    folderModal.classList.remove('open');
    showToast(`Folder "${name}" created`);
    await loadFolders();
  } catch (err) {
    alert(err.message || 'Error creating folder');
  }
});

async function deleteFolder(folderId, name) {
  if (!confirm(`Delete folder "${name}"? Links inside it won't be deleted.`)) return;
  try {
    const { error } = await client.from('folders').delete().eq('id', folderId);
    if (error) throw error;
    showToast('Folder deleted');
    if (currentFilter.folderId === folderId) {
      setFolderFilter('all', 'All Links');
    }
    await loadFolders();
    await loadBookmarks();
  } catch (err) {
    alert(err.message);
  }
}

// -----------------------------------------------------------------------------
// Folder Sharing & Access Requests Manager
// -----------------------------------------------------------------------------
let activeSharingFolder = null;

async function openShareModal(folder) {
  activeSharingFolder = folder;
  document.getElementById('shareFolderName').textContent = folder.name;
  document.getElementById('shareEmail').value = '';
  document.getElementById('shareRole').value = 'viewer';
  
  // Set shareable link
  const cleanUrl = window.location.origin + window.location.pathname + `?folder=${folder.id}`;
  shareLinkUrl.textContent = cleanUrl;
  copyShareLinkBtn.onclick = () => {
    navigator.clipboard.writeText(cleanUrl);
    showToast('Folder link copied to clipboard');
  };

  await Promise.all([refreshMemberList(), refreshPendingRequests()]);
  shareModal.classList.add('open');
}

async function refreshPendingRequests() {
  pendingRequestsList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-dim)">Loading requests...</p>';

  try {
    const { data, error } = await client
      .from('folder_access_requests')
      .select('*')
      .eq('folder_id', activeSharingFolder.id)
      .eq('status', 'pending');

    if (error) throw error;

    if (!data || data.length === 0) {
      pendingRequestsSection.style.display = 'none';
      return;
    }

    pendingRequestsSection.style.display = 'block';
    pendingRequestsBadge.textContent = data.length;
    pendingRequestsList.innerHTML = '';

    data.forEach(req => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding: 0.4rem 0; border-bottom: 1px solid #fde68a; font-size: 0.8rem;';
      
      row.innerHTML = `
        <div style="min-width: 0; flex: 1;">
          <div style="font-weight: 550; color: #78350f;">${escapeHtml(req.requester_email)}</div>
          <div style="font-size: 0.72rem; color: #92400e;">Requested: <strong>${req.requested_role}</strong></div>
        </div>
        <div style="display:flex; align-items:center; gap: 0.35rem; flex-shrink: 0;">
          <select class="form-control grant-role-select" style="font-size: 0.75rem; padding: 2px 4px; height: 26px; width: 75px;">
            <option value="viewer" ${req.requested_role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="editor" ${req.requested_role === 'editor' ? 'selected' : ''}>Editor</option>
          </select>
          <button class="btn btn-primary approve-req-btn" style="font-size: 0.72rem; padding: 3px 7px;">Approve</button>
          <button class="icon-btn-mini reject-req-btn" title="Reject">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;

      // Approve handler
      row.querySelector('.approve-req-btn').addEventListener('click', async () => {
        const grantedRole = row.querySelector('.grant-role-select').value;
        const { error: appErr } = await client.rpc('approve_folder_request', {
          request_id: req.id,
          granted_role: grantedRole
        });

        if (appErr) {
          alert(appErr.message);
        } else {
          showToast(`Approved ${req.requester_email} as ${grantedRole}`);
          await Promise.all([refreshMemberList(), refreshPendingRequests()]);
        }
      });

      // Reject handler
      row.querySelector('.reject-req-btn').addEventListener('click', async () => {
        const { error: rejErr } = await client.from('folder_access_requests').delete().eq('id', req.id);
        if (rejErr) alert(rejErr.message);
        else {
          showToast('Request dismissed');
          await refreshPendingRequests();
        }
      });

      pendingRequestsList.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading pending requests:", err);
  }
}

async function refreshMemberList() {
  const listEl = document.getElementById('sharedMembersList');
  listEl.innerHTML = '<p style="font-size:0.75rem; color:var(--text-dim)">Loading members...</p>';

  try {
    const { data, error } = await client
      .from('folder_members')
      .select('*')
      .eq('folder_id', activeSharingFolder.id);

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="font-size:0.78rem; color:var(--text-dim)">Not shared with anyone yet.</p>';
      return;
    }

    listEl.innerHTML = '';
    data.forEach(m => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding: 0.4rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.82rem;';
      row.innerHTML = `
        <div>
          <span>${escapeHtml(m.shared_with_email)}</span>
          <span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 6px;">(${m.role})</span>
        </div>
        <button class="icon-btn-mini remove-share-btn" title="Revoke Access">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      row.querySelector('.remove-share-btn').addEventListener('click', async () => {
        const { error: delErr } = await client.from('folder_members').delete().eq('id', m.id);
        if (delErr) alert(delErr.message);
        else {
          showToast('Access revoked');
          refreshMemberList();
        }
      });

      listEl.appendChild(row);
    });
  } catch (err) {
    listEl.innerHTML = `<p style="color:var(--accent-danger); font-size:0.78rem">${err.message}</p>`;
  }
}

shareForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('shareEmail').value.trim().toLowerCase();
  const role = document.getElementById('shareRole').value;

  if (currentUser && email === currentUser.email.toLowerCase()) {
    alert("You cannot share a folder with yourself.");
    return;
  }

  try {
    const { error } = await client
      .from('folder_members')
      .insert([{
        folder_id: activeSharingFolder.id,
        shared_with_email: email,
        role: role
      }]);

    if (error) {
      if (error.code === '23505') throw new Error('Already shared with this email');
      throw error;
    }

    showToast(`Shared with ${email}`);
    document.getElementById('shareEmail').value = '';
    await refreshMemberList();
  } catch (err) {
    alert(err.message || 'Error sharing folder');
  }
});

// -----------------------------------------------------------------------------
// Modals Setup
// -----------------------------------------------------------------------------
document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  });
});

document.querySelectorAll('.modal-backdrop').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });
});

document.getElementById('addBookmarkBtn').addEventListener('click', () => openBookmarkModal());
document.getElementById('createFolderBtn').addEventListener('click', () => openFolderModal());

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
