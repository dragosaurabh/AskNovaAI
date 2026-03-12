/**
 * NovaAvatar — Friendly robot avatar with speaking animation rings.
 */

export default function NovaAvatar({ isSpeaking, isConnected }) {
  return (
    <div className={`nova-avatar-container ${isSpeaking ? 'speaking' : ''}`}>
      <div className={`nova-avatar ${isSpeaking ? 'speaking' : ''}`}>
        {isSpeaking && (
          <>
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
          </>
        )}
        <span role="img" aria-label="Nova AI tutor">🤖</span>
      </div>
      <span className="nova-name">Nova</span>
      <span className="nova-status">
        <span
          className={`nova-status-dot ${
            isSpeaking ? 'speaking' : isConnected ? 'connected' : ''
          }`}
        />
        {isSpeaking ? 'Speaking...' : isConnected ? 'Ready to help' : 'Offline'}
      </span>
    </div>
  );
}
