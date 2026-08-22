import { useState, useEffect } from 'react';
import { subscribeOutbox } from '../offline/outbox';

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = subscribeOutbox(setOperations);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return {
    online,
    operations,
    queueCount: operations.length,
    failedCount: operations.filter((op) => op.status === 'failed').length,
  };
}
