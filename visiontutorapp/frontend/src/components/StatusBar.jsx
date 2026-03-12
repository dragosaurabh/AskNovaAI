/**
 * StatusBar — Connection status and session timer.
 */

import { useState, useEffect, useRef } from 'react';
import { formatTime } from '../utils/helpers';

export default function StatusBar({ connectionState, isSessionActive }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  // Session timer
  useEffect(() => {
    if (isSessionActive) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSessionActive]);

  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Connection error',
  };

  const dotClass =
    connectionState === 'connected'
      ? 'connected'
      : connectionState === 'error'
        ? 'error'
        : '';

  return (
    <div className="status-bar" id="status-bar">
      <div className="status-bar__left">
        <span className={`status-bar__dot ${dotClass}`} />
        <span>{statusText[connectionState] || 'Unknown'}</span>
      </div>
      {isSessionActive && (
        <span className="status-bar__timer">{formatTime(elapsed)}</span>
      )}
    </div>
  );
}
