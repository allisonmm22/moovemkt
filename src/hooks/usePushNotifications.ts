import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const VAPID_PUBLIC_KEY = 'BHES9NRuc4xByCgy0ShHOaQ8EKk83tRfSDSip8H-kyS5fg3r32ratlLaiMqctXLe4tKY1CWljMxF0CgD8oBf5uI';

interface PushSubscriptionState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission | 'unsupported';
}

export const usePushNotifications = () => {
  const { usuario } = useAuth();
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: 'unsupported',
  });

  // Verificar suporte e status atual
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      
      if (!isSupported) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      const permission = Notification.permission;
      let isSubscribed = false;

      try {
        // Verificar se já tem subscription ativa
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        isSubscribed = !!subscription;

        // Se tiver subscription local, verificar se está no banco
        if (subscription && usuario) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('usuario_id', usuario.id)
            .eq('endpoint', subscription.endpoint)
            .maybeSingle();
          
          isSubscribed = !!data;
        }
      } catch (error) {
        console.error('Erro ao verificar subscription:', error);
      }

      setState({
        isSupported: true,
        isSubscribed,
        isLoading: false,
        permission,
      });
    };

    checkSupport();
  }, [usuario]);

  // Usar o Service Worker já registrado pelo VitePWA
  const getServiceWorkerRegistration = useCallback(async () => {
    try {
      // Aguarda o SW do VitePWA estar pronto (não registra um novo!)
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Usando SW existente:', registration.scope);
      return registration;
    } catch (error) {
      console.error('[Push] Erro ao obter SW:', error);
      throw error;
    }
  }, []);

  // Converter VAPID key para Uint8Array
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Inscrever para push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!usuario) {
      console.error('Usuário não autenticado');
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Pedir permissão
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(prev => ({ ...prev, isLoading: false, permission }));
        return false;
      }

      // Usar o SW já registrado pelo VitePWA
      const registration = await getServiceWorkerRegistration();

      // Criar subscription usando o SW do VitePWA
      const vapidKeyArray = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      console.log('[Push] Criando subscription...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(vapidKeyArray) as BufferSource,
      });

      const subscriptionJson = subscription.toJSON();
      
      // Salvar no banco
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          usuario_id: usuario.id,
          conta_id: usuario.conta_id,
          endpoint: subscriptionJson.endpoint!,
          p256dh: subscriptionJson.keys!.p256dh,
          auth: subscriptionJson.keys!.auth,
          user_agent: navigator.userAgent,
        }, {
          onConflict: 'usuario_id,endpoint'
        });

      if (error) {
        console.error('Erro ao salvar subscription:', error);
        throw error;
      }

      setState(prev => ({ 
        ...prev, 
        isSubscribed: true, 
        isLoading: false, 
        permission: 'granted' 
      }));
      
      console.log('[Push] Subscription criada com sucesso!');
      return true;
    } catch (error) {
      console.error('[Push] Erro ao criar subscription:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [usuario, getServiceWorkerRegistration]);

  // Cancelar subscription
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!usuario) return false;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remover do banco
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('usuario_id', usuario.id)
          .eq('endpoint', subscription.endpoint);

        // Cancelar subscription local
        await subscription.unsubscribe();
      }

      setState(prev => ({ ...prev, isSubscribed: false, isLoading: false }));
      console.log('Push subscription cancelada');
      return true;
    } catch (error) {
      console.error('Erro ao cancelar subscription:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [usuario]);

  // Toggle subscription
  const toggleSubscription = useCallback(async (): Promise<boolean> => {
    if (state.isSubscribed) {
      return await unsubscribe();
    } else {
      return await subscribe();
    }
  }, [state.isSubscribed, subscribe, unsubscribe]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    toggleSubscription,
  };
};
