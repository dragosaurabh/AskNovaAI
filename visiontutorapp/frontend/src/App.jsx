/**
 * VisionTutor — Main Application Component
 * 
 * Orchestrates the camera, microphone, WebSocket, and UI components
 * into a unified real-time AI tutoring experience.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import './index.css';

// Components
import CameraPreview from './components/CameraPreview';
import TalkButton from './components/TalkButton';
import NovaAvatar from './components/NovaAvatar';
import WaveformVisualizer from './components/WaveformVisualizer';
import MicIndicator from './components/MicIndicator';
import Transcript from './components/Transcript';
import SubjectSelector from './components/SubjectSelector';
import StatusBar from './components/StatusBar';

// Hooks
import useWebSocket from './hooks/useWebSocket';
import useAudio from './hooks/useAudio';
import useCamera from './hooks/useCamera';

// Session timeout: 5 minutes of inactivity
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export default function App() {
  // ── State ──
  const [subject, setSubject] = useState('Math');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  // Accumulate transcript fragments into complete messages
  const inputBufferRef = useRef('');
  const outputBufferRef = useRef('');
  const timeoutRef = useRef(null);

  // ── Hooks ──
  const { connectionState, connect, disconnect, send, setHandlers } = useWebSocket();

  const onAudioChunk = useCallback(
    (base64) => {
      send({ type: 'audio', data: base64 });
    },
    [send]
  );

  const {
    isRecording,
    isPlaying,
    micError,
    startRecording,
    stopRecording,
    playAudioChunk,
    stopPlayback,
  } = useAudio({ onAudioChunk });

  const onFrame = useCallback(
    (base64) => {
      send({ type: 'image', data: base64 });
    },
    [send]
  );

  const {
    videoRef,
    isActive: cameraActive,
    cameraError,
    startCamera,
    stopCamera,
  } = useCamera({ onFrame });

  // ── WebSocket message handlers ──
  useEffect(() => {
    setHandlers({
      onConnected: () => {
        setError(null);
        resetSessionTimeout();
      },
      onAudio: (data) => {
        playAudioChunk(data);
        setIsSpeaking(true);
        resetSessionTimeout();
      },
      onInputTranscript: (text) => {
        inputBufferRef.current += text;
        resetSessionTimeout();
      },
      onOutputTranscript: (text) => {
        outputBufferRef.current += text;
        resetSessionTimeout();
      },
      onTurnComplete: () => {
        setIsSpeaking(false);
        // Flush output buffer as a Nova message
        if (outputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'nova', text: outputBufferRef.current.trim() },
          ]);
          outputBufferRef.current = '';
        }
        // Flush input buffer as a user message
        if (inputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', text: inputBufferRef.current.trim() },
          ]);
          inputBufferRef.current = '';
        }
      },
      onInterrupted: () => {
        setIsSpeaking(false);
        stopPlayback();
        // Flush any pending output
        if (outputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'nova', text: outputBufferRef.current.trim() + ' [interrupted]' },
          ]);
          outputBufferRef.current = '';
        }
      },
      onError: (msg) => {
        setError(msg);
      },
    });
  }, [setHandlers, playAudioChunk, stopPlayback]);

  // ── Session timeout auto-reconnect ──
  const resetSessionTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      handleEndSession();
      setError('Session timed out after 5 minutes of inactivity. Click "Talk to Nova" to start a new session.');
    }, SESSION_TIMEOUT_MS);
  }, []);

  // ── Start session ──
  const handleStartSession = useCallback(async () => {
    setError(null);
    setMessages([]);
    inputBufferRef.current = '';
    outputBufferRef.current = '';

    // Start camera and mic
    await startCamera();
    await startRecording();

    // Connect WebSocket
    connect(subject);
    setIsSessionActive(true);
  }, [subject, connect, startCamera, startRecording]);

  // ── End session ──
  const handleEndSession = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    stopRecording();
    stopCamera();
    stopPlayback();
    disconnect();
    setIsSessionActive(false);
    setIsSpeaking(false);
  }, [disconnect, stopRecording, stopCamera, stopPlayback]);

  // ── Toggle session ──
  const handleToggleSession = useCallback(() => {
    if (isSessionActive) {
      handleEndSession();
    } else {
      handleStartSession();
    }
  }, [isSessionActive, handleStartSession, handleEndSession]);

  // ── Determine talk button state ──
  const buttonState = isSessionActive
    ? connectionState === 'connecting'
      ? 'connecting'
      : 'active'
    : 'idle';

  // ── Display error from mic or camera ──
  const displayError = error || micError || cameraError;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">✨</div>
          <span className="app-logo-text">VisionTutor</span>
          <span className="app-logo-badge">AI Tutor</span>
        </div>
        <div className="header-controls">
          <SubjectSelector
            value={subject}
            onChange={setSubject}
            disabled={isSessionActive}
          />
        </div>
      </header>

      {/* ── Error Banner ── */}
      {displayError && (
        <div className="error-banner">
          <span className="error-banner__icon">⚠️</span>
          <span>{displayError}</span>
          <button
            className="error-banner__dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="main-content">
        {/* Left: Camera + Controls */}
        <div className="camera-section">
          <CameraPreview ref={videoRef} isActive={cameraActive} />

          <div className="controls-bar">
            <MicIndicator isActive={isRecording} />
            <TalkButton state={buttonState} onClick={handleToggleSession} />
            <WaveformVisualizer isActive={isSpeaking || isPlaying} />
          </div>

          <StatusBar
            connectionState={connectionState}
            isSessionActive={isSessionActive}
          />
        </div>

        {/* Right: Sidebar */}
        <aside className="sidebar">
          <NovaAvatar
            isSpeaking={isSpeaking || isPlaying}
            isConnected={connectionState === 'connected'}
          />
          <Transcript messages={messages} />
        </aside>
      </main>
    </div>
  );
}
