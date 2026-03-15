/**
 * StatusBar — Connection status, session timer, latency badge, and trust badges.
 */

import { useState, useEffect, useRef } from 'react';
import { formatTime } from '../utils/helpers';

export default function StatusBar({ connectionState, isSessionActive, latencyMs }) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(null);

  // Session timer — starts counting when connected
  useEffect(() => {
    let interval = null;
    if (isSessionActive && connectionState === 'connected') {
      startTimeRef.current = Date.now();
      interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(seconds);
      }, 1000);
    } else {
      // eslint-disable-next-line
      setElapsed(0);
      startTimeRef.current = null;
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSessionActive, connectionState]);

  const isConnected = connectionState === 'connected';
  const isError = connectionState === 'error';
  const isConnecting = connectionState === 'connecting';
  const isDisconnected = connectionState === 'disconnected';

  // Latency display: color coded based on response time
  let latencyDisplay = '';
  let latencyClass = '';
  if (latencyMs != null && latencyMs > 0) {
    if (latencyMs <= 600) {
      latencyDisplay = `~${latencyMs}ms`;
      latencyClass = 'latency--good'; // Green
    } else if (latencyMs <= 1500) {
      latencyDisplay = `~${latencyMs}ms`;
      latencyClass = 'latency--ok'; // Yellow
    } else {
      latencyDisplay = `~${(latencyMs / 1000).toFixed(1)}s`;
      latencyClass = 'latency--slow'; // Red
    }
  }

  return (
    <div className="status-bar" id="status-bar">
      <div className="status-bar__left">
        {isConnecting || (isDisconnected && isSessionActive) ? (
          <>
            <span className="status-bar__spinner" />
            <span>Reconnecting...</span>
          </>
        ) : (
          <>
            <span
              className={`status-bar__dot ${
                isConnected ? 'connected' : isError ? 'error' : ''
              }`}
            />
            <span>
              {isConnected
                ? 'Connected to Nova'
                : isError
                  ? 'Connection error'
                  : 'Disconnected'}
            </span>
          </>
        )}
        {/* Latency badge */}
        {isConnected && latencyDisplay && (
          <span className={`status-bar__latency ${latencyClass}`}>
            {latencyDisplay}
          </span>
        )}
      </div>

      <div className="status-bar__right">
        {isConnected && (
          <span className="status-bar__badge status-bar__badge--gemini">
            ✨ Powered by Gemini 2.0
          </span>
        )}
        {isConnected && (
          <span className="status-bar__badge">
            <span>🔒</span>
            <span>Encrypted</span>
          </span>
        )}
        {isSessionActive && (
          <span className="status-bar__timer">{formatTime(elapsed)}</span>
        )}
      </div>
    </div>
  );
}
