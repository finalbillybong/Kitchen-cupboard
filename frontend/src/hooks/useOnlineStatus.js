import { useState, useEffect } from 'react';
import { networkAvailable, setNetworkAvailable } from '../offline/connectivity';
import { subscribeOutbox } from '../offline/outbox';

export function useOnlineStatus() {
  const [online, setOnline] = useState(networkAvailable);
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    const handleOnline = () => setNetworkAvailable(true);
    const handleOffline = () => setNetworkAvailable(false);
    const handleConnectivity = () => setOnline(networkAvailable());

    window.addEventListener('kc-connectivity', handleConnectivity);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = subscribeOutbox(setOperations);

    return () => {
      window.removeEventListener('kc-connectivity', handleConnectivity);
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
