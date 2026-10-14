// Мангит Метан — service worker.
// Мақсад: "app sifatida o'rnatish" (installable PWA) imkoniyatini berish,
// asosiy qобиқни (shell) tezroq yuklash VA интернет бутунлай йўқ пайтда
// ҳам иловани очиш мумкин бўлиши (шунда оператор ҳисоботни киритиб,
// навбатга қўя олади — тизимнинг ўзи интернет қайтганда юборади).
// Supabase'dan keladigan JONLI MA'LUMOTLAR hech qachon keshlanmaydi,
// har doim tarmoqdan olinadi — faqat qobiq (HTML/CSS/JS/icon) keshlanadi.
const CACHE_NAME = 'mangitmetan-shell-v4';
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// Илова ишлаши учун МАЖБУРИЙ бўлган ташқи (CDN) кутубхоналар — булар
// йўқ бўлса илова умуман очилмайди, шунинг учун уларни ҳам "install"
// пайтида олдиндан кешлаб қўямиз ва доим кеш-биринчи (cache-first)
// стратегия билан хизмат қиламиз (версия рақами қотирилган — хавфсиз).
const LIB_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([
        cache.addAll(SHELL_FILES).catch(()=>{}),
        ...LIB_FILES.map(url => fetch(url, {mode:'cors'}).then(res => res.ok && cache.put(url, res)).catch(()=>{}))
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// index.html'даги саҳифа "SKIP_WAITING" жўнатса — янги версияни дарров
// ишга туширамиз (аввал мавжуд иловага келган янгиланишни кутиб
// қолмасдан). Шунда controllerchange ҳодисаси ишга тушиб, саҳифа
// авто-рефреш бўлади (index.html'даги скриптга қаранг).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ============================================================
// PUSH BILDIRISHNOMALARI — telefon ekrani qulf bo'lsa ham, ilova
// yopiq bo'lsa ham keladi (haqiqiy OS darajasidagi push). Yuborish
// tomoni (Supabase Edge Function + VAPID kalitlar) alohida sozlanadi —
// bu yerda faqat KELGAN push'ni ko'rsatish mantiqi.
// ============================================================
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) { data = { title: 'Мангит Метан', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Мангит Метан';
  const options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './index.html' },
    vibrate: [100, 50, 100]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) { if ('focus' in client) return client.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Қотирилган версияли CDN кутубхоналар — кеш-биринчи (тезроқ ва
  // интернет йўқ бўлса ҳам ишлайди, чунки версия ўзгармайди).
  if (LIB_FILES.includes(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(()=>{});
        return res;
      }))
    );
    return;
  }

  // Бошқа ташқи origin (масалан Supabase API, Google Fonts) — тегмаймиз,
  // ҳисоботлар ва молиявий маълумот доим тармоқдан (энг янгиси) олинади.
  if (new URL(req.url).origin !== self.location.origin) return;

  // Шу origin'даги қобиқ файллари — тармоқ-биринчи, тармоқ ишламаса кешдан.
  // {cache:'no-store'} МУҲИМ: акс ҳолда баъзи браузерлар/iOS fetch()ни
  // ўзининг HTTP дискдаги кешидан (service worker кешидан эмас!) жавоб
  // қайтариб, GitHub/Vercel'да код ўзгарган бўлса ҳам эскисини
  // кўрсатиб қолиши мумкин эди — худди шу "янгиланмайди" муаммосининг
  // асосий сабаби.
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
