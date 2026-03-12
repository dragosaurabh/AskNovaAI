/**
 * WelcomeScreen — Stunning landing screen shown before session starts.
 * Features animated gradient, floating particles, Nova avatar, and source selector.
 */

import SourceSelector from './SourceSelector';

export default function WelcomeScreen({ onSelectSource, disabled }) {
  return (
    <div className="welcome-screen" id="welcome-screen">
      {/* Floating particles */}
      <div className="welcome-particles" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className="welcome-particle" />
        ))}
      </div>

      {/* Content */}
      <div className="welcome-content">
        {/* Nova Avatar */}
        <div className="welcome-avatar">
          <div className="welcome-avatar__glow" />
          <div className="welcome-avatar__circle">
            <span role="img" aria-label="Nova AI tutor">🤖</span>
          </div>
        </div>

        {/* Headline */}
        <h1 className="welcome-title">Meet Nova</h1>
        <p className="welcome-subtitle">
          Your AI tutor that sees, hears, and teaches in real time
        </p>

        {/* Source selector */}
        <SourceSelector onSelect={onSelectSource} disabled={disabled} />

        {/* Keyboard shortcuts hint */}
        <div className="welcome-hint">
          <span>⌨️</span>
          <span>Space: mute · Esc: end session</span>
        </div>
      </div>
    </div>
  );
}
