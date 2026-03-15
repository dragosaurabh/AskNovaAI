/**
 * NovaAvatar — Animated robot avatar with speaking/listening/thinking states
 * and mini waveform visualizer.
 */

import { useEffect, useRef } from 'react';

export default function NovaAvatar({ isSpeaking, isConnected, isListening, isThinking, outputAnalyser }) {
  const status = isThinking
    ? 'Thinking...'
    : isSpeaking
      ? 'Speaking...'
      : isListening
        ? 'Listening...'
        : isConnected
          ? 'Ready to help'
          : 'Offline';

  const dotClass = isThinking
    ? 'thinking'
    : isSpeaking
      ? 'speaking'
      : isListening
        ? 'listening'
        : isConnected
          ? 'connected'
          : '';

  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // Render real audio data for the mini waveform
  useEffect(() => {
    if (!isSpeaking || !outputAnalyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dataArray = new Uint8Array(outputAnalyser.frequencyBinCount);
    
    const draw = () => {
      ctx.clearRect(0, 0, 38, 12); // 8 bars * 3px + 7 gaps * 2px = 38px
      outputAnalyser.getByteFrequencyData(dataArray);
      
      for (let i = 0; i < 8; i++) {
        const dataIndex = Math.floor((i / 8) * (dataArray.length * 0.5));
        const value = dataArray[dataIndex] || 0;
        const normalized = value / 255;
        
        // Exaggerate slightly for better visual effect on small scale
        let barHeight = 2 + Math.pow(normalized, 1.2) * 10;
        barHeight = Math.max(2, Math.min(12, barHeight));
        
        ctx.fillStyle = '#8B5CF6'; // var(--nova-primary)
        ctx.beginPath();
        // x, y, width, height, radii
        ctx.roundRect(i * 5, 12 - barHeight, 3, barHeight, 1.5);
        ctx.fill();
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSpeaking, outputAnalyser]);

  return (
    <div className={`nova-avatar-container ${isSpeaking ? 'speaking' : ''} ${isListening ? 'listening' : ''} ${isThinking ? 'thinking' : ''}`}>
      <div className={`nova-avatar ${isSpeaking ? 'speaking' : ''} ${isThinking ? 'thinking' : ''}`}>
        {isSpeaking && (
          <>
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
            <span className="nova-avatar__rings" />
          </>
        )}
        {isThinking && (
          <span className="nova-avatar__think-ring" />
        )}
        <span className={`nova-avatar__emoji ${isSpeaking ? 'bouncing' : ''} ${isThinking ? 'spinning' : ''}`} role="img" aria-label="Nova AI tutor">
          {isThinking ? '🧠' : '🤖'}
        </span>
      </div>
      <span className="nova-name">Nova</span>
      <span className="nova-status">
        <span className={`nova-status-dot ${dotClass}`} />
        {status}
      </span>

      {/* Mini waveform when speaking */}
      {isSpeaking && (
        <div className="nova-mini-waveform">
          <canvas 
            ref={canvasRef} 
            width={38} 
            height={12} 
            style={{ display: 'block' }}
          />
        </div>
      )}

      {/* Thinking dots */}
      {isThinking && (
        <div className="nova-thinking-dots">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      )}
    </div>
  );
}
