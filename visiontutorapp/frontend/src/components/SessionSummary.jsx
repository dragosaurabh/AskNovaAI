/**
 * SessionSummary — Beautiful modal overlay shown when a session ends.
 * Displays session stats and allows starting a new session or downloading transcript.
 */

import { formatTime } from '../utils/helpers';

export default function SessionSummary({
  isOpen,
  sessionDuration,
  exchangeCount,
  subject,
  messages,
  onNewSession,
  onClose,
}) {
  if (!isOpen) return null;

  // Generate a simple summary line
  const summaryLine = exchangeCount > 0
    ? `You had ${exchangeCount} exchange${exchangeCount !== 1 ? 's' : ''} with Nova about ${subject}`
    : `Quick session on ${subject} — start a new one to dive deeper!`;

  const handleDownload = () => {
    const lines = messages.map((msg) => {
      const role = msg.role === 'user' ? 'You' : 'Nova';
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      return `[${time}] ${role}: ${msg.text}`;
    });

    const content = [
      `AskNovaAI — Session Transcript`,
      `Subject: ${subject}`,
      `Duration: ${formatTime(sessionDuration)}`,
      `Exchanges: ${exchangeCount}`,
      `---`,
      ...lines,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asknovaai-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="session-summary-overlay" onClick={onClose}>
      <div className="session-summary-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="session-summary__icon">🎓</div>
        <h2 className="session-summary__title">Session Complete</h2>
        <p className="session-summary__subtitle">{summaryLine}</p>

        {/* Stats */}
        <div className="session-summary__stats">
          <div className="session-summary__stat">
            <span className="session-summary__stat-value">{formatTime(sessionDuration)}</span>
            <span className="session-summary__stat-label">Duration</span>
          </div>
          <div className="session-summary__stat">
            <span className="session-summary__stat-value">{exchangeCount}</span>
            <span className="session-summary__stat-label">Exchanges</span>
          </div>
          <div className="session-summary__stat">
            <span className="session-summary__stat-value">{subject}</span>
            <span className="session-summary__stat-label">Subject</span>
          </div>
        </div>

        {/* Actions */}
        <div className="session-summary__actions">
          <button className="session-summary__btn session-summary__btn--primary" onClick={onNewSession}>
            ✨ Start New Session
          </button>
          <button className="session-summary__btn session-summary__btn--secondary" onClick={handleDownload}>
            📥 Download Transcript
          </button>
        </div>
      </div>
    </div>
  );
}
