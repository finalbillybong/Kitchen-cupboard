import { useState, useEffect, useCallback } from 'react';

// Open the offline queue DB and count pending items
async function getQueueCount() {
  return new Promise((resolve) => {
    const req = indexedDB.open('kc-offline', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('queue', 'readonly');
        const countReq = tx.objectStore('queue').count();
        countReq.onsuccess = () => resolve(countReq.result);
        countReq.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    };
    req.onerror = () => resolve(0);
  });
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  const refreshQueue = useCallback(async () => {
    const count = await getQueueCount();
    setQueueCount(count);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // Queue will be replayed by SW; recheck count after a delay
      setTimeout(refreshQueue, 2000);
    };
    const handleOffline = () => {
      setOnline(false);
      refreshQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for SW queue-replayed messages
    const handleMessage = (event) => {
      if (event.data?.type === 'queue-replayed') {
        refreshQueue();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Initial check
    refreshQueue();

    // Poll queue count periodically when offline
    const interval = setInterval(() => {
      if (!navigator.onLine) refreshQueue();
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, [refreshQueue]);

  return { online, queueCount, refreshQueue };
}
