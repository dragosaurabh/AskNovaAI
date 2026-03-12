/**
 * MicIndicator — Shows microphone status with pulse animation.
 */

export default function MicIndicator({ isActive }) {
  return (
    <div className={`mic-indicator ${isActive ? 'mic-indicator--active' : 'mic-indicator--idle'}`}>
      <span className="mic-indicator__icon">{isActive ? '🎤' : '🎤'}</span>
      {isActive && <span className="mic-indicator__pulse" />}
      <span>{isActive ? 'Listening' : 'Mic off'}</span>
    </div>
  );
}
