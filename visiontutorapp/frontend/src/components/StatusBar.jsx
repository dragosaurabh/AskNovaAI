/**
 * StatusBar — Connection status, session timer, latency badge, and trust badges.
 */

import { useState, useEffect, useRef } from 'react';
import { formatTime } from '../utils/helpers';

export default function StatusBar({ connectionState, isSessionActive, latencyMs }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const prevSessionActive = useRef(false);

  // Session timer
  useEffect(() => {
    if (isSessionActive && !prevSessionActive.current) {
      // Session just started
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (!isSessionActive && prevSessionActive.current) {
      // Session just ended
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    prevSessionActive.current = isSessionActive;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSessionActive]);

  const isConnected = connectionState === 'connected';
  const isError = connectionState === 'error';
  const isConnecting = connectionState === 'connecting';
  const isDisconnected = connectionState === 'disconnected';

  // Latency color
  const latencyClass = latencyMs != null
    ? latencyMs < 500 ? 'latency--good'
      : latencyMs < 1000 ? 'latency--ok'
        : 'latency--slow'
    : '';

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
        {isConnected && latencyMs != null && (
          <span className={`status-bar__latency ${latencyClass}`}>
            ~{latencyMs}ms
          </span>
        )}
      </div>

      <div className="status-bar__right">
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
