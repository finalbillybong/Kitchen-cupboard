const STATIC_CACHE = 'kc-static-v1';
const API_CACHE = 'kc-api-v1';

// Install - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/favicon.svg',
        '/icon-192.png',
        '/icon-512.png',
      ]);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - route-based caching strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket upgrade requests
  if (event.request.headers.get('upgrade') === 'websocket') return;

  // Static assets (/assets/*) - cache first (immutable due to Vite hashing)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API GETs - network first with cache fallback
  if (url.pathname.startsWith('/api/') && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ detail: 'You are offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
    );
    return;
  }

  // API mutations (POST/PUT/DELETE) - network only with offline queue
  if (url.pathname.startsWith('/api/') && event.request.method !== 'GET') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          // Store in offline queue for replay later
          const body = await event.request.clone().text();
          await saveToOfflineQueue({
            url: event.request.url,
            method: event.request.method,
            headers: Object.fromEntries(event.request.headers.entries()),
            body: body || undefined,
            timestamp: Date.now(),
          });
          return new Response(
            JSON.stringify({ queued: true, detail: 'Saved offline - will sync when back online' }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  // Navigation requests - network first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put('/', clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/').then((cached) => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Everything else - network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ─── Offline Queue (IndexedDB) ─────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kc-offline', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToOfflineQueue(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replayOfflineQueue() {
  const db = await openDB();

  const items = await new Promise((resolve) => {
    const tx = db.transaction('queue', 'readonly');
    const store = tx.objectStore('queue');
    const allReq = store.getAll();
    const keysReq = store.getAllKeys();
    tx.oncomplete = () => resolve({ items: allReq.result, keys: keysReq.result });
  });

  for (let i = 0; i < items.items.length; i++) {
    const entry = items.items[i];
    const key = items.keys[i];
    try {
      await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body || undefined,
      });
      // Successfully replayed - remove from queue
      const deleteTx = db.transaction('queue', 'readwrite');
      deleteTx.objectStore('queue').delete(key);
      await new Promise((resolve) => { deleteTx.oncomplete = resolve; });
    } catch {
      // Still offline - stop trying
      break;
    }
  }

  // Notify all clients to refresh data
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'queue-replayed' }));
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'replay-queue') {
    replayOfflineQueue();
  }
});
