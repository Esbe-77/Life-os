// Offline support. App files are served from the cache straight away and
// refreshed in the background, so an update shows up on the next launch.
// Bump VERSION when the file list changes.

const VERSION = "life-os-v18";
const APP_FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/backup.js",
  "js/ui.js",
  "js/habits.js",
  "js/reminders.js",
  "js/modules/index.js",
  "js/modules/home.js",
  "js/modules/weekly-review.js",
  "js/modules/decisions.js",
  "js/modules/people.js",
  "js/modules/energy.js",
  "js/modules/mind.js",
  "js/modules/goals.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "fonts").map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: cache once, then use forever.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open("fonts").then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // App files: cached copy now, fresh copy for next time.
  event.respondWith(caches.open(VERSION).then(async c => {
    const key = req.mode === "navigate" ? "index.html" : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) c.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { event.waitUntil(fresh); return hit; }
    return (await fresh) || new Response("Offline", { status: 503 });
  }));
});
