// Push Notification Handlers - Importado pelo Service Worker do Workbox
// Este arquivo é injetado no SW principal via importScripts

console.log('[SW Push Handler] Carregado e ativo');

self.addEventListener('push', (event) => {
  console.log('[SW Push] Evento push recebido!', event);
  
  let data = {
    title: 'Nova mensagem',
    body: 'Você recebeu uma nova mensagem',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/conversas'
  };
  
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('[SW Push] Payload recebido:', JSON.stringify(payload));
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        url: payload.url || payload.data?.url || data.url,
        tag: payload.tag || 'moove-notification',
        data: payload.data || {}
      };
    }
  } catch (e) {
    console.error('[SW Push] Erro ao parsear dados:', e);
  }
  
  console.log('[SW Push] Exibindo notificação:', data.title);
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag || 'moove-notification',
    renotify: true,
    requireInteraction: false, // Permite que a notificação seja dispensada automaticamente
    vibrate: [200, 100, 200],
    data: {
      url: data.url,
      ...data.data
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW Push] Notificação exibida com sucesso!'))
      .catch((err) => console.error('[SW Push] Erro ao exibir notificação:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW Push] Notificação clicada:', event.action);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/conversas';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Tentar encontrar uma janela já aberta
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          // Navegar para a URL e focar
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Se não houver janela aberta, abrir uma nova
      return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW Push] Subscription changed:', event);
});
