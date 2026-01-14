import { getNotificationPreferences } from '@/hooks/useNotificationPreferences';

// Notification sound utility using Web Audio API
let audioContext: AudioContext | null = null;

export const playNotificationSound = () => {
  const { soundEnabled } = getNotificationPreferences();
  if (!soundEnabled) return;

  try {
    // Create audio context on first use (browser requirement)
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Pleasant notification tone
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    oscillator.type = 'sine';

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);

    // Second beep for emphasis
    setTimeout(() => {
      if (!audioContext) return;
      
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.frequency.setValueAtTime(1046.5, audioContext.currentTime); // C6 note
      osc2.type = 'sine';

      gain2.gain.setValueAtTime(0, audioContext.currentTime);
      gain2.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.05);
      gain2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.2);
    }, 150);

  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Show browser notification
export const showBrowserNotification = (title: string, body: string, onClick?: () => void) => {
  const { browserEnabled } = getNotificationPreferences();
  if (!browserEnabled) return;
  
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'new-message', // Prevents duplicate notifications
      requireInteraction: false,
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
};

// Combined notification (sound + browser)
export const notifyNewMessage = (contactName: string, messagePreview: string, onClick?: () => void) => {
  playNotificationSound();
  showBrowserNotification(
    `Nova mensagem de ${contactName}`,
    messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview,
    onClick
  );
};
