import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(listId, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !listId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/${listId}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send periodic pings
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
      ws._pingInterval = pingInterval;
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const msg = JSON.parse(event.data);
        onMessage(msg);
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (ws._pingInterval) clearInterval(ws._pingInterval);
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [listId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        if (wsRef.current._pingInterval) clearInterval(wsRef.current._pingInterval);
        wsRef.current.close();
      }
    };
  }, [connect]);
}
