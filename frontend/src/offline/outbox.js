const DB_NAME = 'kc-offline';
const DB_VERSION = 2;
const STORE = 'queue';
const RETRYABLE = new Set([408, 425, 429]);
const listeners = new Set();
const pendingEntities = new Set();

let auth = { getToken: () => null, refresh: async () => false };
let flushing = null;
let retryTimer = null;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE)
        ? request.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { autoIncrement: true });

      // kc-offline v1 was written by the service worker. Keep every entry, but
      // strip credentials and normalize it into the browser outbox shape.
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const old = cursor.value || {};
        let path = old.path;
        try { path ||= new URL(old.url, location.origin).pathname + new URL(old.url, location.origin).search; } catch { /* retained as failed */ }
        if (path?.startsWith('/api/')) path = path.slice(4);
        const headers = { ...(old.headers || {}) };
        delete headers.authorization;
        delete headers.Authorization;
        cursor.update({
          ...old,
          path,
          url: undefined,
          headers: Object.keys(headers).length ? headers : undefined,
          entityId: old.entityId || extractEntityId(path),
          entityIds: old.entityIds || (old.entityId || extractEntityId(path) ? [old.entityId || extractEntityId(path)] : []),
          summary: old.summary || `${old.method || 'UNKNOWN'} ${path || 'legacy operation'}`,
          timestamp: old.timestamp || Date.now(),
          attempts: old.attempts || 0,
          status: path && old.method ? 'pending' : 'failed',
          error: path && old.method ? undefined : 'Legacy operation could not be resolved',
        });
        cursor.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function extractEntityId(path = '') {
  const match = path.match(/\/items\/([0-9a-f-]{36})(?:$|\?)/i);
  return match?.[1] || null;
}

async function records() {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const [values, keys] = await Promise.all([
    requestResult(store.getAll()),
    requestResult(store.getAllKeys()),
  ]);
  await transactionDone(tx);
  return values.map((value, index) => ({ ...value, key: keys[index] }));
}

export const getOutboxOperations = records;

export async function projectPendingItems(listId, canonicalItems, categories = []) {
  let items = canonicalItems.map((item) => ({ ...item }));
  const prefix = `/lists/${listId}/items`;
  const ops = (await records()).filter((op) => op.path?.startsWith(prefix));

  for (const op of ops) {
    let body = {};
    try { body = op.body ? JSON.parse(op.body) : {}; } catch { continue; }
    const itemMatch = op.path.match(/\/items\/([^/?]+)$/);

    if (op.method === 'POST' && op.path === prefix) {
      if (!items.some((item) => item.id === body.id)) {
        const category = categories.find((entry) => entry.id === body.category_id);
        items.push({
          id: body.id,
          list_id: listId,
          name: body.name,
          quantity: body.quantity ?? 1,
          unit: body.unit || '',
          category_id: body.category_id || null,
          category_name: category?.name || null,
          category_color: category?.color || null,
          checked: false,
          notes: body.notes || '',
          sort_order: body.sort_order ?? items.length,
          created_at: new Date(op.timestamp).toISOString(),
          _pending: true,
        });
      }
    } else if (op.method === 'PUT' && itemMatch) {
      const category = categories.find((entry) => entry.id === body.category_id);
      items = items.map((item) => item.id === itemMatch[1] ? {
        ...item,
        ...body,
        ...(Object.hasOwn(body, 'category_id') ? {
          category_name: category?.name || null,
          category_color: category?.color || null,
        } : {}),
        _pending: true,
      } : item);
    } else if (op.method === 'DELETE' && itemMatch) {
      items = items.filter((item) => item.id !== itemMatch[1]);
    } else if (op.method === 'POST' && op.path === `${prefix}/clear-checked`) {
      const captured = new Set(body.item_ids || []);
      items = items.filter((item) => !captured.has(item.id));
    } else if (op.method === 'POST' && op.path === `${prefix}/reorder`) {
      const order = new Map((body.item_ids || []).map((id, index) => [id, index]));
      items = items.map((item) => order.has(item.id)
        ? { ...item, sort_order: order.get(item.id), _pending: true }
        : item);
    }
  }
  return items;
}

