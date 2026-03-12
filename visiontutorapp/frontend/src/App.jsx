/**
 * AskNovaAI — Main Application Component
 *
 * Orchestrates media input, microphone, WebSocket, and UI components
 * into a unified real-time AI tutoring experience.
 *
 * Latency features:
 * - Binary WebSocket for audio (no base64)
 * - "Thinking..." state between user speech end and Nova's first audio
 * - Latency measurement displayed in status bar
 * - Instant interruption on user speech
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
import WelcomeScreen from './components/WelcomeScreen';
import SessionSummary from './components/SessionSummary';

// Hooks
import useWebSocket from './hooks/useWebSocket';
import useAudio from './hooks/useAudio';
import useMedia from './hooks/useMedia';

// Session timeout: 5 minutes of inactivity
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export default function App() {
  // ── State ──
  const [subject, setSubject] = useState('Math');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);

  // Session summary state
  const [showSummary, setShowSummary] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [exchangeCount, setExchangeCount] = useState(0);
  const sessionStartRef = useRef(null);

  // Accumulate transcript fragments into complete messages
  const inputBufferRef = useRef('');
  const outputBufferRef = useRef('');
  const timeoutRef = useRef(null);

  // Refs to avoid circular dependencies
  const handleEndSessionRef = useRef(null);
  const resetSessionTimeoutRef = useRef(null);

  // ── Hooks ──
  const {
    connectionState, latencyMs, connect, disconnect, send, sendBinary,
    setHandlers, markSpeechEnd,
  } = useWebSocket();

  // Audio chunk callback: send raw PCM binary
  const onAudioChunk = useCallback(
    (arrayBuffer) => {
      if (!isMuted) {
        sendBinary(arrayBuffer);
      }
    },
    [sendBinary, isMuted]
  );

  const {
    isRecording, isPlaying, micError,
    startRecording, stopRecording, playAudioChunk, stopPlayback,
  } = useAudio({ onAudioChunk });

  const onFrame = useCallback(
    (base64) => {
      send({ type: 'image', data: base64 });
    },
    [send]
  );

  const {
    videoRef, isActive: mediaActive, inputSource, sourceLabel, mediaError,
    startCamera, startScreen, startVoiceOnly, stopMedia,
  } = useMedia({ onFrame });

  // ── End session ──
  const handleEndSession = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const duration = sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0;
    setSessionDuration(duration);

    stopRecording();
    stopMedia();
    stopPlayback();
    disconnect();
    setIsSessionActive(false);
    setIsSpeaking(false);
    setIsThinking(false);
    setIsTyping(false);
    setIsMuted(false);

    if (exchangeCount > 0 || duration > 5) {
      setShowSummary(true);
    }
  }, [disconnect, stopRecording, stopMedia, stopPlayback, exchangeCount]);

  useEffect(() => { handleEndSessionRef.current = handleEndSession; });

  // ── Session timeout ──
  const resetSessionTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      handleEndSessionRef.current?.();
      setError('Session timed out after 5 minutes of inactivity.');
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => { resetSessionTimeoutRef.current = resetSessionTimeout; });

  // ── WebSocket message handlers ──
  useEffect(() => {
    setHandlers({
      onConnected: () => {
        setError(null);
        resetSessionTimeoutRef.current?.();
      },
      onAudio: (arrayBuffer) => {
        playAudioChunk(arrayBuffer);
        setIsSpeaking(true);
        setIsThinking(false); // Nova started responding
        setIsTyping(false);
        resetSessionTimeoutRef.current?.();
      },
      onInputTranscript: (text) => {
        inputBufferRef.current += text;
        // User spoke — mark speech end for latency tracking
        markSpeechEnd();
        setIsThinking(true); // User finished speaking, waiting for Nova
        resetSessionTimeoutRef.current?.();
      },
      onOutputTranscript: (text) => {
        outputBufferRef.current += text;
        setIsTyping(true);
        resetSessionTimeoutRef.current?.();
      },
      onTurnComplete: () => {
        setIsSpeaking(false);
        setIsThinking(false);
        setIsTyping(false);
        // Flush output buffer as a Nova message
        if (outputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'nova', text: outputBufferRef.current.trim(), timestamp: Date.now() },
          ]);
          outputBufferRef.current = '';
          setExchangeCount((prev) => prev + 1);
        }
        // Flush input buffer as a user message
        if (inputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', text: inputBufferRef.current.trim(), timestamp: Date.now() },
          ]);
          inputBufferRef.current = '';
        }
      },
      onInterrupted: () => {
        setIsSpeaking(false);
        setIsThinking(false);
        setIsTyping(false);
        stopPlayback(); // Immediately stop Nova's audio
        // Flash "Interrupted" briefly
        setWasInterrupted(true);
        setTimeout(() => setWasInterrupted(false), 1500);
        // Flush any pending output
        if (outputBufferRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: 'nova', text: outputBufferRef.current.trim() + ' [interrupted]', timestamp: Date.now() },
          ]);
          outputBufferRef.current = '';
        }
      },
      onError: (msg) => {
        setError(msg);
      },
    });
  }, [setHandlers, playAudioChunk, stopPlayback, markSpeechEnd]);

  // ── Start session ──
  const handleStartSession = useCallback(
    async (source) => {
      setError(null);
      setMessages([]);
      setShowSummary(false);
      inputBufferRef.current = '';
      outputBufferRef.current = '';
      setExchangeCount(0);
      sessionStartRef.current = Date.now();

      if (source === 'camera') {
        await startCamera();
      } else if (source === 'screen') {
        await startScreen();
      } else {
        startVoiceOnly();
      }

      await startRecording();
      connect(subject);
      setIsSessionActive(true);
    },
    [subject, connect, startCamera, startScreen, startVoiceOnly, startRecording]
  );

  // ── Toggle mute ──
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && isSessionActive) {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'Escape' && isSessionActive) {
        e.preventDefault();
        handleEndSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, toggleMute, handleEndSession]);

  // ── Derived state ──
  const buttonState = isSessionActive
    ? connectionState === 'connecting' ? 'connecting' : 'active'
    : 'idle';

  const waveformMode = wasInterrupted
    ? 'interrupted'
    : isRecording && !isMuted
      ? 'user'
      : isSpeaking || isPlaying
        ? 'nova'
        : isThinking
          ? 'thinking'
          : 'idle';

  const displayError = error || micError || mediaError;
  const showWelcome = !isSessionActive && !showSummary;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">✨</div>
          <span className="app-logo-text">AskNovaAI</span>
          <span className="app-logo-badge">AI Tutor</span>
        </div>
        <div className="header-controls">
          <SubjectSelector value={subject} onChange={setSubject} disabled={isSessionActive} />
        </div>
      </header>

      {/* Error Banner */}
      {displayError && (
        <div className="error-banner">
          <span className="error-banner__icon">⚠️</span>
          <span>{displayError}</span>
          <button className="error-banner__dismiss" onClick={() => setError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Main Content */}
      {showWelcome ? (
        <WelcomeScreen onSelectSource={handleStartSession} disabled={connectionState === 'connecting'} />
      ) : (
        <main className="main-content">
          <div className="camera-section">
            <CameraPreview
              ref={videoRef}
              isActive={mediaActive}
              inputSource={inputSource}
              sourceLabel={sourceLabel}
              mediaError={mediaError}
            />
            <div className="controls-bar">
              <MicIndicator isActive={isRecording && !isMuted} />
              <TalkButton state={buttonState} onClick={isSessionActive ? handleEndSession : () => {}} />
              <WaveformVisualizer mode={waveformMode} />
              {isMuted && (
                <button className="mute-badge" onClick={toggleMute} aria-label="Unmute">
                  🔇 Muted — press Space to unmute
                </button>
              )}
            </div>
            <StatusBar
              connectionState={connectionState}
              isSessionActive={isSessionActive}
              latencyMs={latencyMs}
            />
          </div>

          <aside className="sidebar">
            <NovaAvatar
              isSpeaking={isSpeaking || isPlaying}
              isConnected={connectionState === 'connected'}
              isListening={isRecording && !isMuted && !isSpeaking && !isThinking}
              isThinking={isThinking}
            />
            <Transcript messages={messages} isTyping={isTyping} />
          </aside>
        </main>
      )}

      {/* Session Summary Modal */}
      <SessionSummary
        isOpen={showSummary}
        sessionDuration={sessionDuration}
        exchangeCount={exchangeCount}
        subject={subject}
        messages={messages}
        onNewSession={() => { setShowSummary(false); setMessages([]); }}
        onClose={() => setShowSummary(false)}
      />

      {/* Keyboard shortcuts hint */}
      {isSessionActive && (
        <div className="keyboard-hint" aria-label="Keyboard shortcuts">
          <span>⌨️ Space: mute/unmute · Esc: end session</span>
        </div>
      )}
    </div>
  );
}
