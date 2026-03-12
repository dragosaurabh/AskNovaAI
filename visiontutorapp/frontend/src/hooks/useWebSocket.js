/**
 * useWebSocket — Manages the WebSocket connection to the VisionTutor backend.
 * 
 * Features:
 * - Auto-reconnect with exponential backoff
 * - JSON message parsing and routing
 * - Connection state tracking
 * - Graceful disconnect
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_RECONNECT_DELAY = 16000;
const INITIAL_RECONNECT_DELAY = 1000;

export default function useWebSocket() {
  const [connectionState, setConnectionState] = useState('disconnected');
  // disconnected | connecting | connected | error

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const handlersRef = useRef({});
  const intentionalCloseRef = useRef(false);

  /**
   * Register message handlers.
   * handlers: { onAudio, onInputTranscript, onOutputTranscript, onTurnComplete, onInterrupted, onError, onConnected }
   */
  const setHandlers = useCallback((handlers) => {
    handlersRef.current = handlers;
  }, []);

  /**
   * Connect to the backend WebSocket.
   */
  const connect = useCallback((subject = 'General') => {
    // Clean up any existing connection
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
    }

    intentionalCloseRef.current = false;
    setConnectionState('connecting');

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/tutor';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      // Send config message with the selected subject
      ws.send(JSON.stringify({ type: 'config', subject }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const handlers = handlersRef.current;

        switch (message.type) {
          case 'connected':
            setConnectionState('connected');
            handlers.onConnected?.();
            break;
          case 'audio':
            handlers.onAudio?.(message.data);
            break;
          case 'input_transcript':
            handlers.onInputTranscript?.(message.text);
            break;
          case 'output_transcript':
            handlers.onOutputTranscript?.(message.text);
            break;
          case 'turn_complete':
            handlers.onTurnComplete?.();
            break;
          case 'interrupted':
            handlers.onInterrupted?.();
            break;
          case 'error':
            handlers.onError?.(message.message);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      setConnectionState('error');
    };

    ws.onclose = () => {
      wsRef.current = null;

      if (!intentionalCloseRef.current) {
        setConnectionState('disconnected');
        // Auto-reconnect with exponential backoff
        const delay = reconnectDelayRef.current;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
          connect(subject);
        }, delay);
      } else {
        setConnectionState('disconnected');
      }
    };
  }, []);

  /**
   * Send a message over the WebSocket.
   */
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  /**
   * Disconnect the WebSocket gracefully.
   */
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    send,
    setHandlers,
  };
}
