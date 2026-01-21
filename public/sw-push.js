// Service Worker para Push Notifications
// Este arquivo roda em background e recebe notificações mesmo com o app fechado

self.addEventListener('push', (event) => {
  console.log('[SW Push] Notificação recebida:', event);
  
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
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag || 'moove-notification',
    renotify: true,
    requireInteraction: true,
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
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW Push] Notificação clicada:', event);
  
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
  // Aqui poderia re-registrar a subscription, mas por simplicidade apenas logamos
});
