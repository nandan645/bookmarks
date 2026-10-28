// App State
const client = window.supabaseClient;
let currentUser = null;
let bookmarks = [];
let folders = [];
let sharedFolderIds = new Set();
let currentFilter = {
  folderId: 'all', // 'all', 'favorites', 'shared', or specific UUID
  tag: null,
  searchQuery: ''
};

// UI Elements
const authScreen = document.getElementById('authScreen');
const authForm = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authModeTitle = document.getElementById('authModeTitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
let isSignUp = false;

const userEmailEl = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const bookmarkGrid = document.getElementById('bookmarkGrid');
const tagBar = document.getElementById('tagBar');
const searchInput = document.getElementById('searchInput');
const folderListEl = document.getElementById('folderList');
const viewTitle = document.getElementById('viewTitle');
const viewCount = document.getElementById('viewCount');

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

// Helper: Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

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
    authModeTitle.textContent = "Sign In to Bookmarks";
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
      showToast('Account created! Logging you in...', 'success');
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
  await client.auth.signOut();
});

// Watch Auth State
client.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    userEmailEl.textContent = currentUser.email;
    authScreen.style.display = 'none';
    await loadInitialData();
  } else {
    currentUser = null;
    authScreen.style.display = 'flex';
  }
});

// -----------------------------------------------------------------------------
// Data Fetching
// -----------------------------------------------------------------------------
async function loadInitialData() {
  await Promise.all([loadFolders(), loadBookmarks()]);
}

async function loadFolders() {
  try {
    const { data: folderData, error } = await supabase
      .from('folders')
      .select('*, folder_members(shared_with_email, role)')
      .order('created_at', { ascending: true });

    if (error) throw error;
    folders = folderData || [];
    renderFolders();
    populateFolderSelects();
  } catch (err) {
    console.error('Error loading folders:', err);
  }
}

async function loadBookmarks() {
  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    bookmarks = data || [];
    renderBookmarks();
    renderTags();
  } catch (err) {
    console.error('Error loading bookmarks:', err);
  }
}

