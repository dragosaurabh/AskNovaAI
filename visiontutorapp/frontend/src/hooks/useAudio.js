/**
 * useAudio — Captures microphone audio as PCM 16-bit 16kHz and plays back
 * audio response chunks from Nova.
 *
 * Features:
 * - Mic capture via Web Audio API → PCM 16-bit 16kHz chunks
 * - Audio playback queue for smooth Nova responses
 * - Barge-in support (stops playback when user speaks)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Audio configuration
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const CHUNK_DURATION_MS = 100; // Send audio every 100ms

export default function useAudio({ onAudioChunk }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micError, setMicError] = useState(null);

  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const playbackContextRef = useRef(null);
  const playbackQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  /**
   * Start capturing microphone audio.
   */
  const startRecording = useCallback(async () => {
    try {
      setMicError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Create AudioContext for capture
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for PCM capture
      // (AudioWorklet is preferred but ScriptProcessor works cross-browser)
      const bufferSize = Math.round(INPUT_SAMPLE_RATE * CHUNK_DURATION_MS / 1000);
      const processor = audioContext.createScriptProcessor(
        // Buffer size must be power of 2
        Math.pow(2, Math.ceil(Math.log2(bufferSize))),
        1, // input channels
        1  // output channels
      );
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        // Convert Float32 samples to PCM 16-bit
        const pcm16 = float32ToPCM16(inputData);
        // Convert to base64 and send
        const base64 = arrayBufferToBase64(pcm16.buffer);
        onAudioChunk?.(base64);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
      if (err.name === 'NotAllowedError') {
        setMicError('Microphone permission denied. Please allow access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found. Please connect a microphone.');
      } else {
        setMicError(`Microphone error: ${err.message}`);
      }
    }
  }, [onAudioChunk]);

  /**
   * Stop capturing microphone audio.
   */
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  /**
   * Play a base64-encoded PCM audio chunk from Nova.
   * Chunks are queued and played sequentially for smooth output.
   */
  const playAudioChunk = useCallback((base64Data) => {
    // Initialize playback context if needed
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      nextPlayTimeRef.current = 0;
    }

    const ctx = playbackContextRef.current;
    const pcmBytes = base64ToArrayBuffer(base64Data);
    const float32 = pcm16ToFloat32(new Int16Array(pcmBytes));

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    // Schedule playback
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsPlaying(true);
    }

    source.onended = () => {
      // Check if this was the last scheduled buffer
      if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    };
  }, []);

  /**
   * Stop all audio playback (for barge-in).
   */
  const stopPlayback = useCallback(() => {
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      stopPlayback();
    };
  }, [stopRecording, stopPlayback]);

  return {
    isRecording,
    isPlaying,
    micError,
    startRecording,
    stopRecording,
    playAudioChunk,
    stopPlayback,
  };
}

/* ── Audio Conversion Utilities ── */

/**
 * Convert Float32Array samples (-1.0 to 1.0) to Int16Array PCM (16-bit).
 */
function float32ToPCM16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

/**
 * Convert Int16Array PCM (16-bit) to Float32Array samples.
 */
function pcm16ToFloat32(int16Array) {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32Array;
}

/**
 * Convert an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
