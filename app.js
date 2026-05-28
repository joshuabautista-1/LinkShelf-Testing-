/* ══════════════════════════════════════════════════════════
   LinkShelf v3 — app.js
   No login/logout. All features unlocked.
   Features: subcategories, click tracking, bulk select,
   broken link detection, duplicate detection,
   content search, background themes, smooth transitions.
   ══════════════════════════════════════════════════════════ */

/* ── Constants ─────────────────────────────────────────── */
const DEFAULT_BG  = '#f5f4f0';
const BG_PRESETS  = [
  '#f5f4f0','#ffffff','#fdf6e3','#f0f4ff','#f0fff4',
  '#fff0f6','#1a1916','#1e293b','#2d1b69','#0f2027',
];

/* ── App state ─────────────────────────────────────────── */
let categories        = [];
let links             = [];
let activeCategory    = 'All';
let expandedCategories = new Set(); // Tracks layout open/close combos for parents
let editingId         = null;
let editingCatId      = null;
let sortMode          = 'saved';
let selectedIds       = new Set();
let selectModeOn      = false;
let healthScanResults = { broken: [], dupes: [] };

/* ── Utils ─────────────────────────────────────────────── */
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getHostname(url) {
  try { return new URL(url).hostname; } catch(e) { return ''; }
}
function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  el.focus();
  let errEl = el.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error';
    el.parentElement.appendChild(errEl);
  }
  errEl.textContent = msg;
  el.classList.add('field-invalid');
  el.addEventListener('input', () => {
    errEl.remove();
    el.classList.remove('field-invalid');
  }, { once: true });
}

/* ── Boot ──────────────────────────────────────────────── */
async function bootApp() {
  document.getElementById('appRoot').style.display = '';
  await reloadData();
  initColorPicker();
  document.getElementById('dbBadge').textContent = '✦ IndexedDB';
  document.getElementById('dbBadge').classList.add('ready');
  renderSidebar();
  renderLinks();
  updateStats();
}

async function reloadData() {
  [categories, links] = await Promise.all([
    dbGetCategories(),
    dbGetLinks(),
  ]);
  sortLinks();
}

function sortLinks() {
  links.sort((a, b) => {
    if (sortMode === 'clicks')    return (b.clicks||0) - (a.clicks||0);
    if (sortMode === 'lastVisit') return (b.lastVisit||0) - (a.lastVisit||0);
    if (sortMode === 'alpha')     return a.name.localeCompare(b.name);
    return (b.pinned?1:0) - (a.pinned?1:0) || b.saved - a.saved;
  });
}

