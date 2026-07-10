/* Forja Diária — service worker */
const CACHE = 'forja-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// app shell: cache primeiro; API da Anthropic: sempre rede
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

// tentativa de acordar em segundo plano (Chrome/Android, app instalado)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'forja-diaria') e.waitUntil(notificarSeForHora());
});

async function notificarSeForHora() {
  const agora = new Date();
  if (agora.getHours() < 4) return;
  const hoje = agora.getFullYear() + '-' +
    String(agora.getMonth() + 1).padStart(2, '0') + '-' +
    String(agora.getDate()).padStart(2, '0');
  // controle de "já notifiquei hoje" no cache (SW não tem localStorage)
  const c = await caches.open(CACHE);
  const marca = await c.match('./ultima-notificacao');
  if (marca && (await marca.text()) === hoje) return;
  await c.put('./ultima-notificacao', new Response(hoje));
  await self.registration.showNotification('⚒ Forja Diária — 4h. De pé.', {
    body: 'Sua mensagem do dia está pronta. Disciplina, honra e fé.',
    icon: 'icon.svg',
    badge: 'icon.svg',
    tag: 'forja-diaria'
  });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const cli of lista) if ('focus' in cli) return cli.focus();
      return self.clients.openWindow('./');
    })
  );
});
