/**
 * CameraPreview — Renders the webcam/screen feed with overlay indicators.
 * Supports camera, screen share, and voice-only modes.
 */
import { forwardRef } from 'react';

const CameraPreview = forwardRef(function CameraPreview(
  { isActive, inputSource, sourceLabel, mediaError },
  ref
) {
  const hasVideo = isActive && (inputSource === 'camera' || inputSource === 'screen');
  const isVoiceOnly = isActive && inputSource === 'voice';

  return (
    <div className="camera-container" id="camera-container">
      {hasVideo ? (
        <>
          <video
            ref={ref}
            autoPlay
            playsInline
            muted
            style={{
              transform: inputSource === 'camera' ? 'scaleX(-1)' : 'none',
            }}
          />
          {/* LIVE badge */}
          <div className="camera-overlay camera-overlay--top">
            <span className="camera-live-dot" />
            <span>LIVE</span>
          </div>
          {/* Source label */}
          <div className="camera-overlay camera-overlay--bottom">
            <span>{sourceLabel}</span>
          </div>
        </>
      ) : isVoiceOnly ? (
        <div className="camera-voice-mode">
          <div className="camera-voice-mode__icon">🎧</div>
          <p className="camera-voice-mode__text">Voice-only mode active</p>
          <p className="camera-voice-mode__hint">Nova is listening...</p>
          {/* Animated waveform bars */}
          <div className="camera-voice-waveform">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="camera-voice-waveform__bar" />
            ))}
          </div>
        </div>
      ) : mediaError ? (
        <div className="camera-error">
          <span className="camera-error__icon">🚫</span>
          <p className="camera-error__text">{mediaError}</p>
        </div>
      ) : (
        <div className="camera-placeholder">
          <span className="camera-placeholder-icon">📷</span>
          <p className="camera-placeholder-text">
            Choose an input source to start your tutoring session with Nova.
          </p>
        </div>
      )}
    </div>
  );
});

export default CameraPreview;