/* ── Sidebar ────────────────────────────────────────────── */
function renderSidebar() {
  const list = document.getElementById('catList');

  const topLevel   = categories.filter(c => !c.parent);
  const childrenOf = (id) => categories.filter(c => c.parent === id);

  /* Helper: get all cat ids that belong to a link */
  function linkCats(l) {
    return l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
  }

  let html = `<li class="cat-item ${activeCategory==='All'?'active':''}" onclick="setCategory('All')">
    <span class="cat-name-wrap"><span class="cat-name-display">All links</span></span>
    <span class="cat-count">${links.length}</span>
  </li>`;

  html += `<li class="cat-item pinned-row ${activeCategory==='pinned'?'active':''}" onclick="setCategory('pinned')">
    <span class="cat-name-wrap"><span class="cat-name-display">⭐ Pinned</span></span>
    <span class="cat-count">${links.filter(l=>l.pinned).length}</span>
  </li>`;

  for (const cat of topLevel) {
    const children = childrenOf(cat.id);
    const count = links.filter(l => {
      const lc = linkCats(l);
      return lc.includes(cat.id) || children.some(c => lc.includes(c.id));
    }).length;
    const hasChildren = children.length > 0;
    const isExpanded = expandedCategories.has(cat.id);

    html += `<div class="cat-item-container ${hasChildren && isExpanded ? 'expanded' : ''}" id="container-${escHtml(cat.id)}">
      <li class="cat-item ${activeCategory===cat.id?'active':''}"
        onclick="setCategory('${escHtml(cat.id)}')" data-cat-id="${escHtml(cat.id)}">
        <span class="cat-name-wrap">
          ${hasChildren ? `<span class="cat-toggle" onclick="event.stopPropagation();toggleCatExpand('${escHtml(cat.id)}')">▶</span>` : ''}
          <span class="cat-name-display">${escHtml(cat.name)}</span>
        </span>
        <span class="cat-count">${count}</span>
        <button class="cat-btn" onclick="event.stopPropagation();openAddSubcat('${escHtml(cat.id)}')" title="Add subfolder">+</button>
        <button class="cat-btn" onclick="event.stopPropagation();openEditCat('${escHtml(cat.id)}')" title="Rename">✎</button>
        <button class="cat-btn del" onclick="event.stopPropagation();confirmDeleteCategory('${escHtml(cat.id)}')" title="Delete">✕</button>
      </li>`;

    if (hasChildren) {
      html += `<div class="sub-list-wrapper">
        <ul class="sub-list" id="sub-${escHtml(cat.id)}">`;
      for (const sub of children) {
        const subCount = links.filter(l => linkCats(l).includes(sub.id)).length;
        html += `<li class="sub-item ${activeCategory===sub.id?'active':''}" onclick="setCategory('${escHtml(sub.id)}')">
          <span class="cat-name-wrap"><span class="cat-name-display">↳ ${escHtml(sub.name)}</span></span>
          <span class="cat-count">${subCount}</span>
          <button class="cat-btn" onclick="event.stopPropagation();openEditCat('${escHtml(sub.id)}')" title="Rename">✎</button>
          <button class="cat-btn del" onclick="event.stopPropagation();confirmDeleteCategory('${escHtml(sub.id)}')" title="Delete">✕</button>
        </li>`;
      }
      html += '</ul></div>';
    }
    html += '</div>'; // close cat-item-container
  }

  list.innerHTML = html;

  // Mobile pills
  const bar = document.getElementById('mobileCatBar');
  const allCats = ['All', ...topLevel.map(c=>c.name)];
  bar.innerHTML = allCats.map((name, i) => {
    const id = i === 0 ? 'All' : topLevel[i-1].id;
    return `<button class="mobile-cat-pill ${id===activeCategory?'active':''}" onclick="setCategory('${escHtml(id)}')">${escHtml(name)}</button>`;
  }).join('');
}

function toggleCatExpand(catId) {
  const container = document.getElementById(`container-${catId}`);
  if (!container) return;
  
  if (expandedCategories.has(catId)) {
    expandedCategories.delete(catId);
    container.classList.remove('expanded');
  } else {
    expandedCategories.add(catId);
    container.classList.add('expanded');
  }
}

/* ── Category switching ─────────────────────────────────── */
function setCategory(id) {
  if (id === activeCategory) return;
  const content = document.getElementById('mainContent');
  content.classList.add('cat-leave');

  setTimeout(() => {
    activeCategory = id;

    let label = 'All';
    if (id === 'All') label = 'All';
    else if (id === 'pinned') label = '⭐ Pinned';
    else {
      const cat = categories.find(c => c.id === id);
      label = cat ? cat.name : id;
      
      // Auto-expand parent combo container if a subfolder is selected
      if (cat && cat.parent && !expandedCategories.has(cat.parent)) {
        expandedCategories.add(cat.parent);
      }
    }
    document.getElementById('viewLabel').textContent = label;

    renderSidebar();
    _renderLinksInner();
    content.classList.remove('cat-leave');
    content.classList.add('cat-enter');
    content.offsetHeight; // layout trigger
    content.classList.remove('cat-enter');
  }, 160);
}

/* ── Render links ───────────────────────────────────────── */
function renderLinks() { _renderLinksInner(); }

/* Helper — normalise link's categories to an array */
function getLinkCats(l) {
  return l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
}

function getActiveLinks() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  let view;

  if (activeCategory === 'All') {
    view = [...links];
  } else if (activeCategory === 'pinned') {
    view = links.filter(l => l.pinned);
  } else {
    const children = categories.filter(c => c.parent === activeCategory).map(c => c.id);
    const allIds   = [activeCategory, ...children];
    view = links.filter(l => getLinkCats(l).some(c => allIds.includes(c)));
  }

  if (q) {
    view = view.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q)  ||
      (l.notes && l.notes.toLowerCase().includes(q))
    );
  }
  return view;
}

