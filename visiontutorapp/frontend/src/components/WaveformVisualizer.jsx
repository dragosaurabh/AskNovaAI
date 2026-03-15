/**
 * WaveformVisualizer — Real-time audio visualization rendering to Canvas.
 * Connects to Web Audio API AnalyserNodes for accurate voice feedback.
 */
import { useEffect, useRef } from 'react';

const BAR_COUNT = 16;
const BAR_WIDTH = 4;
const BAR_GAP = 3;
const CANVAS_WIDTH = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
const CANVAS_HEIGHT = 32;

export default function WaveformVisualizer({ mode, inputAnalyser, outputAnalyser }) {
  // mode: 'idle' | 'user' | 'nova' | 'thinking' | 'interrupted'
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Choose the active analyser
    let activeAnalyser = null;
    let color = '#fff';
    
    if (mode === 'user' && inputAnalyser) {
      activeAnalyser = inputAnalyser;
      color = '#10B981'; // Green
    } else if (mode === 'nova' && outputAnalyser) {
      activeAnalyser = outputAnalyser;
      color = '#8B5CF6'; // Purple
    } else if (mode === 'interrupted') {
      color = '#EF4444'; // Red
    } else if (mode === 'thinking') {
      color = '#F59E0B'; // Yellow/Amber
    } else {
      color = 'rgba(255, 255, 255, 0.2)'; // Idle grey
    }

    const dataArray = activeAnalyser 
      ? new Uint8Array(activeAnalyser.frequencyBinCount) 
      : null;

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      if (activeAnalyser && dataArray) {
        activeAnalyser.getByteFrequencyData(dataArray);
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        let barHeight = 4; // minimum idle height
        
        if (activeAnalyser && dataArray) {
          // Map frequency data (0-255) to canvas height. 
          // We sample the lower half of the frequencies as they contain most human speech energy
          const dataIndex = Math.floor((i / BAR_COUNT) * (dataArray.length * 0.5));
          const value = dataArray[dataIndex] || 0;
          const normalized = value / 255;
          
          // Apply a curve to make it look punchier
          barHeight = Math.pow(normalized, 1.5) * CANVAS_HEIGHT;
          barHeight = Math.max(4, Math.min(CANVAS_HEIGHT, barHeight));
        } else if (mode === 'thinking') {
          // Gentle pre-calculated sine wave for the "thinking" pulse state
          const time = Date.now() / 500;
          const offset = i * 0.4;
          barHeight = 4 + (Math.sin(time + offset) * 0.5 + 0.5) * 8;
        }

        const x = i * (BAR_WIDTH + BAR_GAP);
        const y = CANVAS_HEIGHT - barHeight;
        
        ctx.fillStyle = color;
        // Draw rounded bars
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barHeight, 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [mode, inputAnalyser, outputAnalyser]);

  const modeClass = `waveform--${mode || 'idle'}`;

  return (
    <div className={`waveform ${modeClass}`} aria-label="Audio visualizer" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT}
        style={{ display: 'block' }}
      />
      {mode === 'interrupted' && (
        <span className="waveform__flash">Interrupted</span>
      )}
    </div>
  );
}
