/**
 * WelcomeScreen — Stunning landing screen shown before session starts.
 * Features animated gradient, floating particles, Nova avatar, and source selector.
 */

import { useState, useEffect } from 'react';
import SourceSelector from './SourceSelector';

const VOICES = [
    { id: "Charon", label: "Nova Classic", desc: "Warm & natural" },
    { id: "Aoede", label: "Nova Bright", desc: "Clear & energetic" },
    { id: "Fenrir", label: "Nova Deep", desc: "Calm & measured" },
    { id: "Kore", label: "Nova Soft", desc: "Gentle & patient" },
];

export default function WelcomeScreen({ onSelectSource, disabled }) {
  const [selectedVoice, setSelectedVoice] = useState('Charon');

  useEffect(() => {
    const saved = localStorage.getItem('asknova_voice');
    if (saved && VOICES.find(v => v.id === saved)) {
      setSelectedVoice(saved);
    }
  }, []);

  const handleVoiceChange = (id) => {
    setSelectedVoice(id);
    localStorage.setItem('asknova_voice', id);
  };

  const handleSourceSelect = (source) => {
    onSelectSource(source, selectedVoice);
  };

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
        <SourceSelector onSelect={handleSourceSelect} disabled={disabled} />

        {/* Voice Selector */}
        <div className="voice-selector">
          <p className="voice-selector__title">Choose Nova's Voice:</p>
          <div className="voice-selector__pills">
            {VOICES.map((v) => (
              <button
                key={v.id}
                className={`voice-pill ${selectedVoice === v.id ? 'active' : ''}`}
                onClick={() => handleVoiceChange(v.id)}
                disabled={disabled}
              >
                <div className="voice-pill__label">{v.label}</div>
                <div className="voice-pill__desc">{v.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="welcome-hint">
          <span>⌨️</span>
          <span>Space: mute · Esc: end session</span>
        </div>
      </div>
    </div>
  );
}
