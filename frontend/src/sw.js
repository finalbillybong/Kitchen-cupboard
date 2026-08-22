import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();

const userCacheKeyPlugin = {
  async cacheKeyWillBeUsed({ request }) {
    const authorization = request.headers.get('Authorization') || '';
    let identity = 'anonymous';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(segment + '='.repeat((4 - segment.length % 4) % 4)));
        identity = payload.sub || 'authenticated';
      } catch {
        const bytes = new TextEncoder().encode(token);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        identity = Array.from(new Uint8Array(hash).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
      }
    }
    const url = new URL(request.url);
    url.searchParams.set('__kc_user', identity);
    return new Request(url, { method: 'GET' });
  },
};

registerRoute(
  ({ url, request }) => url.origin === self.location.origin
    && url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'kc-api-read-v2',
    networkTimeoutSeconds: 4,
    plugins: [
      userCacheKeyPlugin,
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'kc-navigation-v2', networkTimeoutSeconds: 4 }),
);

registerRoute(
  ({ url, request }) => url.origin === self.location.origin
    && request.method === 'GET' && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'kc-assets-v2',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') return caches.match('/index.html');
  return Response.error();
});
