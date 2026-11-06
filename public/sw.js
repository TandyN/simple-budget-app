const CACHE_NAME = 'simple-budget-__CACHE_VERSION__';
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('simple-budget-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        const rootUrl = new URL('./', self.registration.scope).href;
        const cached =
          (await cache.match(request)) ||
          (await cache.match(indexUrl)) ||
          (await cache.match(rootUrl));
        if (!cached) {
          return Response.error();
        }
        const body = await cached.blob();
        return new Response(body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers,
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then(async (networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      });
    }),
  );
});
