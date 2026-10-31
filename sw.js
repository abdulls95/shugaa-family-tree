// Shugaa Family Tree — service worker (app shell + offline)
const VERSION = "v20.4.0";
const SHELL = "shugaa-shell-" + VERSION;
const RUNTIME = "shugaa-runtime";
const LOCAL = ["./", "./index.html", "./styles.css", "./config.js", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"];
// pinned libraries and fonts never change at the same URL, so they are safe to keep
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(LOCAL)));   // waits until the page says "update now"
});
self.addEventListener("message", e => { if (e.data === "skip-waiting") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("shugaa-shell-") && k !== SHELL || k.startsWith("shugaa-family-tree-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // own files: network first (always fresh), cache as offline fallback
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  if (CDN.test(req.url)) {
    // libraries & fonts: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); } return r; })));
  }
  // everything else (Supabase data, login) always goes to the network
});

// push notifications
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "آل شجاع", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "شجرة آل شجاع", {
    body: d.body || "", icon: "./icons/icon-192.png", badge: "./icons/favicon-32.png", dir: "rtl", lang: "ar", data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
