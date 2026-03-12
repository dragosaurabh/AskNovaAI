/**
 * WaveformVisualizer — Animated bars when Nova is speaking.
 */

const BAR_COUNT = 12;

export default function WaveformVisualizer({ isActive }) {
  return (
    <div className={`waveform ${isActive ? 'waveform--speaking' : 'waveform--idle'}`}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} className="waveform__bar" />
      ))}
    </div>
  );
}
