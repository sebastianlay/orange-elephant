// Orange Elephant - Popup Script

(function() {
  'use strict';

  // Cross-browser storage API (for change listener)
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

  const { escapeHtml, sanitizeAnnotations } = OrangeElephantUtil;

  // Whether this page runs as a regular tab instead of the browser action popup
  const runningInTab = new URLSearchParams(window.location.search).has('tab');

  // DOM elements
  const countEl = document.getElementById('annotationCount');
  const listEl = document.getElementById('annotationsList');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const storageBar = document.getElementById('storageBar');
  const storageText = document.getElementById('storageText');
  const statusEl = document.getElementById('statusMessage');

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

  // Show a transient status message (alert() is not displayed in Firefox popups)
  let statusTimer = null;
  function showStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', !!isError);
    statusEl.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.hidden = true;
    }, 5000);
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
        const previous = annotations[username];
        delete annotations[username];
        try {
          await saveAnnotations();
        } catch (err) {
          // Roll back so the list does not pretend the deletion happened
          annotations[username] = previous;
          showStatus(`Failed to delete: ${err.message}`, true);
          return;
        }
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
    importBtn.addEventListener('click', async () => {
      // Firefox closes the popup as soon as the file picker opens, destroying
      // this page before the file can be read (see Bugzilla #1292701), so the
      // import has to run from a regular tab instead
      if (typeof browser !== 'undefined' && !runningInTab) {
        await browser.tabs.create({ url: `${window.location.href}?tab` });
        window.close();
        return;
      }
      importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const result = sanitizeAnnotations(data?.annotations);
        if (result) {
          // Merge with existing annotations
          annotations = { ...annotations, ...result.annotations };
          await saveAnnotations();
          render(searchInput.value);
          let message = `Imported ${Object.keys(result.annotations).length} annotations successfully!`;
          if (result.skippedCount > 0) {
            message += ` Skipped ${result.skippedCount} invalid entries.`;
          }
          showStatus(message);
        } else {
          showStatus('Invalid file format. Expected JSON with "annotations" object.', true);
        }
      } catch (err) {
        showStatus(`Failed to import: ${err.message}`, true);
      }

      // Reset file input
      importFile.value = '';
    });
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
