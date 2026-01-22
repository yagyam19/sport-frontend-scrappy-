import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY } from '../constants';
import { ConnectionStatus, WSMessage } from '../types';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  connect: (matchId: string | number) => void;
  disconnect: () => void;
  activeMatchId: string | number | null;
}

export const useWebSocket = (
  onMessage: (msg: WSMessage) => void
): UseWebSocketReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [activeMatchId, setActiveMatchId] = useState<string | number | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const isIntentionalClose = useRef(false);
  const activeMatchIdRef = useRef<string | number | null>(null);

  // Core connect function
  const initConnection = useCallback((matchId: string | number) => {
    // Cleanup previous connection
    if (ws.current) {
      isIntentionalClose.current = true;
      ws.current.close();
    }

    setStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');
    isIntentionalClose.current = false;

    // Construct URL
    const socketUrl = `${WS_BASE_URL}?matchId=${matchId}`;
    
    try {
      const socket = new WebSocket(socketUrl);
      ws.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        reconnectAttempts.current = 0;
        socket.send(JSON.stringify({ type: 'subscribe', matchId }));
        console.log('[WebSocket] Connected successfully');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      socket.onerror = (event) => {
        // WebSocket error events are generic in browsers and don't contain descriptive messages.
        // We log it to indicate an issue occurred.
        console.warn('[WebSocket] Connection error occurred');
        
        // Only set error status if we were connected; otherwise let onclose handle it
        if (ws.current?.readyState === WebSocket.OPEN) {
             setStatus('error');
        }
      };

      socket.onclose = (event) => {
        if (!isIntentionalClose.current) {
          setStatus('disconnected');
          
          // Exponential backoff for real reconnection attempts
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * (2 ** reconnectAttempts.current),
            MAX_RECONNECT_DELAY
          );
          
          console.log(`[WebSocket] Disconnected (Code: ${event.code}). Reconnecting in ${delay}ms...`);
          
          reconnectTimeout.current = setTimeout(() => {
            reconnectAttempts.current += 1;
            if (activeMatchIdRef.current != null) {
                initConnection(activeMatchIdRef.current);
            }
          }, delay);
        } else {
            // If closed intentionally, just set status
            setStatus('disconnected');
        }
      };

    } catch (e) {
      console.error('[WebSocket] Connection creation failed:', e);
      setStatus('error');
    }
  }, [onMessage]);

  // Public connect method
  const connect = useCallback((matchId: string | number) => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    reconnectAttempts.current = 0;
    setActiveMatchId(matchId);
    activeMatchIdRef.current = matchId;
    initConnection(matchId);
  }, [initConnection]);

  // Public disconnect method
  const disconnect = useCallback(() => {
    isIntentionalClose.current = true;
    
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setActiveMatchId(null);
    activeMatchIdRef.current = null;
    setStatus('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isIntentionalClose.current = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  return { status, connect, disconnect, activeMatchId };
};
