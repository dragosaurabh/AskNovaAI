/**
 * SourceSelector — Beautiful card-based input source picker.
 * Shows 3 options: Camera, Screen Share, Voice Only.
 */

const SOURCES = [
  {
    id: 'camera',
    icon: '📷',
    title: 'Camera',
    description: 'Point camera at homework, textbook, or equations',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
  },
  {
    id: 'screen',
    icon: '🖥️',
    title: 'Share Screen',
    description: 'Share your screen for coding help or digital content',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
  },
  {
    id: 'voice',
    icon: '💬',
    title: 'Voice Only',
    description: 'Just talk — no camera needed',
    gradient: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
  },
];

export default function SourceSelector({ onSelect, disabled }) {
  return (
    <div className="source-selector" id="source-selector">
      {SOURCES.map((source) => (
        <button
          key={source.id}
          className="source-card"
          onClick={() => onSelect(source.id)}
          disabled={disabled}
          aria-label={`Start session with ${source.title}`}
        >
          <div
            className="source-card__icon-wrap"
            style={{ background: source.gradient }}
          >
            <span className="source-card__icon">{source.icon}</span>
          </div>
          <span className="source-card__title">{source.title}</span>
          <span className="source-card__desc">{source.description}</span>
        </button>
      ))}
    </div>
  );
}