async function emit() {
  const ops = await records();
  pendingEntities.clear();
  ops.forEach((op) => {
    (op.entityIds || (op.entityId ? [op.entityId] : [])).forEach((id) => pendingEntities.add(id));
  });
  listeners.forEach((listener) => listener(ops));
  window.dispatchEvent(new CustomEvent('kc-outbox-change', { detail: ops }));
  return ops;
}

async function put(key, value) {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(value, key);
  await transactionDone(tx);
}

async function remove(key) {
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(key);
  await transactionDone(tx);
}

export function configureOutbox(nextAuth) {
  auth = nextAuth;
}

export async function initializeOutbox() {
  const ops = await emit();
  if (navigator.onLine) void flushOutbox();
  return ops;
}

export function subscribeOutbox(listener) {
  listeners.add(listener);
  records().then(listener).catch(() => listener([]));
  return () => listeners.delete(listener);
}

export function hasPendingEntity(entityId) {
  return pendingEntities.has(entityId);
}

export async function enqueueMutation({ path, method, body, entityId, entityIds, summary }) {
  const entry = {
    path,
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    entityId: entityId || extractEntityId(path),
    entityIds: entityIds || (entityId || extractEntityId(path) ? [entityId || extractEntityId(path)] : []),
    summary,
    timestamp: Date.now(),
    attempts: 0,
    status: 'pending',
  };
  const db = await openOutbox();
  const tx = db.transaction(STORE, 'readwrite');
  const key = await requestResult(tx.objectStore(STORE).add(entry));
  await transactionDone(tx);
  entry.entityIds.forEach((id) => pendingEntities.add(id));
  await emit();
  if (navigator.onLine) void flushOutbox();
  return { ...entry, key };
}

export function isRetryableStatus(status) {
  return RETRYABLE.has(status) || status >= 500;
}

function scheduleRetry(attempts) {
  clearTimeout(retryTimer);
  const delay = Math.min(30000, 1000 * (2 ** Math.min(attempts, 5)));
  retryTimer = setTimeout(() => { if (navigator.onLine) void flushOutbox(); }, delay);
}

async function send(op) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`/api${op.path}`, {
    method: op.method,
    headers,
    body: op.body || undefined,
  });
}

async function doFlush() {
  const ops = await records();
  let drainedAny = false;
  for (const op of ops) {
    if (op.status === 'failed') break;
    let response;
    try {
      response = await send(op);
      if (response.status === 401 && await auth.refresh()) response = await send(op);
    } catch {
      const attempts = op.attempts + 1;
      await put(op.key, {
        ...op, key: undefined, attempts, status: 'pending', error: 'Network unavailable',
      });
      scheduleRetry(attempts);
      break;
    }

    if (response.ok || (op.method === 'DELETE' && response.status === 404)) {
      await remove(op.key);
      drainedAny = true;
      continue;
    }

    const detail = await response.json().catch(() => null);
    const next = {
      ...op,
      key: undefined,
      attempts: op.attempts + 1,
      error: typeof detail?.detail === 'string'
        ? detail.detail
        : detail?.detail ? JSON.stringify(detail.detail) : `Server returned ${response.status}`,
      status: isRetryableStatus(response.status) ? 'pending' : 'failed',
      statusCode: response.status,
    };
    await put(op.key, next);
    if (next.status === 'pending') scheduleRetry(next.attempts);
    // Preserve ordered last-write-wins replay: later operations cannot pass one
    // that has not been accepted by the server.
    break;
  }
  const remaining = await emit();
  if (drainedAny && remaining.length === 0) {
    window.dispatchEvent(new CustomEvent('kc-outbox-drained'));
  } else if (remaining.some((op) => op.status === 'pending')
    && !remaining.some((op) => op.status === 'failed')) {
    scheduleRetry(0);
  }
  return remaining;
}

export function flushOutbox() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

export async function retryOperation(key) {
  const op = (await records()).find((entry) => entry.key === key);
  if (!op) return;
  await put(key, { ...op, key: undefined, status: 'pending', error: undefined });
  await emit();
  return flushOutbox();
}

export async function discardOperation(key) {
  await remove(key);
  await emit();
  window.dispatchEvent(new CustomEvent('kc-outbox-discarded'));
  if (navigator.onLine) void flushOutbox();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushOutbox);
  window.addEventListener('focus', flushOutbox);
}
