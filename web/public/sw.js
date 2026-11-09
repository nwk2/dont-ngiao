// Don't Ngiao service worker (PWA, Nov 2026). Caches the app shell so
// the app launches fast and loads offline; the API is never cached.
// Navigation (the HTML shell) is network-first with a cache fallback,
// so a new deploy reaches users when they are online and the last good
// shell still loads when they are not. Hashed static assets (JS/CSS)
// are cache-first — their filenames change on every build, so they can
// never go stale. Bump CACHE when the strategy changes.
const CACHE = 'dont-ngiao-v1';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache the API
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});

// ---- Push notifications (Nov 2026) ----
// The Worker sends an encrypted Web Push (RFC 8291 + 8292) to this
// device's subscription when a money event happens in a group the user
// is in. The payload is JSON { title, body, url, tag }. Every push
// shows a notification (browsers require it); tapping it opens the
// app at the payload's URL (the group), or Home when there is none.
// `tag` collapses repeats of the same event into one notification.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Don't Ngiao";
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || undefined;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      data: { url },
    })
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  const fullUrl = new URL(url, self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === fullUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl);
      return undefined;
    })
  );
});
