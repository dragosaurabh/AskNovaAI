/**
 * useMedia — Unified media capture hook supporting camera, screen share, and voice-only modes.
 *
 * Latency optimisations:
 * - Frame interval reduced to 2 seconds (from 1s)
 * - JPEG quality at 60% (was 70%)
 * - Pixel-diff comparison: skip sending if < 10% of pixels changed
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { canvasToBase64 } from '../utils/helpers';

const FRAME_INTERVAL_MS = 2000; // 1 frame every 2 seconds
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;
const JPEG_QUALITY = 0.6;
const DIFF_THRESHOLD = 0.10; // 10% pixel change required to send

export default function useMedia({ onFrame }) {
  const [isActive, setIsActive] = useState(false);
  const [inputSource, setInputSource] = useState(null); // 'camera' | 'screen' | 'voice' | null
  const [sourceLabel, setSourceLabel] = useState('');
  const [mediaError, setMediaError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const videoStreamRef = useRef(null);
  const intervalRef = useRef(null);
  const prevFrameDataRef = useRef(null);

  /**
   * Compare current frame with previous and return true if significantly different.
   */
  const hasFrameChanged = useCallback((ctx) => {
    const current = ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const prev = prevFrameDataRef.current;

    if (!prev) {
      prevFrameDataRef.current = current.data.slice();
      return true; // Always send the first frame
    }

    // Compare pixel data (sample every 16th pixel for speed)
    let diffCount = 0;
    const totalSampled = Math.floor(current.data.length / (4 * 16));
    for (let i = 0; i < current.data.length; i += 4 * 16) {
      const rDiff = Math.abs(current.data[i] - prev[i]);
      const gDiff = Math.abs(current.data[i + 1] - prev[i + 1]);
      const bDiff = Math.abs(current.data[i + 2] - prev[i + 2]);
      if (rDiff + gDiff + bDiff > 60) {
        diffCount++;
      }
    }

    const diffRatio = diffCount / totalSampled;
    if (diffRatio > DIFF_THRESHOLD) {
      prevFrameDataRef.current = current.data.slice();
      return true;
    }
    return false;
  }, []);

  /**
   * Capture a single frame from the video feed.
   * Only sends if the frame has meaningfully changed.
   */
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    // Only send if frame changed significantly
    if (hasFrameChanged(ctx)) {
      const base64 = canvasToBase64(canvas, JPEG_QUALITY);
      onFrame?.(base64);
    }
  }, [onFrame, hasFrameChanged]);

  /**
   * Start frame capture interval.
   */
  const startFrameCapture = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    canvasRef.current.width = FRAME_WIDTH;
    canvasRef.current.height = FRAME_HEIGHT;
    prevFrameDataRef.current = null; // Reset diff comparison

    intervalRef.current = setInterval(() => {
      captureFrame();
    }, FRAME_INTERVAL_MS);
  }, [captureFrame]);

  /**
   * Attach a MediaStream to the video element and start frame capture.
   */
  const attachStream = useCallback(async (stream) => {
    videoStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (e) {
        console.warn('Video autoplay blocked:', e);
      }
    }

    startFrameCapture();
    setIsActive(true);
  }, [startFrameCapture]);

  /**
   * Start camera (webcam) mode.
   */
  const startCamera = useCallback(async () => {
    try {
      setMediaError(null);
      setInputSource('camera');
      setSourceLabel('📷 Camera Active');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: FRAME_WIDTH },
          height: { ideal: FRAME_HEIGHT },
          facingMode: 'environment',
        },
      });

      await attachStream(stream);
    } catch (err) {
      console.error('Camera access failed:', err);
      setInputSource(null);
      if (err.name === 'NotAllowedError') {
        setMediaError(
          'Camera permission denied. Please allow camera access in your browser settings:\n' +
          '1. Click the lock/camera icon in the address bar\n' +
          '2. Allow camera access\n' +
          '3. Refresh and try again'
        );
      } else if (err.name === 'NotFoundError') {
        setMediaError('No camera found. Please connect a camera and try again.');
      } else {
        setMediaError(`Camera error: ${err.message}`);
      }
    }
  }, [attachStream]);

  /**
   * Start screen sharing mode.
   */
  const startScreen = useCallback(async () => {
    try {
      setMediaError(null);
      setInputSource('screen');
      setSourceLabel('🖥️ Screen Share Active');

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // Listen for when user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopMedia();
      });

      await attachStream(stream);
    } catch (err) {
      console.error('Screen share failed:', err);
      setInputSource(null);
      if (err.name === 'NotAllowedError') {
        setMediaError('Screen sharing was cancelled or denied. Please try again.');
      } else {
        setMediaError(`Screen share error: ${err.message}`);
      }
    }
  }, [attachStream]);

  /**
   * Start voice-only mode (no video).
   */
  const startVoiceOnly = useCallback(() => {
    setMediaError(null);
    setInputSource('voice');
    setSourceLabel('💬 Voice Only');
    setIsActive(true);
  }, []);

  /**
   * Stop all media streams and frame capture.
   */
  const stopMedia = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    prevFrameDataRef.current = null;
    setIsActive(false);
    setInputSource(null);
    setSourceLabel('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    videoRef,
    isActive,
    inputSource,
    sourceLabel,
    mediaError,
    startCamera,
    startScreen,
    startVoiceOnly,
    stopMedia,
  };
}
