// Orange Elephant - Content Script

(function() {
  'use strict';

  // Cross-browser storage API (for change listener)
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

  // State
  let annotations = {};
  let activePopup = null;
  let lastFocusedElement = null;

  // Initialize
  async function init() {
    await loadAnnotations();
    processUserLinks();
    observeDOM();
  }

  // Load annotations
  async function loadAnnotations() {
    try {
      annotations = await OrangeElephantStorage.load();
    } catch (e) {
      console.error('Orange Elephant: Failed to load annotations', e);
      annotations = {};
    }
  }

  // Save annotations
  async function saveAnnotations() {
    try {
      await OrangeElephantStorage.save(annotations);
    } catch (e) {
      console.error('Orange Elephant: Failed to save annotations', e);
    }
  }

  // Find and process all user links on the page
  function processUserLinks() {
    const userLinks = document.querySelectorAll('a[href^="user?id="]');
    userLinks.forEach(link => {
      if (link.dataset.oeProcessed) return;
      link.dataset.oeProcessed = 'true';

      const username = extractUsername(link.href);
      if (!username) return;

      // Add click handler for annotations
      link.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        showPopup(link, username);
      });

      // Keyboard support: Enter opens popup, allow Ctrl/Cmd+Enter for navigation
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          showPopup(link, username);
        }
      });

      // Add annotation badge if exists
      if (annotations[username]) {
        addAnnotationBadge(link, username);
      }
    });
  }

  // Extract username from URL
  function extractUsername(url) {
    const match = url.match(/user\?id=([^&]+)/);
    return match ? match[1] : null;
  }

  // Add annotation badge next to username
  function addAnnotationBadge(link, username) {
    const existingBadge = link.parentElement.querySelector('.oe-badge');
    if (existingBadge) existingBadge.remove();

    const badge = document.createElement('span');
    badge.className = 'oe-badge';
    badge.textContent = annotations[username];
    badge.dataset.username = username;

    // Accessibility: make badge focusable and announce its purpose
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', `Annotation for ${username}: ${annotations[username]}. Activate to edit.`);

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPopup(badge, username);
    });

    // Keyboard support for badges
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        showPopup(badge, username);
      }
    });

    link.insertAdjacentElement('afterend', badge);
  }

  // Remove annotation badge
  function removeAnnotationBadge(username) {
    document.querySelectorAll(`.oe-badge[data-username="${username}"]`).forEach(badge => {
      badge.remove();
    });
  }

  // Update all badges for a username
  function updateBadges(username) {
    if (annotations[username]) {
      document.querySelectorAll(`a[href="user?id=${username}"]`).forEach(link => {
        addAnnotationBadge(link, username);
      });
    } else {
      removeAnnotationBadge(username);
    }
  }

  // Show unified popup for viewing/adding/editing/deleting annotations
  function showPopup(anchor, username) {
    closePopup();

    // Store the element that triggered the popup for focus restoration
    lastFocusedElement = anchor;

    const hasAnnotation = !!annotations[username];
    const rect = anchor.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.className = 'oe-popup';

    // Accessibility: dialog role and ARIA attributes
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'oe-popup-title');
    popup.setAttribute('aria-describedby', 'oe-popup-description');

    const popupHtml = `
      <div class="oe-popup-header">
        <span class="oe-popup-title" id="oe-popup-title"><strong>${escapeHtml(username)}</strong></span>
        <button class="oe-popup-close" type="button" aria-label="Close dialog">&times;</button>
      </div>
      <p id="oe-popup-description" class="oe-sr-only">${hasAnnotation ? 'Edit or delete your annotation for this user.' : 'Add an annotation for this user.'}</p>
      <label for="oe-popup-input" class="oe-sr-only">Annotation for ${escapeHtml(username)}</label>
      <input type="text" id="oe-popup-input" class="oe-popup-input" placeholder="Enter annotation..." value="${escapeHtml(annotations[username] || '')}" maxlength="50">
      <div class="oe-popup-actions">
        <button class="oe-link oe-popup-visit" type="button">Visit Profile</button>
        <div class="oe-button-group">
          ${hasAnnotation ? '<button class="oe-btn oe-btn-danger oe-popup-delete" type="button">Delete</button>' : ''}
          <button class="oe-btn oe-btn-primary oe-popup-save" type="button">Save</button>
        </div>
      </div>
    `;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(popupHtml, `text/html`);

    popup.append(...parsed.body.children);
    document.body.appendChild(popup);
    activePopup = popup;

    // Position popup
    const popupRect = popup.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;

    // Adjust if going off-screen
    if (left + popupRect.width > window.innerWidth) {
      left = window.innerWidth - popupRect.width - 10;
    }
    if (left < 10) {
      left = 10;
    }
    if (top + popupRect.height > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - popupRect.height - 5;
    }

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    // Focus input
    const input = popup.querySelector('.oe-popup-input');
    input.focus();
    input.select();

    // Event handlers
    popup.querySelector('.oe-popup-close').addEventListener('click', closePopup);

    popup.querySelector('.oe-popup-visit').addEventListener('click', () => {
      window.location.href = `/user?id=${username}`;
    });

    popup.querySelector('.oe-popup-save').addEventListener('click', () => {
      saveAnnotation(username, input.value);
    });

    const deleteBtn = popup.querySelector('.oe-popup-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteAnnotation(username);
      });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveAnnotation(username, input.value);
      } else if (e.key === 'Escape') {
        closePopup();
      }
    });

    // Focus trap: keep Tab key cycling within the popup
    popup.addEventListener('keydown', handleFocusTrap);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 0);
  }

  // Handle focus trap within popup
  function handleFocusTrap(e) {
    if (e.key !== 'Tab' || !activePopup) return;

    const focusableElements = activePopup.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Save annotation
  async function saveAnnotation(username, text) {
    text = text.trim();
    if (text) {
      annotations[username] = text;
    } else {
      delete annotations[username];
    }
    await saveAnnotations();
    updateBadges(username);
    closePopup();
  }

  // Delete annotation
  async function deleteAnnotation(username) {
    delete annotations[username];
    await saveAnnotations();
    updateBadges(username);
    closePopup();
  }

  // Close popup
  function closePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
    document.removeEventListener('click', handleOutsideClick);

    // Restore focus to the element that triggered the popup
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  // Handle outside click
  function handleOutsideClick(e) {
    if (activePopup && !activePopup.contains(e.target)) {
      closePopup();
    }
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Observe DOM for dynamically loaded content
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
        }
      });
      if (hasNewNodes) {
        processUserLinks();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Listen for storage changes from other tabs/windows
  storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync' && (changes.oe_meta || changes.annotations)) {
      // Reload annotations when storage changes
      await loadAnnotations();
      document.querySelectorAll('.oe-badge').forEach(badge => badge.remove());
      document.querySelectorAll('a[href^="user?id="]').forEach(link => {
        link.dataset.oeProcessed = '';
      });
      processUserLinks();
    }
  });

  // Global keyboard handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePopup();
    }
  });

  // Start
  init();
})();
