// Orange Elephant - Popup Script

(function() {
  'use strict';

  // Cross-browser storage API (for change listener)
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

  // DOM elements
  const countEl = document.getElementById('annotationCount');
  const listEl = document.getElementById('annotationsList');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');

  let annotations = {};

  // Initialize
  async function init() {
    await loadAnnotations();
    render();
    updateStorageStats();
    setupEventListeners();
  }

  // Load annotations using compressed chunked storage
  async function loadAnnotations() {
    try {
      annotations = await OrangeElephantStorage.load();
    } catch (e) {
      console.error('Failed to load annotations:', e);
      annotations = {};
    }
  }

  // Save annotations using compressed chunked storage
  async function saveAnnotations() {
    try {
      await OrangeElephantStorage.save(annotations);
      updateStorageStats();
    } catch (e) {
      console.error('Failed to save annotations:', e);
      throw e;
    }
  }

  // Update storage statistics display
  async function updateStorageStats() {
    if (!storageBar || !storageText) return;

    try {
      const stats = await OrangeElephantStorage.getStats();
      if (stats) {
        storageBar.style.width = `${stats.percentUsed}%`;
        storageBar.className = 'storage-bar' + (stats.percentUsed > 80 ? ' warning' : '');
        const kbUsed = (stats.bytesUsed / 1024).toFixed(1);
        const kbTotal = (stats.bytesTotal / 1024).toFixed(0);
        storageText.textContent = `${kbUsed} KB / ${kbTotal} KB (${stats.percentUsed}%)`;
      }
    } catch (e) {
      console.error('Failed to get storage stats:', e);
    }
  }

  // Render the annotations list
  function render(filter = '') {
    const entries = Object.entries(annotations);
    const filtered = filter
      ? entries.filter(([user, note]) =>
          user.toLowerCase().includes(filter.toLowerCase()) ||
          note.toLowerCase().includes(filter.toLowerCase())
        )
      : entries;

    countEl.textContent = entries.length;

    if (filtered.length === 0) {
      if (entries.length === 0) {
        listEl.innerHTML = '<p class="empty-message">No annotations yet. Click on a username on Hacker News to add one!</p>';
      } else {
        listEl.innerHTML = '<p class="empty-message">No matching annotations found.</p>';
      }
      return;
    }

    // Sort alphabetically by username
    filtered.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));

    const annotationListHtml = filtered.map(([username, note]) => `
      <div class="annotation-item" data-username="${escapeHtml(username)}">
        <div class="annotation-info">
          <a href="https://news.ycombinator.com/user?id=${encodeURIComponent(username)}"
             target="_blank"
             class="annotation-username">${escapeHtml(username)}</a>
          <span class="annotation-note">${escapeHtml(note)}</span>
        </div>
        <button class="annotation-delete" title="Delete annotation">&times;</button>
      </div>
    `).join('');

    const parser = new DOMParser();
    const parsed = parser.parseFromString(annotationListHtml, `text/html`);

    listEl.innerHTML = '';
    listEl.append(...parsed.body.children);

    // Add delete handlers
    listEl.querySelectorAll('.annotation-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.annotation-item');
        const username = item.dataset.username;
        delete annotations[username];
        await saveAnnotations();
        render(searchInput.value);
      });
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
      render(e.target.value);
    });

    // Export
    exportBtn.addEventListener('click', () => {
      const data = JSON.stringify({ annotations }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${new Date().toISOString().split('T')[0]}-orange-elephant-annotations.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    importBtn.addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.annotations && typeof data.annotations === 'object') {
          // Validate annotations format
          const validAnnotations = {};
          for (const [key, value] of Object.entries(data.annotations)) {
            if (typeof key === 'string' && typeof value === 'string') {
              validAnnotations[key] = value;
            }
          }

          // Merge with existing annotations
          annotations = { ...annotations, ...validAnnotations };
          await saveAnnotations();
          render(searchInput.value);
          alert(`Imported ${Object.keys(validAnnotations).length} annotations successfully!`);
        } else {
          alert('Invalid file format. Expected JSON with "annotations" object.');
        }
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }

      // Reset file input
      importFile.value = '';
    });
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Listen for storage changes
  storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync' && OrangeElephantStorage.hasAnnotationChanges(changes)) {
      await loadAnnotations();
      render(searchInput.value);
      updateStorageStats();
    }
  });

  // Start
  init();
})();
