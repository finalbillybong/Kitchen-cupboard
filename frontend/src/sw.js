import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kc-api-read-') && key !== 'kc-api-read-v3').map(key => caches.delete(key)))));
});

const userCacheKeyPlugin = {
  async cachedResponseWillBeUsed({ cachedResponse }) {
    if (!cachedResponse) return null;
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-KC-Offline', '1');
    return new Response(cachedResponse.body, {status: cachedResponse.status, headers});
  },
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
    && (/^\/api\/(lists|categories|ingredients|meals|basics|planner|pantry)(\/|$)/.test(url.pathname) || url.pathname.startsWith('/api/recipes/images/'))
    && !url.pathname.includes('/export') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'kc-api-read-v3',
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
  if (event.request.destination === 'document') return matchPrecache('/index.html');
  return Response.error();
});
