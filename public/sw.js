const CACHE_NAME = "mission2028-shell-v2";
const APP_SHELL = ["/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// Only intervene for page navigations, so an offline visit still shows
// something instead of the browser's default offline error. Every other
// request (JS/CSS chunks, fonts, images, API calls) is left completely
// untouched — the browser's own HTTP cache already handles static asset
// caching correctly, including redirects across deploys.
//
// A previous version of this file cache-intercepted every GET request,
// including Next.js's content-hashed chunk files. When a stale service
// worker from an older deploy fetched a chunk URL that the CDN now
// redirects (which happens naturally right after shipping a new deploy —
// exactly what this app does on every push), the browser refused to let
// the service worker hand back that redirected response for a <script>
// load: "The script resource is behind a redirect, which is disallowed."
// That broke every page behind a stuck Suspense fallback until the
// service worker was manually unregistered. Don't reintroduce
// interception of non-navigation requests without re-reading this.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() => caches.match(request) || caches.match("/login")),
  );
});
