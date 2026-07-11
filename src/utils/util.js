// Orange Elephant - Shared Validation and Escaping Helpers

(function() {
  'use strict';

  const MAX_ANNOTATION_LENGTH = 50;

  // Hacker News usernames are 2-15 characters of letters, digits, dashes and underscores
  const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,15}$/;

  function isValidUsername(username) {
    return typeof username === 'string' && USERNAME_PATTERN.test(username);
  }

  // Normalize an annotation: collapse whitespace and enforce the length limit
  function normalizeAnnotation(text) {
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_ANNOTATION_LENGTH).trimEnd();
  }

  // Validate a { username: annotation } object (e.g. from an imported file),
  // dropping invalid entries. Returns null when the input is not such an object.
  function sanitizeAnnotations(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const annotations = {};
    let skippedCount = 0;
    for (const [username, note] of Object.entries(input)) {
      const normalized = typeof note === 'string' ? normalizeAnnotation(note) : '';
      if (isValidUsername(username) && normalized) {
        annotations[username] = normalized;
      } else {
        skippedCount++;
      }
    }
    return { annotations: annotations, skippedCount: skippedCount };
  }

  // Escape text for interpolation into HTML, including attribute values
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Export for use in other scripts
  window.OrangeElephantUtil = {
    MAX_ANNOTATION_LENGTH: MAX_ANNOTATION_LENGTH,
    isValidUsername: isValidUsername,
    normalizeAnnotation: normalizeAnnotation,
    sanitizeAnnotations: sanitizeAnnotations,
    escapeHtml: escapeHtml
  };
})();
