/**
 * VisionTutor — Utility Functions
 * Shared helpers used across the frontend.
 */

/**
 * Format seconds into MM:SS display string.
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Convert a canvas frame to base64 JPEG string.
 */
export function canvasToBase64(canvas, quality = 0.7) {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
