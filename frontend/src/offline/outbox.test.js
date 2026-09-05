import { beforeAll, describe, expect, it, vi } from 'vitest';

let outbox;

beforeAll(async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  const request = indexedDB.open('kc-offline', 1);
  await new Promise((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore('queue', { autoIncrement: true });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const db = request.result;
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').add({
    url: 'https://example.test/api/lists/list-1/items/00000000-0000-4000-8000-000000000001',
    method: 'DELETE',
    headers: { Authorization: 'Bearer must-not-survive', 'Content-Type': 'application/json' },
    timestamp: 1,
  });
  await new Promise((resolve) => { tx.oncomplete = resolve; });
  db.close();
  outbox = await import('./outbox');
});

describe('browser outbox', () => {
  it('classifies retryable responses', () => {
    expect(outbox.isRetryableStatus(408)).toBe(true);
    expect(outbox.isRetryableStatus(429)).toBe(true);
    expect(outbox.isRetryableStatus(503)).toBe(true);
    expect(outbox.isRetryableStatus(403)).toBe(false);
  });

  it('migrates credentials away and drains in order with current auth', async () => {
    await outbox.initializeOutbox();
    let ops = await outbox.getOutboxOperations();
    expect(ops[0].path).toContain('/lists/list-1/items/');
    expect(JSON.stringify(ops[0])).not.toContain('must-not-survive');

    await outbox.enqueueMutation({
      path: '/lists/list-1/items', method: 'POST', body: { id: 'new-id', name: 'Milk' }, summary: 'Add Milk',
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    outbox.configureOutbox({ getToken: () => 'current-token', refresh: vi.fn() });
    await outbox.flushOutbox();
    ops = await outbox.getOutboxOperations();
    expect(ops).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer current-token');
  });

  it('refreshes authentication once and retains permanent failures for action', async () => {
    await outbox.enqueueMutation({ path: '/lists/list-1/items/x', method: 'PUT', body: { checked: true }, summary: 'Tick' });
    const refresh = vi.fn().mockResolvedValue(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    outbox.configureOutbox({ getToken: () => 'fresh-token', refresh });
    await outbox.flushOutbox();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await outbox.getOutboxOperations()).toHaveLength(0);

    await outbox.enqueueMutation({ path: '/lists/list-1/items/x', method: 'PUT', body: {}, summary: 'Edit' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ detail: 'No access' }),
    }));
    await outbox.flushOutbox();
    const [failed] = await outbox.getOutboxOperations();
    expect(failed).toMatchObject({ status: 'failed', statusCode: 403, error: 'No access' });
    await outbox.discardOperation(failed.key);
    expect(await outbox.getOutboxOperations()).toHaveLength(0);
  });

  it('rebuilds offline-created items and follow-up changes after reload', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const id = '00000000-0000-4000-8000-000000000099';
    await outbox.enqueueMutation({
      path: '/lists/list-1/items', method: 'POST', entityId: id,
      body: { id, name: 'Milk', quantity: 1 }, summary: 'Add Milk',
    });
    await outbox.enqueueMutation({
      path: `/lists/list-1/items/${id}`, method: 'PUT', entityId: id,
      body: { name: 'Oat milk', checked: true }, summary: 'Edit item',
    });

    const projected = await outbox.projectPendingItems('list-1', []);
    expect(projected).toMatchObject([{ id, name: 'Oat milk', checked: true, _pending: true }]);

    for (const op of await outbox.getOutboxOperations()) await outbox.discardOperation(op.key);
  });

  it('projects an idempotent library commit using the same smart-merge rules', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const body = {
      list_id: 'list-1', target_servings: 4, source_version: 2,
      selected_source_row_ids: ['salt-row', 'carrot-row'], request_id: 'request-1234',
    };
    await outbox.enqueueMutation({
      path: '/meals/meal-1/commit', method: 'POST', body, summary: 'Add meal',
      projection: [
        { source_row_id: 'salt-row', name: ' Salt ', quantity: 2, unit: 'PINCH', notes: 'new' },
        { source_row_id: 'carrot-row', name: 'Carrots', quantity: 500, unit: 'g', notes: '' },
      ],
    });
    const projected = await outbox.projectPendingItems('list-1', [{
      id: 'salt-item', name: 'salt', quantity: 1, unit: 'pinch', checked: true,
      notes: 'preserved', category_id: 'category-1',
    }]);
    expect(projected[0]).toMatchObject({
      id: 'salt-item', quantity: 3, checked: false, notes: 'preserved', category_id: 'category-1', _pending: true,
    });
    expect(projected[1]).toMatchObject({ name: 'Carrots', quantity: 500, unit: 'g', _pending: true });

    for (const op of await outbox.getOutboxOperations()) await outbox.discardOperation(op.key);
  });
});
