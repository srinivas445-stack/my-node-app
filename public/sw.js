self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("asset-cache").then(cache => {
      return cache.addAll([
        "/",
        "/login.html",
        "/admin.html",
        "/manifest.json",
        "/style.css"
      ]);
    })
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
