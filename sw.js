/* Forja Diária — service worker v3
   - abre sem internet (app, ícones e fonte guardados)
   - página principal: rede primeiro, então cada versão nova chega sozinha
   - lembrete da alvorada via periodicSync (quando o Android permitir) */
const CACHE = 'forja-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'forja-cfg').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.anthropic.com') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copia));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonte) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const rede = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      }).catch(() => hit);
      return hit || rede;
    })
  );
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'forja-diaria') e.waitUntil(notificarSeForHora());
});

async function notificarSeForHora() {
  const cfg = await caches.open('forja-cfg');
  const alvoRes = await cfg.match('./alvo');
  const alvo = alvoRes ? await alvoRes.text() : '04:00';
  const [h, m] = alvo.split(':').map(Number);
  const agora = new Date();
  if (agora.getHours() * 60 + agora.getMinutes() < h * 60 + m) return;
  const hoje = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
  const marca = await cfg.match('./ultima-notificacao');
  if (marca && (await marca.text()) === hoje) return;
  await cfg.put('./ultima-notificacao', new Response(hoje));
  await self.registration.showNotification('⚔ ' + alvo + '. DE PÉ, SOLDADO.', {
    body: 'A forja está acesa. Seu ritual da alvorada espera.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'forja-diaria',
    vibrate: [200, 100, 200, 100, 400], data: { url: './#forjar' }
  });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const cli of lista) if ('focus' in cli) return cli.focus();
      return self.clients.openWindow('./#forjar');
    })
  );
});
