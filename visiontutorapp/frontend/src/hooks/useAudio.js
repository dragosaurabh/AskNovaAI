/**
 * useAudio — Captures microphone audio as PCM 16-bit 16kHz and plays back
 * audio response chunks from Nova using Web Audio API.
 *
 * Latency optimisations:
 * - Sends raw PCM ArrayBuffer (no base64 encoding)
 * - Accepts raw ArrayBuffer for playback (no base64 decoding)
 * - 100ms capture chunks for fast streaming to Gemini
 * - Web Audio API playback with precise scheduling (no HTML audio elements)
 * - 24kHz output sample rate matching Gemini's output
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
  const [inputAnalyser, setInputAnalyser] = useState(null);
  const playbackContextRef = useRef(null);
  const [outputAnalyser, setOutputAnalyser] = useState(null);
  const nextPlayTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const activeSourcesRef = useRef(new Set());

  /**
   * Start capturing microphone audio.
   * Sends raw PCM Int16 ArrayBuffer via onAudioChunk.
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

      // Create AudioContext for capture at 16kHz
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Create AnalyserNode for real microphone waveform visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // Small size for fast, responsive drawing
      analyser.smoothingTimeConstant = 0.8;
      setInputAnalyser(analyser);

      // Connect source to analyser for visualizer
      source.connect(analyser);

      // Buffer size: power of 2 closest to 100ms at 16kHz
      const bufferSize = Math.pow(
        2,
        Math.ceil(Math.log2(INPUT_SAMPLE_RATE * CHUNK_DURATION_MS / 1000))
      );
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Calculate volume for frontend VAD
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += Math.abs(inputData[i]);
        }
        const volume = sum / inputData.length;

        // Convert Float32 → PCM 16-bit and send as raw ArrayBuffer
        const pcm16 = float32ToPCM16(inputData);
        onAudioChunk?.(pcm16.buffer, volume);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
      if (err.name === 'NotAllowedError') {
        setMicError('Please allow microphone access to talk to Nova');
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
    setInputAnalyser(null);
    setIsRecording(false);
  }, []);

  /**
   * Play a raw PCM audio chunk from Nova (ArrayBuffer).
   * Chunks are scheduled sequentially using Web Audio API for gapless playback.
   */
  const playAudioChunk = useCallback((arrayBuffer) => {
    // Initialize playback context if needed (24kHz to match Gemini output)
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      nextPlayTimeRef.current = 0;

      // Create shared AnalyserNode for Nova's voice visualization
      const analyser = playbackContextRef.current.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      setOutputAnalyser(analyser);
      analyser.connect(playbackContextRef.current.destination);
    }

    const ctx = playbackContextRef.current;

    // Convert raw PCM bytes to Float32 for Web Audio
    const int16 = new Int16Array(arrayBuffer);
    const float32 = pcm16ToFloat32(int16);

    // Create audio buffer and fill with sample data
    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    // Schedule playback with precise timing (no gaps)
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    // Connect to analyser instead of directly to destination
    if (outputAnalyser) {
      sourceNode.connect(outputAnalyser);
    } else {
      sourceNode.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    sourceNode.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Track active sources for interruption support
    activeSourcesRef.current.add(sourceNode);

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsPlaying(true);
    }

    sourceNode.onended = () => {
      activeSourcesRef.current.delete(sourceNode);
      // Check if this was the last scheduled buffer
      if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    };
  }, [outputAnalyser]);

  /**
   * Immediately stop all audio playback (for barge-in / interruption).
   * Stops all currently scheduled audio sources.
   */
  const stopPlayback = useCallback(() => {
    // Stop all active source nodes immediately
    for (const source of activeSourcesRef.current) {
      try {
        source.stop(0);
      } catch {
        // Already stopped
      }
    }
    activeSourcesRef.current.clear();

    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    setOutputAnalyser(null);
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
    inputAnalyser,
    outputAnalyser,
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