// -----------------------------------------------------------------------------
// Render Functions
// -----------------------------------------------------------------------------
function renderFolders() {
  folderListEl.innerHTML = '';
  
  folders.forEach(f => {
    const isOwner = f.owner_id === currentUser.id;
    const item = document.createElement('div');
    item.className = `folder-item ${currentFilter.folderId === f.id ? 'active' : ''}`;
    
    item.innerHTML = `
      <div class="folder-meta">
        <span class="folder-color-dot" style="background-color: ${f.color || '#6366f1'}"></span>
        <span class="truncate">${escapeHtml(f.name)}</span>
        ${!isOwner ? '<span title="Shared with you" style="font-size: 0.75rem">👥</span>' : ''}
      </div>
      <div class="folder-actions">
        ${isOwner ? `
          <button class="icon-btn-mini share-folder-btn" title="Share Folder">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-4-6l-4-4-4 4m4-4v13"/></svg>
          </button>
          <button class="icon-btn-mini delete-folder-btn" title="Delete Folder">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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

function populateFolderSelects() {
  const sel = document.getElementById('bookmarkFolderSelect');
  sel.innerHTML = '<option value="">(No Folder / Root)</option>';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = (f.owner_id === currentUser.id ? '' : '👥 ') + f.name;
    sel.appendChild(opt);
  });
}

function renderTags() {
  const allTags = new Set();
  bookmarks.forEach(b => {
    if (b.tags && Array.isArray(b.tags)) {
      b.tags.forEach(t => allTags.add(t));
    }
  });

  tagBar.innerHTML = '';
  if (allTags.size === 0) return;

  const allPill = document.createElement('button');
  allPill.className = `tag-pill ${!currentFilter.tag ? 'active' : ''}`;
  allPill.textContent = 'All Tags';
  allPill.addEventListener('click', () => {
    currentFilter.tag = null;
    renderTags();
    renderBookmarks();
  });
  tagBar.appendChild(allPill);

  allTags.forEach(tag => {
    const pill = document.createElement('button');
    pill.className = `tag-pill ${currentFilter.tag === tag ? 'active' : ''}`;
    pill.textContent = `#${tag}`;
    pill.addEventListener('click', () => {
      currentFilter.tag = currentFilter.tag === tag ? null : tag;
      renderTags();
      renderBookmarks();
    });
    tagBar.appendChild(pill);
  });
}

function renderBookmarks() {
  const filtered = bookmarks.filter(b => {
    // 1. Folder Filter
    if (currentFilter.folderId === 'favorites') {
      if (!b.is_favorite) return false;
    } else if (currentFilter.folderId === 'shared') {
      const folder = folders.find(f => f.id === b.folder_id);
      if (!folder || folder.owner_id === currentUser.id) return false;
    } else if (currentFilter.folderId !== 'all') {
      if (b.folder_id !== currentFilter.folderId) return false;
    }

    // 2. Tag Filter
    if (currentFilter.tag) {
      if (!b.tags || !b.tags.includes(currentFilter.tag)) return false;
    }

    // 3. Search Filter
    if (currentFilter.searchQuery) {
      const q = currentFilter.searchQuery.toLowerCase();
      const matchTitle = b.title && b.title.toLowerCase().includes(q);
      const matchUrl = b.url && b.url.toLowerCase().includes(q);
      const matchDesc = b.description && b.description.toLowerCase().includes(q);
      const matchTag = b.tags && b.tags.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchUrl && !matchDesc && !matchTag) return false;
    }

    return true;
  });

  viewCount.textContent = `${filtered.length} link${filtered.length === 1 ? '' : 's'}`;
  bookmarkGrid.innerHTML = '';

  if (filtered.length === 0) {
    bookmarkGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        <p>No bookmarks found.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bookmark-card';
    
    // Domain & Favicon extraction
    let domain = '';
    try {
      domain = new URL(b.url).hostname;
    } catch (_) {
      domain = b.url;
    }
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

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
        <button class="icon-btn-mini fav-btn ${b.is_favorite ? 'text-amber-400' : ''}" title="Favorite">
          <svg width="16" height="16" fill="${b.is_favorite ? '#f59e0b' : 'none'}" stroke="${b.is_favorite ? '#f59e0b' : 'currentColor'}" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>

      ${b.description ? `<p class="bookmark-desc">${escapeHtml(b.description)}</p>` : ''}

      <div class="bookmark-footer">
        <div class="bookmark-tags">
          ${(b.tags || []).map(t => `<span class="bookmark-tag">#${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="bookmark-actions">
          <button class="icon-btn-mini copy-btn" title="Copy Link">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="icon-btn-mini edit-btn" title="Edit">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${b.owner_id === currentUser.id ? `
            <button class="icon-btn-mini del-btn" title="Delete">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Action events
    card.querySelector('.fav-btn').addEventListener('click', () => toggleFavorite(b));
    card.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(b.url);
      showToast('Link copied to clipboard!');
    });
    card.querySelector('.edit-btn').addEventListener('click', () => openBookmarkModal(b));
    if (b.owner_id === currentUser.id) {
      card.querySelector('.del-btn').addEventListener('click', () => deleteBookmark(b.id));
    }

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

navAll.addEventListener('click', () => setFolderFilter('all', 'All Bookmarks'));
navFavorites.addEventListener('click', () => setFolderFilter('favorites', 'Favorites'));
navShared.addEventListener('click', () => setFolderFilter('shared', 'Shared with Me'));

searchInput.addEventListener('input', (e) => {
  currentFilter.searchQuery = e.target.value.trim();
  renderBookmarks();
});

// Quick keyboard shortcut: Press '/' to focus search
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
// Bookmark Operations (Create / Update / Delete)
// -----------------------------------------------------------------------------
let editingBookmarkId = null;

function openBookmarkModal(b = null) {
  editingBookmarkId = b ? b.id : null;
  document.getElementById('bookmarkModalTitle').textContent = b ? 'Edit Bookmark' : 'Add New Bookmark';
  
  document.getElementById('bmUrl').value = b ? b.url : '';
  document.getElementById('bmTitle').value = b ? b.title : '';
  document.getElementById('bmDesc').value = b ? (b.description || '') : '';
  document.getElementById('bmTags').value = b ? (b.tags || []).join(', ') : '';
  document.getElementById('bookmarkFolderSelect').value = b ? (b.folder_id || '') : (currentFilter.folderId.length > 10 ? currentFilter.folderId : '');

  bookmarkModal.classList.add('open');
  if (!b) document.getElementById('bmUrl').focus();
}

// Auto-fill title from URL if user pastes URL first
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
  const rawTags = document.getElementById('bmTags').value;
  const folder_id = document.getElementById('bookmarkFolderSelect').value || null;

  const tags = rawTags
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean);

  try {
    if (editingBookmarkId) {
      const { error } = await supabase
        .from('bookmarks')
        .update({ url, title, description, tags, folder_id, updated_at: new Date().toISOString() })
        .eq('id', editingBookmarkId);
      if (error) throw error;
      showToast('Bookmark updated!');
    } else {
      const { error } = await supabase
        .from('bookmarks')
        .insert([{
          owner_id: currentUser.id,
          url,
          title,
          description,
          tags,
          folder_id
        }]);
      if (error) throw error;
      showToast('Bookmark added!');
    }

    bookmarkModal.classList.remove('open');
    await loadBookmarks();
  } catch (err) {
    alert(err.message || 'Error saving bookmark');
  }
});

