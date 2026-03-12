/**
 * TalkButton — Primary button to start/stop tutoring sessions.
 * Shows different states: idle, connecting, active.
 */

export default function TalkButton({ state, onClick }) {
  const config = {
    idle: {
      className: 'talk-button talk-button--idle',
      icon: '🎙️',
      label: 'Talk to Nova',
    },
    connecting: {
      className: 'talk-button talk-button--connecting',
      icon: null,
      label: 'Connecting...',
    },
    active: {
      className: 'talk-button talk-button--active',
      icon: '⏹️',
      label: 'End Session',
    },
  };

  const current = config[state] || config.idle;

  return (
    <button
      id="talk-button"
      className={current.className}
      onClick={onClick}
      disabled={state === 'connecting'}
      aria-label={current.label}
    >
      {state === 'connecting' ? (
        <span className="talk-button__spinner" />
      ) : (
        <span className="talk-button__icon">{current.icon}</span>
      )}
      <span>{current.label}</span>
    </button>
  );
}
