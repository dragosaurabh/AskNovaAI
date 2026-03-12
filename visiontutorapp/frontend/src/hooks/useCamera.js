/**
 * useCamera — Captures webcam video frames for AI vision.
 *
 * Features:
 * - getUserMedia for webcam access
 * - Captures 1 frame per second as JPEG base64
 * - Error handling for permission denial
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { canvasToBase64 } from '../utils/helpers';

const FRAME_INTERVAL_MS = 1000; // 1 frame per second
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;

export default function useCamera({ onFrame }) {
  const [isActive, setIsActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  /**
   * Start the webcam and begin capturing frames.
   */
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: FRAME_WIDTH },
          height: { ideal: FRAME_HEIGHT },
          facingMode: 'environment', // Prefer rear camera on mobile
        },
      });
      streamRef.current = stream;

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Create offscreen canvas for frame capture
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      canvasRef.current.width = FRAME_WIDTH;
      canvasRef.current.height = FRAME_HEIGHT;

      // Start capturing frames at 1fps
      intervalRef.current = setInterval(() => {
        captureFrame();
      }, FRAME_INTERVAL_MS);

      setIsActive(true);
    } catch (err) {
      console.error('Camera access failed:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a camera.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  /**
   * Capture a single frame from the video feed.
   */
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const base64 = canvasToBase64(canvas, 0.7);
    onFrame?.(base64);
  }, [onFrame]);

  /**
   * Stop the webcam and frame capture.
   */
  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    videoRef,
    isActive,
    cameraError,
    startCamera,
    stopCamera,
  };
}