function _renderLinksInner() {
  const view = getActiveLinks();
  document.getElementById('viewCount').textContent = `— ${view.length}`;

  const pinned   = view.filter(l => l.pinned && activeCategory !== 'pinned');
  const unpinned = view.filter(l => !l.pinned || activeCategory === 'pinned');
  const content  = document.getElementById('mainContent');

  if (!view.length) {
    const q = document.getElementById('searchInput').value;
    content.innerHTML = `<div class="links-grid"><div class="empty">
      <div class="empty-icon">◯</div>
      <div class="empty-text">${q ? `No results for "${escHtml(q)}"` : 'No links here yet.<br>Click <strong>+ Add link</strong> to get started.'}</div>
    </div></div>`;
    return;
  }

  const isParentView = activeCategory !== 'All' && activeCategory !== 'pinned' &&
    categories.some(c => c.parent === activeCategory);

  let html = '';
  if (pinned.length) {
    html += `<div class="pinned-section">
      <div class="section-label">⭐ Pinned</div>
      <div class="links-grid">${pinned.map(cardHTML).join('')}</div>
    </div>`;
  }

  if (isParentView && !document.getElementById('searchInput').value) {
    const children    = categories.filter(c => c.parent === activeCategory);
    const directLinks = unpinned.filter(l => getLinkCats(l).includes(activeCategory));

    for (const sub of children) {
      const subLinks = unpinned.filter(l => getLinkCats(l).includes(sub.id));
      if (!subLinks.length) continue;
      html += `<div class="subcat-group">
        <div class="section-label subcat-label">
          <button class="subcat-pill" onclick="setCategory('${escHtml(sub.id)}')">${escHtml(sub.name)}</button>
        </div>
        <div class="links-grid">${subLinks.map(cardHTML).join('')}</div>
      </div>`;
    }
    if (directLinks.length) {
      if (children.length) html += `<div class="section-label" style="margin-bottom:12px">Other</div>`;
      html += `<div class="links-grid">${directLinks.map(cardHTML).join('')}</div>`;
    }
  } else {
    if (unpinned.length) {
      if (pinned.length) html += `<div class="section-label" style="margin-bottom:12px">Links</div>`;
      html += `<div class="links-grid">${unpinned.map(cardHTML).join('')}</div>`;
    }
  }
  content.innerHTML = html;
}

function getCatLabel(catId) {
  if (!catId) return '';
  const cat = categories.find(c => c.id === catId);
  if (!cat) return '';
  if (cat.parent) {
    const parent = categories.find(c => c.id === cat.parent);
    return parent ? `${parent.name} / ${cat.name}` : cat.name;
  }
  return cat.name;
}
function getCatLabels(link) {
  return getLinkCats(link).map(id => getCatLabel(id)).filter(Boolean);
}

