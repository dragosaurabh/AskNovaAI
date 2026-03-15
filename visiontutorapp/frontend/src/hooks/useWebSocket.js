/**
 * useWebSocket — Manages the WebSocket connection to the AskNovaAI backend.
 *
 * Features:
 * - Binary frames for audio (no base64 overhead — 33% less data)
 * - JSON text frames for control messages
 * - Auto-reconnect with exponential backoff
 * - Latency tracking (time from last audio sent → first audio received)
 * - Backpressure: skips audio sends if buffer piling up
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_RECONNECT_DELAY = 16000;
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_BUFFERED_AMOUNT = 50000; // 50KB backpressure threshold

export default function useWebSocket() {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [latencyMs, setLatencyMs] = useState(null);

  const wsRef = useRef(null);
  const backupWsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef({});
  const intentionalCloseRef = useRef(false);

  // Latency & Frontend VAD tracking
  const speechEndTimeRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const latencySamplesRef = useRef([]);

  /**
   * Register message handlers.
   */
  const setHandlers = useCallback((handlers) => {
    handlersRef.current = handlers;
  }, []);

  /**
   * Keep a warm backup connection ready in case of drop.
   */
  const prepareBackupConnection = useCallback(() => {
    if (backupWsRef.current || intentionalCloseRef.current) return;
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/tutor';
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    backupWsRef.current = ws;
  }, []);

  /**
   * Connect to the backend WebSocket.
   */
  const connect = useCallback(function connect(subject = 'General', voice = 'Charon') {
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
    }

    intentionalCloseRef.current = false;
    setConnectionState('connecting');

    // Use backup connection if available and open, else create new
    let ws;
    if (backupWsRef.current && backupWsRef.current.readyState === WebSocket.OPEN) {
      ws = backupWsRef.current;
      backupWsRef.current = null;
    } else {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/tutor';
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
    }
    
    wsRef.current = ws;
    prepareBackupConnection();

    // If we hot-swapped a connected socket, trigger onopen immediately
    if (ws.readyState === WebSocket.OPEN && !ws.hasInitialized) {
      ws.hasInitialized = true;
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'config', subject, voice }));
    }

    ws.onopen = () => {
      ws.hasInitialized = true;
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'config', subject, voice }));
    };

    ws.onmessage = (event) => {
      const handlers = handlersRef.current;

      // ── Binary frame = raw PCM audio from Nova ──
      if (event.data instanceof ArrayBuffer) {
        // Measure latency: time from real speech end to first response chunk
        if (speechEndTimeRef.current) {
          const latency = Math.round(performance.now() - speechEndTimeRef.current);
          speechEndTimeRef.current = null; // Used it!

          // We got a response, no need to send silence ping anymore
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }

          // Only record positive, reasonable values
          if (latency > 0 && latency < 30000) {
            const samples = latencySamplesRef.current;
            samples.push(latency);
            if (samples.length > 5) samples.shift();
            const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
            setLatencyMs(avg);
          }
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

    ws.onclose = (event) => {
      wsRef.current = null;
      if (!intentionalCloseRef.current) {
        setConnectionState('disconnected');
        
        // Handle specific server-side disconnects (e.g., API key invalid / Model not found = 1008 or 1011)
        if (event.code === 1008 || event.code === 1011) {
          const handlers = handlersRef.current;
          handlers.onError?.('Configuration error — contact support');
          // Don't auto-reconnect if it's a hard auth/config error
          return;
        }

        if (reconnectAttemptsRef.current >= 3) {
          handlersRef.current.onError?.('Connection failed. Please refresh the page.');
          return;
        }

        const delay = reconnectDelayRef.current;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          reconnectDelayRef.current = delay * 2;
          connect(subject, handlersRef.current.lastRequestedVoice || 'Charon');
        }, delay);
      } else {
        setConnectionState('disconnected');
      }
    };
  }, [prepareBackupConnection]);

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
   * Includes VAD tracking for accurate latency measurements and fallback responses.
   */
  const sendBinary = useCallback((data, volume = 1.0) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Backpressure: don't send if too much buffered
      if (ws.bufferedAmount < MAX_BUFFERED_AMOUNT) {
        ws.send(data);
        
        // --- Frontend VAD Logic ---
        if (volume >= 0.01) {
          isSpeakingRef.current = true;
          speechEndTimeRef.current = null; // Restart tracking
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeakingRef.current && volume < 0.01) {
          // Transition from speaking -> silence
          isSpeakingRef.current = false;
          speechEndTimeRef.current = performance.now();
          
          // Fallback: If no response in 3s, send ping to force generation
          silenceTimerRef.current = setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(new ArrayBuffer(320));
            }
          }, 3000);
        }
      }
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
    if (backupWsRef.current) {
      backupWsRef.current.close();
      backupWsRef.current = null;
    }
    setConnectionState('disconnected');
    setLatencyMs(null);
    latencySamplesRef.current = [];
    speechEndTimeRef.current = null;
    isSpeakingRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (backupWsRef.current) backupWsRef.current.close();
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
  };
}
