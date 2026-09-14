import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('../offline/outbox', () => ({
  configureOutbox: vi.fn(),
  enqueueMutation: vi.fn(),
}));
import { ApiClient } from './client';
const token = (sub) => `x.${btoa(JSON.stringify({ sub }))}.x`;
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
test('offline recipe cache is isolated by account, including profile', async () => {
  const client = new ApiClient();
  client.setToken(token('alice'));
  client.request = vi.fn().mockResolvedValue({ name: 'Alice recipe' });
  await client.cachedLibraryRead('/meals/one', 'recipe-one');
  client.request.mockRejectedValue(new TypeError('Offline'));
  expect(await client.cachedLibraryRead('/meals/one', 'recipe-one')).toEqual({
    name: 'Alice recipe',
  });
  client.setToken(token('bob'));
  await expect(
    client.cachedLibraryRead('/meals/one', 'recipe-one'),
  ).rejects.toThrow('Offline');
  client.setToken(null);
  await expect(
    client.cachedLibraryRead('/meals/one', 'recipe-one'),
  ).rejects.toThrow('Offline');
});
test('multipart uploads let the browser supply its boundary', async () => {
  const client = new ApiClient();
  client.setToken(token('alice'));
  global.fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draft: true }),
    });
  const body = new FormData();
  body.append('files', new Blob(['photo']), 'recipe.png');
  await client.request('/recipes/import/photos', { method: 'POST', body });
  const opts = fetch.mock.calls[0][1];
  expect(opts.headers['Content-Type']).toBeUndefined();
  expect(opts.headers.Authorization).toContain('Bearer ');
});