function cardHTML(l) {
  const domain     = getHostname(l.url);
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}` : '';
  const dateStr    = new Date(l.saved).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  const pinnedCls  = l.pinned ? 'pinned' : '';
  const selCls     = selectedIds.has(l.id) ? 'selected' : '';
  const checkedCls = selectedIds.has(l.id) ? 'checked' : '';
  const catLabels  = getCatLabels(l);
  const isBroken   = healthScanResults.broken.includes(l.id);
  const isDupe     = healthScanResults.dupes.includes(l.id);
  const brokenCls  = isBroken ? 'broken' : '';
  const dupeCls    = isDupe ? 'duplicate' : '';
  const clicks     = l.clicks || 0;
  const clickCls   = clicks >= 10 ? 'popular' : '';

  return `<div class="link-card ${pinnedCls} ${selCls} ${brokenCls} ${dupeCls}"
    onclick="handleCardClick(event,'${escHtml(l.id)}','${escHtml(l.url)}')">
    <div class="card-checkbox ${checkedCls}" onclick="event.stopPropagation();toggleSelect('${l.id}')">${selectedIds.has(l.id)?'✓':''}</div>
    <div class="card-name-row">
      <span class="card-title">${escHtml(l.name)}</span>
      <div class="card-actions">
        <button class="btn-icon star ${l.pinned?'pinned-active':''}"
          onclick="event.stopPropagation();togglePin('${l.id}')"
          title="${l.pinned?'Unpin':'Pin'}">★</button>
        <button class="btn-icon" onclick="event.stopPropagation();openEdit('${l.id}')" title="Edit">✎</button>
        <button class="btn-icon del" onclick="event.stopPropagation();confirmDeleteLink('${l.id}')" title="Delete">✕</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-domain-row">
        <div class="favicon">${faviconUrl
          ? `<img src="${faviconUrl}" onerror="this.parentElement.textContent='🔗'">`
          : '🔗'}</div>
        <span class="card-url">${escHtml(domain || l.url)}</span>
      </div>
      ${catLabels.length ? `<div class="card-cats">${catLabels.map(cl => `<span class="card-cat">${escHtml(cl)}</span>`).join('')}</div>` : ''}
      ${isBroken ? `<span class="status-chip chip-broken">⚠ Broken link</span>` : ''}
      ${isDupe   ? `<span class="status-chip chip-duplicate">⊕ Duplicate</span>` : ''}
      <div class="card-meta">
        ${clicks > 0 ? `<span class="card-clicks ${clickCls}">↗ ${clicks} visit${clicks!==1?'s':''}</span>` : ''}
        <span class="card-date">${dateStr}</span>
      </div>
    </div>
  </div>`;
}

async function handleCardClick(e, id, url) {
  if (e.target.closest('.card-actions') || e.target.closest('.card-checkbox')) return;
  if (selectModeOn) { toggleSelect(id); return; }
  const updated = await dbIncrementClick(id);
  if (updated) {
    const link = links.find(l => l.id === id);
    if (link) { link.clicks = updated.clicks; link.lastVisit = updated.lastVisit; }
  }
  window.open(url, '_blank', 'noopener');
}

/* ── Pin ────────────────────────────────────────────────── */
async function togglePin(id) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  link.pinned = !link.pinned;
  await dbPutLink(link);
  sortLinks();
  renderLinks();
  toast(link.pinned ? '⭐ Pinned' : 'Unpinned');
}

/* ── Sort ───────────────────────────────────────────────── */
function setSort(mode) {
  sortMode = mode;
  sortLinks();
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === mode)
  );
  renderLinks();
}

/* ── Bulk selection ─────────────────────────────────────── */
function toggleSelectMode() {
  selectModeOn = !selectModeOn;
  if (!selectModeOn) { selectedIds.clear(); }
  document.body.classList.toggle('select-mode', selectModeOn);
  updateBulkBar();
  renderLinks();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
  renderLinks();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const n = selectedIds.size;
  if (n > 0 && selectModeOn) {
    bar.classList.add('visible');
    document.getElementById('bulkCount').textContent = `${n} link${n!==1?'s':''} selected`;
  } else {
    bar.classList.remove('visible');
  }
}

function selectAll() {
  const view = getActiveLinks();
  view.forEach(l => selectedIds.add(l.id));
  updateBulkBar();
  renderLinks();
}

function deselectAll() {
  selectedIds.clear();
  updateBulkBar();
  renderLinks();
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  showConfirm(
    `Delete ${selectedIds.size} link${selectedIds.size!==1?'s':''}?`,
    'This cannot be undone.',
    async () => {
      for (const id of selectedIds) await dbDeleteLink(id);
      links = links.filter(l => !selectedIds.has(l.id));
      selectedIds.clear();
      toggleSelectMode();
      renderSidebar();
      renderLinks();
      updateStats();
      toast(`Deleted links`);
    }
  );
}

function bulkMove() {
  if (!selectedIds.size) return;
  openMoveModal();
}

async function bulkExport() {
  if (!selectedIds.size) return;
  const toExport = links.filter(l => selectedIds.has(l.id));
  const data = {
    exported: new Date().toISOString(),
    categories: categories.map(c => ({ id: c.id, name: c.name, parent: c.parent })),
    links: toExport,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `linkshelf-export-${Date.now()}.json`;
  a.click();
  toast(`Exported ${toExport.length} links`);
}

/* ── Move modal ─────────────────────────────────────────── */
function openMoveModal() {
  const list = document.getElementById('moveCatList');
  list.innerHTML = categories.map(c => {
    const label = c.parent ? getCatLabel(c.id) : c.name;
    return `<li class="move-cat-item" onclick="executeBulkMove('${escHtml(c.id)}')">${escHtml(label)}</li>`;
  }).join('');
  document.getElementById('moveOverlay').classList.add('open');
}

function closeMoveModal() {
  document.getElementById('moveOverlay').classList.remove('open');
}

async function executeBulkMove(catId) {
  for (const id of selectedIds) {
    const link = links.find(l => l.id === id);
    if (link) {
      link.cats = [catId];
      link.cat  = catId;
      await dbPutLink(link);
    }
  }
  selectedIds.clear();
  toggleSelectMode();
  closeMoveModal();
  await reloadData();
  renderSidebar();
  renderLinks();
  updateStats();
  toast(`Moved links`);
}

/* ── Form Modal operations ──────────────────────────────── */
function openModal(editId = null) {
  editingId = editId;
  const overlay = document.getElementById('overlay');
  const title   = document.getElementById('modalTitle');
  const fName   = document.getElementById('fName');
  const fUrl    = document.getElementById('fUrl');
  const fNotes  = document.getElementById('fNotes');

  // Clear previous inline form state
  inlineCatPanelOpen = false;
  const panel = document.getElementById('inlineCatPanel');
  if (panel) panel.classList.remove('open');
  const toggle = document.getElementById('inlineCatToggle');
  if (toggle) { toggle.style.display = ''; toggle.classList.remove('active'); }

  let preChecked = [];

  if (editId) {
    title.textContent = 'Edit link';
    const link = links.find(l => l.id === editId);
    if (link) {
      fName.value  = link.name || '';
      fUrl.value   = link.url || '';
      fNotes.value = link.notes || '';
      preChecked   = getLinkCats(link);
    }
  } else {
    title.textContent = 'Add link';
    fName.value  = '';
    fUrl.value   = '';
    fNotes.value = '';
    if (activeCategory !== 'All' && activeCategory !== 'pinned') {
      preChecked = [activeCategory];
    }
  }

  populateCatSelect(preChecked);
  refreshCatSelectedTags();
  overlay.classList.add('open');
  setTimeout(() => fUrl.focus(), 50);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
}

function populateCatSelect(checkedIds = []) {
  const container = document.getElementById('fCat');
  if (!container) return;

  const topLevel   = categories.filter(c => !c.parent);
  const childrenOf = (id) => categories.filter(c => c.parent === id);

  let html = '';
  topLevel.forEach(cat => {
    const isChecked = checkedIds.includes(cat.id) ? 'checked' : '';
    html += `<label class="ms-row">
      <input type="checkbox" value="${escHtml(cat.id)}" ${isChecked} onchange="refreshCatSelectedTags()">
      <span>${escHtml(cat.name)}</span>
    </label>`;

    const children = childrenOf(cat.id);
    children.forEach(sub => {
      const isSubChecked = checkedIds.includes(sub.id) ? 'checked' : '';
      html += `<label class="ms-row sub">
        <input type="checkbox" value="${escHtml(sub.id)}" ${isSubChecked} onchange="refreshCatSelectedTags()">
        <span>${escHtml(sub.name)}</span>
      </label>`;
    });
  });

  container.innerHTML = html;
}

function getSelectedCats() {
  const container = document.getElementById('fCat');
  if (!container) return [];
  const boxes = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(boxes).map(b => b.value);
}

function refreshCatSelectedTags() {
  const strip = document.getElementById('catSelectedTags');
  if (!strip) return;

  const selected = getSelectedCats();
  if (!selected.length) {
    strip.innerHTML = '<span style="font-size:12px;color:var(--muted);font-style:italic;padding:2px 0">None selected</span>';
    return;
  }

  strip.innerHTML = selected.map(id => {
    const label = getCatLabel(id);
    return `<span class="sel-tag">
      ${escHtml(label)}
      <button type="button" class="sel-tag-remove" onclick="uncheckCatRow('${escHtml(id)}')">✕</button>
    </span>`;
  }).join('');
}

function uncheckCatRow(id) {
  const container = document.getElementById('fCat');
  if (!container) return;
  const box = container.querySelector(`input[type="checkbox"][value="${id}"]`);
  if (box) {
    box.checked = false;
    refreshCatSelectedTags();
  }
}

async function saveLink() {
  const fName  = document.getElementById('fName');
  const fUrl   = document.getElementById('fUrl');
  const fNotes = document.getElementById('fNotes');

  let name = fName.value.trim();
  let url  = fUrl.value.trim();
  let notes= fNotes.value.trim();

  if (!url) { showFieldError('fUrl', 'URL is required'); return; }
  if (!url.match(/^https?:\/\//i)) { url = 'https://' + url; }

  // Clean trailing slash for matching cleanly
  try { new URL(url); } catch(e) { showFieldError('fUrl', 'Invalid URL format'); return; }

  if (!name) {
    name = getHostname(url) || 'Untitled link';
  }

  const selectedCats = getSelectedCats();
  // Legacy single cat alignment
  const primaryCat = selectedCats.length ? selectedCats[0] : '';

  if (editingId) {
    const existing = links.find(l => l.id === editingId);
    if (existing) {
      existing.name  = name;
      existing.url   = url;
      existing.notes = notes;
      existing.cat   = primaryCat;
      existing.cats  = selectedCats;
      await dbPutLink(existing);
      toast('Link updated');
    }
  } else {
    const newLink = {
      id: uid(),
      name,
      url,
      notes,
      cat: primaryCat,
      cats: selectedCats,
      saved: Date.now(),
      clicks: 0,
      pinned: false,
      lastVisit: 0
    };
    await dbPutLink(newLink);
    links.push(newLink);
    toast('Link saved');
  }

  closeModal();
  sortLinks();
  renderSidebar();
  renderLinks();
  updateStats();
}

function openEdit(id) { openModal(id); }

function confirmDeleteLink(id) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  showConfirm(
    `Delete "${link.name}"?`,
    'This item will be permanently removed.',
    async () => {
      await dbDeleteLink(id);
      links = links.filter(l => l.id !== id);
      renderSidebar();
      renderLinks();
      updateStats();
      toast('Link deleted');
    }
  );
}

/* ── Category modifications ─────────────────────────────── */
function openEditCat(id) {
  editingCatId = id;
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  const inp = document.getElementById('editCatInput');
  inp.value = cat.name;
  document.getElementById('editCatOverlay').classList.add('open');
  setTimeout(() => inp.focus(), 50);
}
function closeEditCat() {
  document.getElementById('editCatOverlay').classList.remove('open');
  editingCatId = null;
}
async function saveEditCat() {
  const inp = document.getElementById('editCatInput');
  const name = inp.value.trim();
  if (!name) return;

  const cat = categories.find(c => c.id === editingCatId);
  if (cat) {
    cat.name = name;
    await dbPutCategory(cat);
    categories.sort((a,b) => a.name.localeCompare(b.name));
    renderSidebar();
    if (activeCategory === editingCatId) {
      document.getElementById('viewLabel').textContent = name;
    }
    _renderLinksInner();
    toast('Category renamed');
  }
  closeEditCat();
}

function openAddSubcat(parentId) {
  editingCatId = parentId; // use as placeholder for parent
  const p = categories.find(c => c.id === parentId);
  document.getElementById('subcatParentName').textContent = p ? p.name : '';
  const inp = document.getElementById('newSubcatInput');
  inp.value = '';
  document.getElementById('addSubcatOverlay').classList.add('open');
  setTimeout(() => inp.focus(), 50);
}
function closeAddSubcat() {
  document.getElementById('addSubcatOverlay').classList.remove('open');
  editingCatId = null;
}
async function saveAddSubcat() {
  const inp = document.getElementById('newSubcatInput');
  const name = inp.value.trim();
  if (!name) return;

  const id = uid();
  const sub = { id, name, parent: editingCatId };
  await dbPutCategory(sub);
  categories.push(sub);
  categories.sort((a,b) => a.name.localeCompare(b.name));
  
  // Make sure the parent is automatically open to show the child creation
  expandedCategories.add(editingCatId);

  renderSidebar();
  updateStats();
  toast(`Subfolder "${name}" created`);
  closeAddSubcat();
}

function confirmDeleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  const isParent = !cat.parent;
  const msg = isParent ? `Delete category "${cat.name}" and its subfolders?` : `Delete subfolder "${cat.name}"?`;
  
  showConfirm(msg, 'Links inside will NOT be deleted; they will become unassigned.', async () => {
    const toDeleteIds = [id];
    if (isParent) {
      categories.filter(c => c.parent === id).forEach(c => toDeleteIds.push(c.id));
    }

    for (const dId of toDeleteIds) {
      await dbDeleteCategory(dId);
      expandedCategories.delete(dId);
    }
    categories = categories.filter(c => !toDeleteIds.includes(c.id));

    // Clear reference arrays inside links
    for (const l of links) {
      if (l.cats) {
        l.cats = l.cats.filter(cid => !toDeleteIds.includes(cid));
        if (toDeleteIds.includes(l.cat)) l.cat = l.cats[0] || '';
      } else if (toDeleteIds.includes(l.cat)) {
        l.cat = '';
      }
      await dbPutLink(l);
    }

    if (toDeleteIds.includes(activeCategory)) {
      activeCategory = 'All';
      document.getElementById('viewLabel').textContent = 'All';
    }

    renderSidebar();
    _renderLinksInner();
    updateStats();
    toast('Category removed');
  });
}

async function addCategory() {
  const inp = document.getElementById('newCatInput');
  const name = inp.value.trim();
  if (!name) return;

  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase() && !c.parent)) {
    inp.select(); toast('Category already exists'); return;
  }

  const id = uid();
  const cat = { id, name, parent: null };
  await dbPutCategory(cat);
  categories.push(cat);
  categories.sort((a,b) => a.name.localeCompare(b.name));
  inp.value = '';
  renderSidebar();
  updateStats();
  toast('Category added');
}

/* ── Global Confirmations ───────────────────────────────── */
let activeConfirmCb = null;
function showConfirm(msg, sub, cb) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmSub').textContent = sub;
  activeConfirmCb = cb;
  const overlay = document.getElementById('confirmOverlay');
  overlay.classList.add('open');
  document.getElementById('confirmBtn').onclick = () => {
    if (activeConfirmCb) activeConfirmCb();
    closeConfirm();
  };
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  activeConfirmCb = null;
}

/* ── Stats ──────────────────────────────────────────────── */
function updateStats() {
  document.getElementById('statLinks').textContent = links.length;
  document.getElementById('statCats').textContent  = categories.length;
  const clicks = links.reduce((sum, l) => sum + (l.clicks||0), 0);
  document.getElementById('statClicks').textContent = clicks;
}

/* ── Color Picker Engine ────────────────────────────────── */
function initColorPicker() {
  const current = localStorage.getItem('lv_bg_v3') || DEFAULT_BG;
  document.documentElement.style.setProperty('--bg', current);
  applyThemeContrast(current);

  const swatches = document.getElementById('presetSwatches');
  if (swatches) {
    swatches.innerHTML = BG_PRESETS.map(color =>
      `<button class="swatch" style="background: ${color}" onclick="applyBg('${color}')" aria-label="Theme ${color}"></button>`
    ).join('');
  }
  const inlineInp = document.getElementById('customColorInput');
  if (inlineInp) inlineInp.value = current;
}
function toggleColorPopover(e) {
  e.stopPropagation();
  document.getElementById('colorPopover').classList.toggle('open');
}
function closeColorPopover() {
  document.getElementById('colorPopover').classList.remove('open');
}
function applyBg(color) {
  document.documentElement.style.setProperty('--bg', color);
  localStorage.setItem('lv_bg_v3', color);
  applyThemeContrast(color);
}
function resetBg() {
  applyBg(DEFAULT_BG);
  const inlineInp = document.getElementById('customColorInput');
  if (inlineInp) inlineInp.value = DEFAULT_BG;
}
function applyThemeContrast(hex) {
  // Simple brightness conversion logic
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  if (luma < 100) { // Dark mode triggered
    document.documentElement.style.setProperty('--surface', '#22252a');
    document.documentElement.style.setProperty('--text', '#f1f1ee');
    document.documentElement.style.setProperty('--muted', '#9ca3af');
    document.documentElement.style.setProperty('--border', '#374151');
    document.documentElement.style.setProperty('--tag-bg', '#2d3139');
    document.documentElement.style.setProperty('--text-inv', '#111418');
  } else { // Light mode values restored
    document.documentElement.style.setProperty('--surface', '#ffffff');
    document.documentElement.style.setProperty('--text', '#1a1916');
    document.documentElement.style.setProperty('--muted', '#8c8a84');
    document.documentElement.style.setProperty('--border', '#e2e0d8');
    document.documentElement.style.setProperty('--tag-bg', '#eeede8');
    document.documentElement.style.setProperty('--text-inv', '#ffffff');
  }
}

/* ── Settings Controls ──────────────────────────────────── */
function openSettings()  { document.getElementById('settingsOverlay').classList.add('open'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('open'); }

function confirmClearAll() {
  closeSettings();
  showConfirm(
    'Clear entire vault?',
    'This completely flushes all custom categories and bookmarks permanently.',
    async () => {
      await Promise.all([dbDeleteAllLinks(), dbDeleteAllCategories()]);
      localStorage.removeItem('lv_bg_v3');
      location.reload();
    }
  );
}

/* ── Data Export/Import ─────────────────────────────────── */
function exportData() {
  const data = {
    exported: new Date().toISOString(),
    categories,
    links
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `linkshelf-full-vault.json`;
  a.click();
  toast('Vault data downloaded');
}

function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.links || !data.categories) throw new Error('Malformed files contents');

      if (confirm('Merge backup with existing entries? Click Cancel to clear current data first.')) {
        // Merge logic code block
        for (const c of data.categories) await dbPutCategory(c);
        for (const l of data.links) await dbPutLink(l);
      } else {
        await Promise.all([dbDeleteAllLinks(), dbDeleteAllCategories()]);
        for (const c of data.categories) await dbPutCategory(c);
        for (const l of data.links) await dbPutLink(l);
      }
      toast('Import successful!');
      setTimeout(() => location.reload(), 600);
    } catch(err) {
      alert('Error parsing JSON backup file.');
    }
  };
  r.readAsText(file);
}

/* ── Broken Link & Health Scanner ───────────────────────── */
function runHealthScan() {
  document.getElementById('healthOverlay').classList.add('open');
  const prog = document.getElementById('scanProgress');
  const res  = document.getElementById('scanResults');
  prog.style.display = 'block';
  res.innerHTML = '';

  const bar  = document.getElementById('scanProgressBar');
  const stat = document.getElementById('scanStatus');
  bar.style.width = '0%';
  stat.textContent = 'Scanning bookmarks database…';

  let done = 0;
  const total = links.length;
  healthScanResults = { broken: [], dupes: [] };

  if (total === 0) {
    prog.style.display = 'none';
    res.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Vault is empty. Add links to scan.</div>';
    return;
  }

  // Scan url occurrences maps
  const urlMap = {};
  links.forEach(l => {
    urlMap[l.url] = (urlMap[l.url] || 0) + 1;
    if (urlMap[l.url] > 1) healthScanResults.dupes.push(l.id);
  });

  // Simple offline validation structure checking syntax healthiness
  links.forEach((l, idx) => {
    setTimeout(() => {
      try {
        new URL(l.url);
      } catch(e) {
        healthScanResults.broken.push(l.id);
      }
      
      done++;
      const p = Math.round((done / total) * 100);
      bar.style.width = `${p}%`;
      stat.textContent = `Scanned ${done} / ${total} items…`;

      if (done === total) {
        prog.style.display = 'none';
        displayHealthResults();
      }
    }, idx * 6);
  });
}

function displayHealthResults() {
  const res = document.getElementById('scanResults');
  const bN  = healthScanResults.broken.length;
  const dN  = healthScanResults.dupes.length;

  let html = `<div style="font-size:13px;margin-bottom:12px;line-height:1.6">Scan completed. found <strong>${bN}</strong> broken addresses and <strong>${dN}</strong> duplicate links.</div>`;

  if (bN > 0 || dN > 0) {
    html += '<div class="scan-result-section">';
    
    healthScanResults.broken.forEach(id => {
      const l = links.find(item => item.id === id);
      if (l) html += `<div class="scan-item">
        <div class="scan-item-meta"><span class="scan-item-title">⚠ ${escHtml(l.name)}</span><span class="scan-item-sub">${escHtml(l.url)}</span></div>
        <button class="btn-danger-sm" onclick="deleteFromScan('${l.id}')">Delete</button>
      </div>`;
    });

    healthScanResults.dupes.forEach(id => {
      const l = links.find(item => item.id === id);
      if (l) html += `<div class="scan-item">
        <div class="scan-item-meta"><span class="scan-item-title">⊕ ${escHtml(l.name)}</span><span class="scan-item-sub">${escHtml(l.url)}</span></div>
        <button class="btn-ghost-sm" onclick="deleteFromScan('${l.id}')">Remove duplicate</button>
      </div>`;
    });

    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:30px 0;color:var(--ok);font-size:36px">🎉</div><div style="text-align:center;color:var(--ok);font-weight:bold;font-size:14px">Your vault is in perfect health!</div>';
  }
  res.innerHTML = html;
  renderLinks();
}

async function deleteFromScan(id) {
  await dbDeleteLink(id);
  links = links.filter(l => l.id !== id);
  healthScanResults.broken = healthScanResults.broken.filter(i => i !== id);
  healthScanResults.dupes  = healthScanResults.dupes.filter(i => i !== id);
  displayHealthResults();
  renderSidebar();
  updateStats();
}

function closeHealthScan() { document.getElementById('healthOverlay').classList.remove('open'); }

/* ── Custom Toast Messaging Engine ──────────────────────── */
let toastT = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ── Hotkey Listeners & Document Click Handlers ─────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); closeEditCat(); closeConfirm(); closeSettings();
    closeColorPopover(); closeMoveModal(); closeHealthScan(); closeAddSubcat();
    if (selectModeOn) { selectModeOn = false; selectedIds.clear(); document.body.classList.remove('select-mode'); updateBulkBar(); renderLinks(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openModal(); }
});

document.addEventListener('click', e => {
  const popover = document.getElementById('colorPopover');
  if (popover && popover.classList.contains('open') && !document.getElementById('colorWrap').contains(e.target)) {
    closeColorPopover();
  }
});

// Fire up deployment routine
window.addEventListener('DOMContentLoaded', openDB().then(bootApp));