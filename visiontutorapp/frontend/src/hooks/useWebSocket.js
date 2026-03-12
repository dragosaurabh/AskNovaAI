/**
 * useWebSocket — Manages the WebSocket connection to the AskNovaAI backend.
 *
 * Features:
 * - Binary frames for audio (no base64 overhead — 33% less data)
 * - JSON text frames for control messages
 * - Auto-reconnect with exponential backoff
 * - Latency tracking (time from user-stops-speaking → first audio chunk)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_RECONNECT_DELAY = 16000;
const INITIAL_RECONNECT_DELAY = 1000;

export default function useWebSocket() {
  const [connectionState, setConnectionState] = useState('disconnected');
  // disconnected | connecting | connected | error
  const [latencyMs, setLatencyMs] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const handlersRef = useRef({});
  const intentionalCloseRef = useRef(false);

  // Latency tracking
  const speechEndTimeRef = useRef(null);
  const latencySamplesRef = useRef([]);

  /**
   * Register message handlers.
   */
  const setHandlers = useCallback((handlers) => {
    handlersRef.current = handlers;
  }, []);

  /**
   * Mark when user stops speaking (for latency measurement).
   */
  const markSpeechEnd = useCallback(() => {
    speechEndTimeRef.current = performance.now();
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
    ws.binaryType = 'arraybuffer'; // Receive binary as ArrayBuffer
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      // Send config message with the selected subject (JSON)
      ws.send(JSON.stringify({ type: 'config', subject }));
    };

    ws.onmessage = (event) => {
      const handlers = handlersRef.current;

      // ── Binary frame = raw PCM audio from Nova ──
      if (event.data instanceof ArrayBuffer) {
        // Measure latency: time from user stopped speaking to first audio chunk
        if (speechEndTimeRef.current) {
          const latency = Math.round(performance.now() - speechEndTimeRef.current);
          speechEndTimeRef.current = null;

          // Rolling average of last 5 samples
          const samples = latencySamplesRef.current;
          samples.push(latency);
          if (samples.length > 5) samples.shift();
          const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
          setLatencyMs(avg);
        }

        handlers.onAudio?.(event.data);
        return;
      }

      // ── Text frame = JSON control message ──
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            setConnectionState('connected');
            handlers.onConnected?.();
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
   * Send a JSON control message (config, image).
   */
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  /**
   * Send raw binary audio data (ArrayBuffer or TypedArray).
   * Avoids base64 encoding — 33% less data over the wire.
   */
  const sendBinary = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
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
    setLatencyMs(null);
    latencySamplesRef.current = [];
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
    latencyMs,
    connect,
    disconnect,
    send,
    sendBinary,
    setHandlers,
    markSpeechEnd,
  };
}
