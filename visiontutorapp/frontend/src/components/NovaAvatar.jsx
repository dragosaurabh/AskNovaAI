/**
 * NovaAvatar — Animated robot avatar with speaking/listening/thinking states
 * and mini waveform visualizer.
 */

export default function NovaAvatar({ isSpeaking, isConnected, isListening, isThinking }) {
  const status = isThinking
    ? 'Thinking...'
    : isSpeaking
      ? 'Speaking...'
      : isListening
        ? 'Listening...'
        : isConnected
          ? 'Ready to help'
          : 'Offline';

  const dotClass = isThinking
    ? 'thinking'
    : isSpeaking
      ? 'speaking'
      : isListening
        ? 'listening'
        : isConnected
          ? 'connected'
          : '';

  return (
    <div className={`nova-avatar-container ${isSpeaking ? 'speaking' : ''} ${isListening ? 'listening' : ''} ${isThinking ? 'thinking' : ''}`}>
      <div className={`nova-avatar ${isSpeaking ? 'speaking' : ''} ${isThinking ? 'thinking' : ''}`}>
        {isSpeaking && (
          <>
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
          </>
        )}
        {isThinking && (
          <span className="nova-avatar__think-ring" />
        )}
        <span className={`nova-avatar__emoji ${isSpeaking ? 'bouncing' : ''} ${isThinking ? 'thinking-pulse' : ''}`} role="img" aria-label="Nova AI tutor">
          🤖
        </span>
      </div>
      <span className="nova-name">Nova</span>
      <span className="nova-status">
        <span className={`nova-status-dot ${dotClass}`} />
        {status}
      </span>

      {/* Mini waveform when speaking */}
      {isSpeaking && (
        <div className="nova-mini-waveform">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="nova-mini-waveform__bar" />
          ))}
        </div>
      )}

      {/* Thinking dots */}
      {isThinking && (
        <div className="nova-thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      )}
    </div>
  );
}
