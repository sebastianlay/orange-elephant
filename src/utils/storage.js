// Orange Elephant - Compressed Chunked Storage Utility

(function() {
  'use strict';

  const MAX_CHUNKS = 500; // Reserve 12 keys for future use (512 - 500)
  const CHUNK_SIZE = 8000; // Slightly under 8KB limit to be safe
  const CHUNK_PREFIX = 'oe_chunk_';
  const META_KEY = 'oe_meta';

  // Cross-browser storage API
  const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;

  // Set when a load fails, so that saves are blocked until a load succeeds.
  // Saving after a failed load would overwrite the synced data with an
  // incomplete state (e.g. when chunks have not fully synced to this device yet).
  let lastLoadFailed = false;

  // Compress string using Compression Streams API
  async function compress(str) {
    const blob = new Blob([str]);
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(stream).blob();
    const buffer = await compressedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Decompress string using Compression Streams API
  async function decompress(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const decompressedBlob = await new Response(stream).blob();
    return await decompressedBlob.text();
  }

  // Save annotations
  async function saveAnnotations(annotations) {
    if (lastLoadFailed) {
      throw new Error('Saving is disabled because your annotations could not be loaded');
    }
    try {
      const json = JSON.stringify(annotations);
      const compressed = await compress(json);

      // Split into chunks
      const chunks = [];
      for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
        chunks.push(compressed.slice(i, i + CHUNK_SIZE));
      }

      if (chunks.length > MAX_CHUNKS) {
        throw new Error(`Data too large: requires ${chunks.length} chunks, max is ${MAX_CHUNKS}`);
      }

      // Get current meta to know how many old chunks to clean up
      const oldMeta = await storage.sync.get(META_KEY);
      const oldChunkCount = oldMeta[META_KEY]?.chunkCount || 0;

      // Prepare new data
      const newData = {
        [META_KEY]: {
          chunkCount: chunks.length
        }
      };

      // Add chunks
      chunks.forEach((chunk, index) => {
        newData[`${CHUNK_PREFIX}${index}`] = chunk;
      });

      // Save new data
      await storage.sync.set(newData);

      // Clean up old chunks that are no longer needed
      if (oldChunkCount > chunks.length) {
        const keysToRemove = [];
        for (let i = chunks.length; i < oldChunkCount; i++) {
          keysToRemove.push(`${CHUNK_PREFIX}${i}`);
        }
        if (keysToRemove.length > 0) {
          await storage.sync.remove(keysToRemove);
        }
      }

      return true;
    } catch (e) {
      console.error('Orange Elephant: Failed to save annotations', e);
      throw e;
    }
  }

  // Load annotations
  async function loadAnnotations() {
    try {
      const metaResult = await storage.sync.get(META_KEY);
      const meta = metaResult[META_KEY];

      if (!meta || !meta.chunkCount) {
        lastLoadFailed = false;
        return {};
      }

      // Load all chunks
      const chunkKeys = [];
      for (let i = 0; i < meta.chunkCount; i++) {
        chunkKeys.push(`${CHUNK_PREFIX}${i}`);
      }

      const chunksResult = await storage.sync.get(chunkKeys);

      // Reassemble compressed string
      let compressed = '';
      for (let i = 0; i < meta.chunkCount; i++) {
        const chunk = chunksResult[`${CHUNK_PREFIX}${i}`];
        if (chunk === undefined) {
          throw new Error(`Missing chunk ${i}`);
        }
        compressed += chunk;
      }

      // Decompress and parse
      const json = await decompress(compressed);
      const annotations = JSON.parse(json);
      lastLoadFailed = false;
      return annotations;
    } catch (e) {
      lastLoadFailed = true;
      console.error('Orange Elephant: Failed to load annotations', e);
      throw e;
    }
  }

  // Check whether a storage.onChanged payload touches annotation data
  function hasAnnotationChanges(changes) {
    return Object.keys(changes).some(
      (key) => key === META_KEY || key.startsWith(CHUNK_PREFIX)
    );
  }

  // Get storage statistics
  async function getStorageStats() {
    try {
      const meta = await storage.sync.get(META_KEY);

      // Get bytes in use (handle both callback and promise APIs)
      let bytesInUse = 0;
      try {
        if (typeof browser !== 'undefined') {
          bytesInUse = await storage.sync.getBytesInUse(null);
        } else {
          bytesInUse = await new Promise((resolve) => {
            storage.sync.getBytesInUse(null, resolve);
          });
        }
      } catch (e) {
        // Fallback: estimate from meta
        bytesInUse = (meta[META_KEY]?.chunkCount || 0) * CHUNK_SIZE;
      }

      return {
        bytesUsed: bytesInUse,
        bytesTotal: 102400, // 100KB
        chunksUsed: meta[META_KEY]?.chunkCount || 0,
        chunksTotal: MAX_CHUNKS,
        percentUsed: Math.round((bytesInUse / 102400) * 100)
      };
    } catch (e) {
      return null;
    }
  }

  // Export for use in other scripts
  window.OrangeElephantStorage = {
    save: saveAnnotations,
    load: loadAnnotations,
    getStats: getStorageStats,
    hasAnnotationChanges: hasAnnotationChanges
  };
})();
