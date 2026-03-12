/**
 * CameraPreview — Renders the student's webcam feed with overlay indicators.
 */
import { forwardRef } from 'react';

const CameraPreview = forwardRef(function CameraPreview({ isActive }, ref) {
  return (
    <div className="camera-container" id="camera-container">
      {isActive ? (
        <>
          <video
            ref={ref}
            autoPlay
            playsInline
            muted
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="camera-overlay">
            <span className="camera-live-dot" />
            <span>LIVE</span>
          </div>
        </>
      ) : (
        <div className="camera-placeholder">
          <span className="camera-placeholder-icon">📷</span>
          <p className="camera-placeholder-text">
            Point your camera at homework, a textbook page, diagram, or equation — Nova will see it and help you understand.
          </p>
        </div>
      )}
    </div>
  );
});

export default CameraPreview;
