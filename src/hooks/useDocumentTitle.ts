import { useEffect } from 'react';

const BASE_TITLE = 'CRM WhatsApp';

export const useDocumentTitle = (unreadCount: number) => {
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }

    // Cleanup: reset title when component unmounts
    return () => {
      document.title = BASE_TITLE;
    };
  }, [unreadCount]);
};

// Standalone function to update title from anywhere
export const updateDocumentTitle = (unreadCount: number) => {
  if (unreadCount > 0) {
    document.title = `(${unreadCount}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
};
