import { useState, useEffect, useCallback } from 'react';

interface NotificationPreferences {
  soundEnabled: boolean;
  browserEnabled: boolean;
}

const STORAGE_KEY = 'notification_preferences';

const defaultPreferences: NotificationPreferences = {
  soundEnabled: true,
  browserEnabled: true,
};

export const useNotificationPreferences = () => {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    }
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences: NotificationPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
      setPreferences(newPreferences);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
    }
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    savePreferences({ ...preferences, soundEnabled: enabled });
  }, [preferences, savePreferences]);

  const setBrowserEnabled = useCallback((enabled: boolean) => {
    savePreferences({ ...preferences, browserEnabled: enabled });
  }, [preferences, savePreferences]);

  return {
    soundEnabled: preferences.soundEnabled,
    browserEnabled: preferences.browserEnabled,
    setSoundEnabled,
    setBrowserEnabled,
  };
};

// Static getter for use outside React components
export const getNotificationPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading notification preferences:', error);
  }
  return defaultPreferences;
};
