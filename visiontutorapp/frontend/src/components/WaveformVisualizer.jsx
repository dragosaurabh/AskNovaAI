/**
 * WaveformVisualizer — Animated bars in the control bar.
 * Supports 5 modes: idle, user (green), nova (purple), thinking (pulse), interrupted (red flash).
 */

const BAR_COUNT = 16;

export default function WaveformVisualizer({ mode }) {
  // mode: 'idle' | 'user' | 'nova' | 'thinking' | 'interrupted'
  const modeClass = `waveform--${mode || 'idle'}`;

  return (
    <div className={`waveform ${modeClass}`} aria-label="Audio visualizer">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} className="waveform__bar" />
      ))}
      {mode === 'interrupted' && (
        <span className="waveform__flash">Interrupted</span>
      )}
    </div>
  );
}