async function toggleFavorite(b) {
  try {
    const { error } = await supabase
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
  if (!confirm('Are you sure you want to delete this bookmark?')) return;
  try {
    const { error } = await client.from('bookmarks').delete().eq('id', id);
    if (error) throw error;
    showToast('Bookmark deleted');
    await loadBookmarks();
  } catch (err) {
    alert(err.message);
  }
}

// -----------------------------------------------------------------------------
// Folder Operations (Create / Delete / Share)
// -----------------------------------------------------------------------------
function openFolderModal() {
  document.getElementById('folderName').value = '';
  document.getElementById('folderColor').value = '#6366f1';
  folderModal.classList.add('open');
}

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('folderName').value.trim();
  const color = document.getElementById('folderColor').value;

  try {
    const { error } = await supabase
      .from('folders')
      .insert([{ name, color, owner_id: currentUser.id }]);
    if (error) throw error;

    folderModal.classList.remove('open');
    showToast(`Folder "${name}" created`);
    await loadFolders();
  } catch (err) {
    alert(err.message || 'Error creating folder');
  }
});

async function deleteFolder(folderId, name) {
  if (!confirm(`Delete folder "${name}"? Bookmarks inside it will remain in root.`)) return;
  try {
    const { error } = await client.from('folders').delete().eq('id', folderId);
    if (error) throw error;
    showToast('Folder deleted');
    if (currentFilter.folderId === folderId) {
      setFolderFilter('all', 'All Bookmarks');
    }
    await loadFolders();
    await loadBookmarks();
  } catch (err) {
    alert(err.message);
  }
}

// -----------------------------------------------------------------------------
// Sharing Folder with Users / Emails
// -----------------------------------------------------------------------------
let activeSharingFolder = null;

async function openShareModal(folder) {
  activeSharingFolder = folder;
  document.getElementById('shareFolderName').textContent = folder.name;
  document.getElementById('shareEmail').value = '';
  document.getElementById('shareRole').value = 'viewer';
  
  await refreshMemberList();
  shareModal.classList.add('open');
}

async function refreshMemberList() {
  const listEl = document.getElementById('sharedMembersList');
  listEl.innerHTML = '<p style="font-size:0.8rem; color:var(--text-dim)">Loading members...</p>';

  try {
    const { data, error } = await supabase
      .from('folder_members')
      .select('*')
      .eq('folder_id', activeSharingFolder.id);

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="font-size:0.8rem; color:var(--text-dim)">Not shared with anyone yet.</p>';
      return;
    }

    listEl.innerHTML = '';
    data.forEach(m => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem;';
      row.innerHTML = `
        <div>
          <span>${escapeHtml(m.shared_with_email)}</span>
          <span class="badge" style="margin-left: 6px;">${m.role}</span>
        </div>
        <button class="icon-btn-mini remove-share-btn" title="Revoke Access">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
    listEl.innerHTML = `<p style="color:var(--accent-danger); font-size:0.8rem">${err.message}</p>`;
  }
}

shareForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('shareEmail').value.trim().toLowerCase();
  const role = document.getElementById('shareRole').value;

  if (email === currentUser.email.toLowerCase()) {
    alert("You cannot share a folder with yourself.");
    return;
  }

  try {
    const { error } = await supabase
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

    showToast(`Shared folder with ${email}`);
    document.getElementById('shareEmail').value = '';
    await refreshMemberList();
  } catch (err) {
    alert(err.message || 'Error sharing folder');
  }
});

// -----------------------------------------------------------------------------
// Generic Close Modals Setup
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
